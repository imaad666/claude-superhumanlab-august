import { unpackLandmarks } from "../landmarksPack";
import type { GuideSession, SessionSample } from "../sessionTypes";
import { targetsFor } from "./targets";
import { heuristicLesson } from "./heuristicLesson";
import { saveCapturedLessons } from "./capturedLessons";
import type { LessonMemory, LessonStep } from "./types";
import type { VisemeId } from "../visemes";
import { VISEMES } from "../visemes";

const VISEME_SET = new Set(VISEMES.map((v) => v.id));

function normViseme(raw: unknown, fallback: VisemeId = "A"): VisemeId {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  const aliases: Record<string, VisemeId> = {
    AH: "A",
    AA: "A",
    EH: "E",
    EE: "I",
    IH: "I",
    OH: "O",
    OO: "U",
    UH: "A",
    MM: "M",
    B: "M",
    P: "M",
    FF: "F",
    V: "F",
    LL: "L",
    N: "L",
    D: "L",
    T: "L",
    REST: "rest",
  };
  if (VISEME_SET.has(s as VisemeId)) return s as VisemeId;
  if (aliases[s]) return aliases[s];
  if (s[0] && VISEME_SET.has(s[0] as VisemeId)) return s[0] as VisemeId;
  return fallback;
}

type ApiStep = {
  label?: string;
  speak_as?: string;
  speakAs?: string;
  viseme?: string;
  cue?: string;
  hold_ms?: number;
  holdMs?: number;
  sample_index?: number;
  sampleIndex?: number;
};

type ApiWordLesson = {
  text?: string;
  tip?: string;
  sample_index?: number;
  sampleIndex?: number;
  steps?: ApiStep[];
};

type ApiSessionLessons = {
  tip?: string;
  words?: ApiWordLesson[];
  source?: string;
  model?: string | null;
};

function uniqueWords(session: GuideSession): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of session.words) {
    const clean = w.text.replace(/[^a-zA-Z']/g, "").toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  if (!out.length) {
    for (const part of session.samples.at(-1)?.transcript.split(/\s+/) ?? []) {
      const clean = part.replace(/[^a-zA-Z']/g, "").toLowerCase();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
    }
  }
  return out.slice(0, 12);
}

function pickSampleForWord(
  samples: SessionSample[],
  word: string,
  preferredIndex?: number,
): SessionSample | null {
  if (
    preferredIndex != null &&
    preferredIndex >= 0 &&
    preferredIndex < samples.length
  ) {
    const preferred = samples[preferredIndex];
    if (preferred?.landmarks) return preferred;
  }

  const needle = word.toLowerCase();
  const withWord = samples.filter((s) =>
    s.recentWords.some((w) => w.toLowerCase().includes(needle)) ||
    s.transcript.toLowerCase().includes(needle),
  );
  const pool = withWord.length ? withWord : samples;
  const withLm = pool.filter((s) => s.landmarks);
  const candidates = withLm.length ? withLm : pool;
  if (!candidates.length) return null;

  // Prefer a clearly open / speaking frame for vowels; quieter for M-like.
  return candidates.reduce((best, s) => {
    const score =
      s.lips.openness * 0.5 + s.volume * 0.35 + (s.landmarks ? 0.2 : 0);
    const bestScore =
      best.lips.openness * 0.5 + best.volume * 0.35 + (best.landmarks ? 0.2 : 0);
    return score > bestScore ? s : best;
  });
}

function pickStepSample(
  samples: SessionSample[],
  wordSample: SessionSample | null,
  preferredIndex?: number,
): SessionSample | null {
  if (
    preferredIndex != null &&
    preferredIndex >= 0 &&
    preferredIndex < samples.length &&
    samples[preferredIndex]?.landmarks
  ) {
    return samples[preferredIndex];
  }
  if (wordSample?.landmarks) return wordSample;
  return samples.find((s) => s.landmarks) ?? wordSample ?? samples[0] ?? null;
}

function attachTeacher(
  step: LessonStep,
  sample: SessionSample | null,
): LessonStep {
  if (!sample) return step;
  const teacherLandmarks = sample.landmarks ?? null;
  const targets = teacherLandmarks
    ? {
        openness: sample.lips.openness,
        width: sample.lips.width,
        roundness: sample.lips.roundness,
        volume: Math.max(0.04, sample.volume),
      }
    : step.targets;
  return { ...step, teacherLandmarks, targets };
}

function stepsFromApi(
  raw: ApiStep[],
  samples: SessionSample[],
  wordSample: SessionSample | null,
): LessonStep[] {
  return raw.slice(0, 12).map((s, i) => {
    const viseme = normViseme(s.viseme);
    const guide = VISEMES.find((v) => v.id === viseme);
    const idx = s.sample_index ?? s.sampleIndex;
    const sample = pickStepSample(samples, wordSample, idx);
    const base: LessonStep = {
      id: `cap-${i + 1}`,
      label: (s.label || guide?.label || `S${i + 1}`).toString().slice(0, 12),
      speakAs: (s.speak_as || s.speakAs || guide?.label || "?").toString().slice(0, 16),
      viseme,
      cue: (s.cue || guide?.cue || "Match the teacher mouth").toString().slice(0, 120),
      targets: targetsFor(viseme),
      holdMs: Math.min(1600, Math.max(400, Number(s.hold_ms ?? s.holdMs ?? 650) || 650)),
    };
    return attachTeacher(base, sample);
  });
}

function heuristicWordLesson(
  word: string,
  session: GuideSession,
): LessonMemory {
  const base = heuristicLesson(word, "word");
  const sample = pickSampleForWord(session.samples, word);
  return {
    ...base,
    source: "captured",
    capturedFrom: session.id,
    tip: base.tip,
    steps: base.steps.map((step, i) => {
      // Spread nearby frames across steps when we have a dense track.
      let frame: SessionSample | null = sample;
      if (sample && session.samples.length > 1) {
        const center = session.samples.indexOf(sample);
        const offset = Math.round(
          ((i + 0.5) / Math.max(1, base.steps.length) - 0.5) * 4,
        );
        const idx = Math.min(
          session.samples.length - 1,
          Math.max(0, center + offset),
        );
        frame = session.samples[idx] ?? sample;
      }
      return attachTeacher(step, frame);
    }),
  };
}

/**
 * Ask Gemma to turn a Live Guide recording into word-by-word lessons,
 * then attach real MediaPipe teacher landmarks from the clip.
 */
export async function buildSessionLessons(
  session: GuideSession,
): Promise<{ lessons: LessonMemory[]; source: "ollama" | "heuristic"; tip: string }> {
  const words = uniqueWords(session);
  if (!words.length) {
    throw new Error("No words transcribed — record again with speech.");
  }

  const sampleSummaries = session.samples.slice(0, 48).map((s, i) => ({
    index: i,
    t_ms: s.t,
    openness: s.lips.openness,
    width: s.lips.width,
    roundness: s.lips.roundness,
    volume: s.volume,
    viseme: s.lips.visemeGuess,
    recent_words: s.recentWords.slice(-4),
    has_landmarks: Boolean(s.landmarks),
    has_lip_image: Boolean(s.lipImage),
  }));

  // A few lip crops for vision — model sees real teacher mouth.
  const keyframes = session.samples
    .map((s, i) => ({ i, s }))
    .filter(({ s }) => s.lipImage)
    .slice(0, 4)
    .map(({ i, s }) => ({
      sample_index: i,
      lip_image: s.lipImage,
      recent_words: s.recentWords.slice(-4),
    }));

  let api: ApiSessionLessons | null = null;
  try {
    await fetch("/api/wake", { method: "POST" }).catch(() => null);
    const res = await fetch("/api/session-lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: session.words.map((w) => w.text).join(" "),
        words,
        samples: sampleSummaries,
        keyframes,
      }),
    });
    if (res.ok) {
      api = (await res.json()) as ApiSessionLessons;
    }
  } catch {
    api = null;
  }

  const lessons: LessonMemory[] = [];

  if (api?.words?.length) {
    for (const w of api.words.slice(0, 12)) {
      const text = (w.text || "").trim().toLowerCase().replace(/[^a-z']/g, "");
      if (!text || !w.steps?.length) continue;
      const wordSample = pickSampleForWord(
        session.samples,
        text,
        w.sample_index ?? w.sampleIndex,
      );
      lessons.push({
        text,
        kind: "word",
        tip: (w.tip || api.tip || "Match the teacher mouth shapes.").slice(0, 160),
        steps: stepsFromApi(w.steps, session.samples, wordSample),
        source: api.source === "heuristic" ? "heuristic" : "captured",
        capturedFrom: session.id,
      });
    }
  }

  if (!lessons.length) {
    for (const word of words) {
      lessons.push(heuristicWordLesson(word, session));
    }
  }

  // Ensure every step that can has teacher vectors.
  for (const lesson of lessons) {
    for (let i = 0; i < lesson.steps.length; i += 1) {
      const step = lesson.steps[i];
      if (step.teacherLandmarks && unpackLandmarks(step.teacherLandmarks)) continue;
      const sample = pickSampleForWord(session.samples, lesson.text);
      lesson.steps[i] = attachTeacher(step, sample);
    }
  }

  saveCapturedLessons(lessons);
  return {
    lessons,
    source: api?.source === "ollama" || api?.words?.length ? "ollama" : "heuristic",
    tip:
      api?.tip ||
      `Saved ${lessons.length} word lesson${lessons.length === 1 ? "" : "s"} from this clip.`,
  };
}
