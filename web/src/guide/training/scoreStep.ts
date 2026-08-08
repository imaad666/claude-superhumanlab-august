import type { LipFeatures } from "../features";
import type { LessonAttemptResult, LessonMemory, LessonStep, StepScore } from "./types";

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Compare live lips to a lesson step — encouraging, never harsh. */
export function scoreStep(
  step: LessonStep,
  lips: LipFeatures,
  volume = 0,
): StepScore {
  const t = step.targets;
  const opennessErr = Math.abs(lips.openness - t.openness);
  const widthErr = Math.abs(lips.width - t.width);
  const roundnessErr = Math.abs(lips.roundness - t.roundness);
  const shapeErr = (opennessErr + widthErr + roundnessErr) / 3;

  let volPenalty = 0;
  if (t.volume != null && t.volume > 0.04 && volume < 0.03) {
    volPenalty = 0.12;
  }

  const err = shapeErr + volPenalty;
  let match: StepScore["match"] = "try_again";
  if (err < 0.14) match = "good";
  else if (err < 0.28) match = "close";

  const cue = shortfallCue(step, lips, opennessErr, widthErr, roundnessErr, match, volume);
  return {
    stepId: step.id,
    match,
    cue,
    opennessErr,
    widthErr,
    roundnessErr,
  };
}

function shortfallCue(
  step: LessonStep,
  lips: LipFeatures,
  oErr: number,
  wErr: number,
  rErr: number,
  match: StepScore["match"],
  volume: number,
): string {
  if (match === "good") {
    return `Nice — “${step.speakAs}” looks right.`;
  }

  const worst =
    oErr >= wErr && oErr >= rErr
      ? "open"
      : wErr >= rErr
        ? "wide"
        : "round";

  if (step.targets.volume != null && step.targets.volume > 0.04 && volume < 0.03) {
    return `Almost — add a little voice on “${step.speakAs}”.`;
  }

  if (worst === "round") {
    if (lips.roundness < step.targets.roundness) {
      return `Round lips more for “${step.speakAs}”.`;
    }
    return `Soften the roundness a bit on “${step.speakAs}”.`;
  }
  if (worst === "wide") {
    if (lips.width < step.targets.width) {
      return `Pull lips wider for “${step.speakAs}”.`;
    }
    return `Less wide — relax the sides for “${step.speakAs}”.`;
  }
  if (lips.openness < step.targets.openness) {
    return `Open a little more for “${step.speakAs}”.`;
  }
  if (lips.openness > step.targets.openness + 0.15) {
    return `Close a little for “${step.speakAs}”.`;
  }
  return step.cue;
}

/**
 * Score a recreate pass: peak lips sampled per step window.
 * `samples` is ordered list of { stepIndex, lips, volume } captured during recreate.
 */
export function scoreAttempt(
  lesson: LessonMemory,
  perStepBest: Array<{ lips: LipFeatures; volume: number } | null>,
): LessonAttemptResult {
  const scores: StepScore[] = lesson.steps.map((step, i) => {
    const sample = perStepBest[i];
    if (!sample) {
      return {
        stepId: step.id,
        match: "try_again" as const,
        cue: `Let’s try “${step.speakAs}” again — watch first if you need.`,
        opennessErr: 1,
        widthErr: 1,
        roundnessErr: 1,
      };
    }
    return scoreStep(step, sample.lips, sample.volume);
  });

  const good = scores.filter((s) => s.match === "good").length;
  const close = scores.filter((s) => s.match === "close").length;
  const ratio = scores.length ? (good + close * 0.55) / scores.length : 0;

  let overall: LessonAttemptResult["overall"] = "try_again";
  if (ratio >= 0.72) overall = "good";
  else if (ratio >= 0.42) overall = "close";

  const firstMiss = scores.find((s) => s.match !== "good");
  const summary =
    overall === "good"
      ? `Beautiful work on “${lesson.text}” — you matched the shapes.`
      : overall === "close"
        ? `Close on “${lesson.text}”! ${firstMiss?.cue ?? "One more slow try."}`
        : `Keep going — ${firstMiss?.cue ?? "Watch again, then recreate slowly."}`;

  return { overall, scores, summary };
}

export function scoreQuality(match: StepScore["match"]): number {
  if (match === "good") return 1;
  if (match === "close") return 0.55;
  return 0.15;
}

export function shapeDistance(lips: LipFeatures, step: LessonStep): number {
  const t = step.targets;
  return clamp01(
    (Math.abs(lips.openness - t.openness) +
      Math.abs(lips.width - t.width) +
      Math.abs(lips.roundness - t.roundness)) /
      3,
  );
}
