import type { ExpressionFeatures, LipFeatures } from "../features";
import type {
  LessonAttemptResult,
  LessonMemory,
  LessonStep,
  StepMetrics,
  StepScore,
} from "./types";

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Quiet closures (M) vs voiced vowels/sounds that need audible voice. */
export function stepNeedsVoice(step: LessonStep): boolean {
  const v = step.targets.volume ?? 0.1;
  if (step.viseme === "M" || step.viseme === "rest") return false;
  return v > 0.045;
}

function needsVoice(step: LessonStep): boolean {
  return stepNeedsVoice(step);
}

function voiceHeard(
  step: LessonStep,
  volume: number,
  spokenHit: boolean,
): boolean {
  if (spokenHit) return true;
  if (!needsVoice(step)) {
    return true;
  }
  const floor = Math.max(0.055, (step.targets.volume ?? 0.1) * 0.45);
  return volume >= floor;
}

function spokenMatches(step: LessonStep, spokenHint: string): boolean {
  const tokens = spokenHint
    .toLowerCase()
    .replace(/[^a-z\s']/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-8);
  if (!tokens.length) return false;
  const hay = tokens.join(" ");
  const needles = [step.speakAs, step.label, step.viseme]
    .map((s) => s.toLowerCase().replace(/[^a-z']/g, ""))
    .filter((s) => s.length >= 1);
  return needles.some((n) => n.length >= 2 && hay.includes(n));
}

function buildMetrics(
  step: LessonStep,
  lips: LipFeatures,
  volume: number,
  pitchHint = 0,
  expression: ExpressionFeatures | null = null,
): StepMetrics {
  return {
    target: {
      open: clamp01(step.targets.openness),
      wide: clamp01(step.targets.width),
      round: clamp01(step.targets.roundness),
      vol: clamp01(step.targets.volume ?? 0.1),
    },
    observed: {
      open: clamp01(lips.openness),
      wide: clamp01(lips.width),
      round: clamp01(lips.roundness),
      vol: clamp01(volume),
      pitch: clamp01(pitchHint),
      smile: clamp01(expression?.smile ?? 0),
      jaw: clamp01(expression?.jawOpen ?? 0),
      funnel: clamp01(expression?.mouthFunnel ?? 0),
    },
  };
}

/**
 * Compare live lips + voice to a lesson step.
 * Shape and sound both matter for voiced targets.
 */
export function scoreStep(
  step: LessonStep,
  lips: LipFeatures,
  volume = 0,
  spokenHint = "",
  pitchHint = 0,
  expression: ExpressionFeatures | null = null,
): StepScore {
  const t = step.targets;
  const opennessErr = Math.abs(lips.openness - t.openness);
  const widthErr = Math.abs(lips.width - t.width);
  const roundnessErr = Math.abs(lips.roundness - t.roundness);
  const shapeErr = (opennessErr + widthErr + roundnessErr) / 3;

  const spokenHit = spokenMatches(step, spokenHint);
  const voiceOk = voiceHeard(step, volume, spokenHit);

  let shapeMatch: StepScore["match"] = "try_again";
  if (shapeErr < 0.16) shapeMatch = "good";
  else if (shapeErr < 0.3) shapeMatch = "close";

  let match: StepScore["match"] = shapeMatch;
  if (needsVoice(step) && !voiceOk) {
    if (shapeMatch === "good") match = "close";
    else if (shapeMatch === "close" && shapeErr > 0.22) match = "try_again";
  }
  if (spokenHit && shapeMatch !== "try_again") {
    if (match === "close" && shapeErr < 0.24) match = "good";
  }

  const cue = shortfallCue(
    step,
    lips,
    opennessErr,
    widthErr,
    roundnessErr,
    match,
    voiceOk,
    spokenHit,
  );
  return {
    stepId: step.id,
    match,
    shapeMatch,
    needsVoice: needsVoice(step),
    voiceOk,
    cue,
    opennessErr,
    widthErr,
    roundnessErr,
    metrics: buildMetrics(step, lips, volume, pitchHint, expression),
  };
}

function shortfallCue(
  step: LessonStep,
  lips: LipFeatures,
  oErr: number,
  wErr: number,
  rErr: number,
  match: StepScore["match"],
  voiceOk: boolean,
  spokenHit: boolean,
): string {
  if (match === "good") {
    if (spokenHit) return `Heard “${step.speakAs}” — mouth looks right.`;
    return `Nice — “${step.speakAs}” looks and sounds right.`;
  }

  if (needsVoice(step) && !voiceOk) {
    return `Say “${step.speakAs}” out loud while you hold the shape.`;
  }

  if (wErr >= oErr && wErr >= rErr) {
    if (lips.width < step.targets.width - 0.12) {
      return `Widen your smile for “${step.speakAs}”.`;
    }
    return `Bring the corners in a little for “${step.speakAs}”.`;
  }
  if (rErr >= oErr && rErr >= wErr) {
    if (lips.roundness < step.targets.roundness - 0.12) {
      return `Round your lips more for “${step.speakAs}”.`;
    }
    return `Relax the round for “${step.speakAs}”.`;
  }
  if (lips.openness < step.targets.openness - 0.15) {
    return `Open a little more for “${step.speakAs}”.`;
  }
  if (lips.openness > step.targets.openness + 0.15) {
    return `Close a little for “${step.speakAs}”.`;
  }
  return step.cue;
}

type AttemptSample = {
  lips: LipFeatures;
  volume: number;
  pitchHint?: number;
  expression?: ExpressionFeatures | null;
};

/**
 * Score a recreate pass: peak lips sampled per step window.
 */
export function scoreAttempt(
  lesson: LessonMemory,
  perStepBest: Array<AttemptSample | null>,
): LessonAttemptResult {
  const scores: StepScore[] = lesson.steps.map((step, i) => {
    const sample = perStepBest[i];
    if (!sample) {
      return {
        stepId: step.id,
        match: "try_again" as const,
        shapeMatch: "try_again" as const,
        needsVoice: needsVoice(step),
        voiceOk: false,
        cue: `Let’s try “${step.speakAs}” again — speak it while shaping your mouth.`,
        opennessErr: 1,
        widthErr: 1,
        roundnessErr: 1,
        metrics: buildMetrics(
          step,
          { openness: 0, width: 0, roundness: 0, visemeGuess: "rest" },
          0,
          0,
          null,
        ),
      };
    }
    return scoreStep(
      step,
      sample.lips,
      sample.volume,
      "",
      sample.pitchHint ?? 0,
      sample.expression ?? null,
    );
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
      ? `Beautiful work on “${lesson.text}” — lips and voice lined up.`
      : overall === "close"
        ? `Close on “${lesson.text}”! ${firstMiss?.cue ?? "One more slow try."}`
        : `Keep going — ${firstMiss?.cue ?? "Shape the mouth and say it out loud."}`;

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

export function isVoiceActive(volume: number): boolean {
  return volume >= 0.055;
}
