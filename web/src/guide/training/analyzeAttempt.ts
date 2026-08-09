import type { ExpressionFeatures, LipFeatures } from "../features";
import type {
  LessonAttemptFeedback,
  LessonAttemptResult,
  LessonMemory,
} from "./types";

export type LessonAttemptSample = {
  lips: LipFeatures;
  volume: number;
  pitchHint: number;
  voicedMs?: number;
  sampleCount?: number;
  lipImage?: string | null;
  expression?: ExpressionFeatures | null;
};

type ApiFeedback = {
  summary?: string;
  maneuver?: string;
  sound?: string;
  stress?: string;
  stress_status?: string;
  stressStatus?: string;
  next_action?: string;
  nextAction?: string;
  focus?: string;
  source?: string;
  model?: string | null;
  used_vision?: boolean;
  usedVision?: boolean;
};

/**
 * Ask the local brain for a short, post-attempt explanation. The caller has
 * already shown the instant local score, so this may return at model speed.
 */
export async function analyzeLessonAttempt(
  lesson: LessonMemory,
  result: LessonAttemptResult,
  samples: Array<LessonAttemptSample | null>,
  transcript: string,
): Promise<LessonAttemptFeedback> {
  // A few representative crops are enough for the local VLM and keep the
  // result recap responsive on laptop hardware.
  const imageIndexes = new Set(
    result.scores
      .map((score, index) => ({
        index,
        quality:
          score.match === "good"
            ? 2
            : score.match === "close"
              ? 1
              : 0,
      }))
      .sort((a, b) => a.quality - b.quality)
      .slice(0, 1)
      .map(({ index }) => index),
  );

  const payload = {
    text: lesson.text,
    kind: lesson.kind,
    transcript,
    transcript_available: Boolean(transcript.trim()),
    overall: result.overall,
    steps: lesson.steps.map((step, index) => {
      const score = result.scores[index];
      const sample = samples[index];
      return {
        label: step.label,
        speak_as: step.speakAs,
        viseme: step.viseme,
        target: {
          openness: step.targets.openness,
          width: step.targets.width,
          roundness: step.targets.roundness,
          volume: step.targets.volume ?? 0.1,
        },
        observed: sample
          ? {
              openness: sample.lips.openness,
              width: sample.lips.width,
              roundness: sample.lips.roundness,
              volume: sample.volume,
              pitch_hint: sample.pitchHint,
              voiced_ms: sample.voicedMs ?? 0,
              sample_count: sample.sampleCount ?? 0,
              smile: sample.expression?.smile ?? 0,
              jaw_open: sample.expression?.jawOpen ?? 0,
              mouth_funnel: sample.expression?.mouthFunnel ?? 0,
              brow_up: sample.expression?.browUp ?? 0,
              brow_down: sample.expression?.browDown ?? 0,
              openness_err: score?.opennessErr ?? 0,
              width_err: score?.widthErr ?? 0,
              roundness_err: score?.roundnessErr ?? 0,
            }
          : null,
        local_match: score?.match ?? "try_again",
        shape_match: score?.shapeMatch ?? "try_again",
        needs_voice: score?.needsVoice ?? true,
        voice_ok: score?.voiceOk ?? false,
        lip_image:
          imageIndexes.has(index) && sample?.lipImage ? sample.lipImage : null,
      };
    }),
  };

  const res = await fetch("/api/lesson-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Lesson feedback failed (${res.status})`);
  const data = (await res.json()) as ApiFeedback;
  const focus =
    data.focus === "sound" || data.focus === "stress" ? data.focus : "maneuver";
  const stressStatus = data.stress_status ?? data.stressStatus;

  return {
    summary: data.summary ?? result.summary,
    maneuver: data.maneuver ?? "Match the target mouth shape one sound at a time.",
    sound: data.sound ?? "Speak each sound clearly enough for the microphone to hear.",
    stress: data.stress ?? "Keep a steady rhythm, then let the important syllable lead.",
    stressStatus:
      stressStatus === "on_target" || stressStatus === "needs_work"
        ? stressStatus
        : "unavailable",
    nextAction: data.next_action ?? data.nextAction ?? "Try it once more, slowly.",
    focus,
    source: data.source === "ollama" ? "ollama" : "heuristic",
    model: data.model ?? null,
    usedVision: Boolean(data.used_vision ?? data.usedVision),
  };
}
