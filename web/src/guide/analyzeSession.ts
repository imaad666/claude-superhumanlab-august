import { analyzeHeuristic } from "./brainHeuristic";
import type { BrainInsight } from "./brainHeuristic";
import type {
  GuideSession,
  SessionAnalysis,
  SessionSample,
  SessionSegment,
} from "./sessionTypes";
import type { ToneKind } from "./types";

type AnalyzeApiResponse = {
  tone: ToneKind;
  mood: string;
  intention: string;
  summary: string;
  lip_match: "good" | "close" | "try_again";
  lip_cue: string;
  words?: { text: string; tone: ToneKind; tip?: string | null }[];
  source: "ollama" | "heuristic";
  model?: string | null;
  used_vision?: boolean;
};

const MAX_SEGMENTS = 5;

function isSpeaking(sample: SessionSample): boolean {
  return (
    sample.volume > 0.03 ||
    sample.lips.openness > 0.1 ||
    sample.expression.jawOpen > 0.12 ||
    sample.recentWords.length > 0 ||
    Boolean(sample.landmarks) ||
    Boolean(sample.lipImage)
  );
}

/** Pick evenly spaced speaking samples (prefer ones with lip crops). */
export function pickKeySamples(samples: SessionSample[]): SessionSample[] {
  if (!samples.length) return [];

  const scored = samples.filter(
    (s) => isSpeaking(s) || Boolean(s.lipImage) || s.transcript.trim(),
  );
  const pool = scored.length ? scored : samples;

  if (pool.length <= MAX_SEGMENTS) return pool;

  const picks: SessionSample[] = [];
  for (let i = 0; i < MAX_SEGMENTS; i += 1) {
    const idx = Math.round((i * (pool.length - 1)) / (MAX_SEGMENTS - 1));
    picks.push(pool[idx]);
  }
  // de-dupe by timestamp
  const seen = new Set<number>();
  return picks.filter((s) => {
    if (seen.has(s.t)) return false;
    seen.add(s.t);
    return true;
  });
}

function heuristicFromSample(sample: SessionSample): BrainInsight {
  return analyzeHeuristic({
    mode: "live",
    transcript: sample.transcript,
    recentWords: sample.recentWords,
    lips: sample.lips,
    volume: sample.volume,
    pitchHint: sample.pitchHint,
    expression: sample.expression,
    coachTarget: sample.lips.visemeGuess,
  });
}

async function analyzeSample(sample: SessionSample): Promise<BrainInsight> {
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "live",
        transcript: sample.transcript,
        recent_words: sample.recentWords.slice(-12),
        lips: {
          openness: sample.lips.openness,
          width: sample.lips.width,
          roundness: sample.lips.roundness,
          viseme_guess: sample.lips.visemeGuess,
        },
        audio: {
          volume: sample.volume,
          pitch_hint: sample.pitchHint,
        },
        expression: {
          smile: sample.expression.smile,
          brow_up: sample.expression.browUp,
          brow_down: sample.expression.browDown,
          jaw_open: sample.expression.jawOpen,
          mouth_funnel: sample.expression.mouthFunnel,
        },
        coach_target: sample.lips.visemeGuess,
        lip_image: sample.lipImage,
      }),
    });
    if (!res.ok) throw new Error(`Analyze failed (${res.status})`);
    const data = (await res.json()) as AnalyzeApiResponse;
    return {
      tone: data.tone,
      mood: data.mood,
      intention: data.intention,
      summary: data.summary,
      lipMatch: data.lip_match,
      lipCue: data.lip_cue,
      words: data.words ?? [],
      source: data.source,
      model: data.model ?? null,
      usedVision: Boolean(data.used_vision),
    };
  } catch {
    // Brain offline — still return a useful local readout.
    return heuristicFromSample(sample);
  }
}

function modeOf<T extends string>(values: T[], fallback: T): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = fallback;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function aggregate(segments: SessionSegment[], words: GuideSession["words"]): BrainInsight {
  if (!segments.length) {
    return {
      tone: "soft",
      mood: "neutral",
      intention: "unknown",
      summary:
        "No speech moments in this take — record longer with the face in frame, then stop.",
      lipMatch: "close",
      lipCue: "Point the camera at their mouth while they speak.",
      words: words.slice(-12).map((w) => ({ text: w.text, tone: w.tone })),
      source: "heuristic",
      model: null,
      usedVision: false,
    };
  }

  const insights = segments.map((s) => s.insight);
  const tone = modeOf(
    insights.map((i) => i.tone),
    insights[0].tone,
  );
  const mood = modeOf(
    insights.map((i) => i.mood),
    insights[0].mood,
  );
  const intention = modeOf(
    insights.map((i) => i.intention),
    insights[0].intention,
  );
  const usedVision = insights.some((i) => i.usedVision);
  const fromOllama = insights.find((i) => i.source === "ollama");
  const lastCue = insights.at(-1)?.lipCue ?? "";

  const summary =
    insights.length === 1
      ? insights[0].summary
      : `Across the session they mostly sounded ${tone} and ${mood}, often ${intention}.`;

  return {
    tone,
    mood,
    intention,
    summary,
    lipMatch: modeOf(
      insights.map((i) => i.lipMatch),
      insights[0].lipMatch,
    ),
    lipCue: lastCue,
    words: (fromOllama?.words.length ? fromOllama.words : insights.at(-1)?.words) ??
      words.slice(-12).map((w) => ({ text: w.text, tone })),
    source: fromOllama?.source ?? insights[0].source,
    model: fromOllama?.model ?? insights[0].model,
    usedVision,
  };
}

/**
 * Run the vision brain on a finished Live Guide recording (not live).
 */
export async function analyzeSession(
  session: GuideSession,
  onProgress?: (done: number, total: number) => void,
): Promise<SessionAnalysis> {
  const keys = pickKeySamples(session.samples);
  const segments: SessionSegment[] = [];

  for (let i = 0; i < keys.length; i += 1) {
    onProgress?.(i, keys.length);
    const sample = keys[i];
    try {
      const insight = await analyzeSample(sample);
      segments.push({ t: sample.t, insight });
    } catch {
      // skip failed segment; continue
    }
  }
  onProgress?.(keys.length, keys.length);

  return {
    overall: aggregate(segments, session.words),
    segments,
    sampleCount: session.samples.length,
    analyzedCount: segments.length,
  };
}
