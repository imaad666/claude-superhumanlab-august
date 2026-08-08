import type { ExpressionFeatures, LipFeatures } from "./features";
import type { GuideMode, ToneKind } from "./types";

export type BrainInsight = {
  tone: ToneKind;
  mood: string;
  intention: string;
  summary: string;
  lipMatch: "good" | "close" | "try_again";
  lipCue: string;
  words: { text: string; tone: ToneKind; tip?: string | null }[];
  source: "ollama" | "heuristic";
  model: string | null;
};

type HeuristicInput = {
  mode: GuideMode;
  transcript: string;
  recentWords: string[];
  lips: LipFeatures;
  volume: number;
  pitchHint: number;
  expression: ExpressionFeatures;
  coachTarget: string | null;
};

type Match = BrainInsight["lipMatch"];

function lipCoaching(
  target: string,
  lips: LipFeatures,
  funnel: number,
  jaw: number,
): { match: Match; cue: string } {
  const t = target.toUpperCase();
  if (t === "O" || t === "OH") {
    if (funnel > 0.2 || lips.roundness > 0.4) {
      return { match: "good", cue: "Nice round lips — keep that circle." };
    }
    if (lips.roundness > 0.22) {
      return {
        match: "close",
        cue: "Almost — purse lips a bit more into a soft O.",
      };
    }
    return { match: "try_again", cue: "Round your lips like saying “oh.”" };
  }
  if (t === "U" || t === "OO") {
    if (funnel > 0.22 || (lips.roundness > 0.42 && lips.openness < 0.4)) {
      return { match: "good", cue: "Tight round “oo” — looking good." };
    }
    return {
      match: "close",
      cue: "Smaller round opening — push lips forward a little.",
    };
  }
  if (t === "A" || t === "AH") {
    if (jaw > 0.28 || lips.openness > 0.32) {
      return { match: "good", cue: "Jaw open — clear “ah.”" };
    }
    return { match: "close", cue: "Drop your jaw a bit more for “ah.”" };
  }
  if (t === "E" || t === "EH" || t === "I" || t === "EE") {
    if (lips.width > 0.38) {
      return { match: "good", cue: "Wide smile shape — nice." };
    }
    return { match: "close", cue: "Pull lips wider to the sides." };
  }
  if (t === "M" || t === "MM" || t === "B" || t === "P") {
    if (lips.openness < 0.14) {
      return { match: "good", cue: "Lips together — perfect for “mm.”" };
    }
    return { match: "try_again", cue: "Press lips gently closed." };
  }
  if (t === "F" || t === "V") {
    if (lips.openness > 0.08 && lips.openness < 0.35) {
      return { match: "close", cue: "Upper teeth lightly on lower lip." };
    }
    return { match: "try_again", cue: "Bite gently on the lower lip for “f.”" };
  }
  if (lips.openness > 0.12 || lips.width > 0.28) {
    return { match: "close", cue: "Keep going — match the coach mouth." };
  }
  return { match: "close", cue: "Relax, then copy the coach shape." };
}

/** Instant on-device brain — mirrors server heuristic with friendlier thresholds. */
export function analyzeHeuristic(input: HeuristicInput): BrainInsight {
  const { volume: vol, pitchHint: pitch, expression, lips, mode } = input;
  const smile = expression.smile;
  const browDown = expression.browDown;
  const browUp = expression.browUp;
  const funnel = expression.mouthFunnel;
  const jaw = Math.max(expression.jawOpen, lips.openness);
  const speaking = vol > 0.04 || lips.openness > 0.12 || jaw > 0.15;

  let tone: ToneKind = "calm";
  if (!speaking) tone = "soft";
  else if (pitch > 0.42 && vol > 0.08) tone = "bright";
  else if (smile > 0.28 || (vol > 0.06 && pitch > 0.28)) tone = "warm";
  else if (vol < 0.06) tone = "soft";

  let mood = "neutral";
  if (!speaking) mood = "tired";
  else if (smile > 0.35 && vol > 0.05) mood = pitch > 0.38 ? "playful" : "encouraging";
  else if (browDown > 0.28) mood = "serious";
  else if (browUp > 0.22 && pitch > 0.3) mood = "curious";
  else if (vol > 0.05) mood = "encouraging";

  const text = (input.transcript || input.recentWords.join(" "))
    .trim()
    .toLowerCase();
  let intention = mode === "trainer" ? "practicing" : "unknown";
  if (
    text.includes("?") ||
    /^(what|why|how|when|where|who|can|do |is |are )\b/.test(text)
  ) {
    intention = "asking";
  } else if (/\b(hi|hello|hey|good morning|namaste)\b/.test(text)) {
    intention = "greeting";
  } else if (tone === "bright") {
    intention = "emphasizing";
  } else if (text.split(/\s+/).filter(Boolean).length > 5) {
    intention = "explaining";
  }

  const target = (input.coachTarget || lips.visemeGuess || "rest").toUpperCase();
  const { match: lipMatch, cue: lipCue } = lipCoaching(
    target,
    lips,
    funnel,
    jaw,
  );

  const summary =
    mode === "trainer"
      ? speaking
        ? `Voice feels ${tone}, mood reads ${mood}. ${lipCue}`
        : `Waiting for your voice — try the ${target === "REST" ? "Ah" : target} shape.`
      : speaking
        ? `They sound ${tone} and ${mood}, likely ${intention}.`
        : `Listening for speech…`;

  const words = input.recentWords.slice(-12).map((w, i, arr) => ({
    text: w,
    tone,
    tip: i === arr.length - 1 ? lipCue : null,
  }));

  return {
    tone,
    mood,
    intention,
    summary,
    lipMatch,
    lipCue,
    words,
    source: "heuristic",
    model: null,
  };
}
