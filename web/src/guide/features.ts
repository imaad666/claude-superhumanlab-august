import type { Point } from "./lips";
import type { VisemeId } from "./visemes";
import { visemeFromText } from "./visemes";

export type LipFeatures = {
  openness: number;
  width: number;
  roundness: number;
  visemeGuess: VisemeId;
};

export type ExpressionFeatures = {
  smile: number;
  browUp: number;
  browDown: number;
  jawOpen: number;
  mouthFunnel: number;
};

export type BlendshapeScore = { categoryName: string; score: number };

export type MouthPaths = {
  outer: string;
  opening: string;
};

function dist(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clamp(n: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, n));
}

/** Compact lip geometry for the local brain — not raw video. */
export function lipFeaturesFromLandmarks(
  landmarks: Point[] | null,
  transcriptHint = "",
): LipFeatures {
  if (!landmarks?.length) {
    return {
      openness: 0,
      width: 0,
      roundness: 0,
      visemeGuess: visemeFromText(transcriptHint),
    };
  }

  const left = landmarks[61];
  const right = landmarks[291];
  const top = landmarks[13];
  const bottom = landmarks[14];
  if (!left || !right || !top || !bottom) {
    return {
      openness: 0,
      width: 0,
      roundness: 0,
      visemeGuess: visemeFromText(transcriptHint),
    };
  }

  const width = dist(left, right);
  const openness = dist(top, bottom);
  const roundness = width > 0.001 ? Math.min(1, openness / width) : 0;

  const cheekL = landmarks[234];
  const cheekR = landmarks[454];
  const faceW =
    cheekL && cheekR ? Math.max(0.15, dist(cheekL, cheekR)) : 0.35;

  const features = {
    openness: clamp(openness / (faceW * 0.35)),
    width: clamp(width / (faceW * 0.55)),
    roundness: clamp(roundness * 1.2),
    visemeGuess: "rest" as VisemeId,
  };

  features.visemeGuess = visemeFromLipGeometry(features);
  return features;
}

/** Classify mouth shape from MediaPipe geometry (not transcript). */
export function visemeFromLipGeometry(
  lips: Pick<LipFeatures, "openness" | "width" | "roundness">,
  expression?: ExpressionFeatures | null,
): VisemeId {
  const funnel = expression?.mouthFunnel ?? 0;
  const smile = expression?.smile ?? 0;
  const jaw = Math.max(expression?.jawOpen ?? 0, lips.openness);

  if (lips.openness < 0.1 && funnel < 0.15) return "M";
  if (funnel > 0.35 || (lips.roundness > 0.55 && lips.width < 0.55)) {
    return lips.openness < 0.28 ? "U" : "O";
  }
  if (smile > 0.4 || lips.width > 0.7) {
    return jaw > 0.35 ? "E" : "I";
  }
  if (jaw > 0.45 || lips.openness > 0.42) return "A";
  if (lips.openness > 0.18 && lips.width > 0.45) return "E";
  if (lips.openness > 0.12) return "L";
  return "rest";
}

/**
 * Build SVG mouth paths that track MediaPipe lip metrics in real time.
 * viewBox is 0 0 120 120, center ~ (60, 60).
 */
export function mouthPathsFromFeatures(
  lips: LipFeatures,
  expression?: ExpressionFeatures | null,
): MouthPaths {
  const funnel = expression?.mouthFunnel ?? 0;
  const smile = expression?.smile ?? 0;
  const jaw = Math.max(expression?.jawOpen ?? 0, lips.openness);

  // Horizontal span of outer lips
  const halfW = 18 + lips.width * 28 + smile * 8 - funnel * 10;
  // Vertical span
  const halfH = 6 + jaw * 26 + lips.openness * 10 + funnel * 4;
  // Corner lift for smile
  const cornerY = 58 - smile * 6 + (1 - lips.width) * 2;
  const topY = 60 - halfH * 0.9;
  const botY = 60 + halfH * 1.05;
  const leftX = 60 - halfW;
  const rightX = 60 + halfW;

  const outer = [
    `M ${leftX.toFixed(1)} ${cornerY.toFixed(1)}`,
    `C ${(60 - halfW * 0.45).toFixed(1)} ${topY.toFixed(1)},`,
    `${(60 + halfW * 0.45).toFixed(1)} ${topY.toFixed(1)},`,
    `${rightX.toFixed(1)} ${cornerY.toFixed(1)}`,
    `C ${(60 + halfW * 0.55).toFixed(1)} ${botY.toFixed(1)},`,
    `${(60 - halfW * 0.55).toFixed(1)} ${botY.toFixed(1)},`,
    `${leftX.toFixed(1)} ${cornerY.toFixed(1)} Z`,
  ].join(" ");

  const openW = halfW * (0.35 + lips.openness * 0.45 + funnel * 0.15);
  const openH = Math.max(1.5, halfH * (0.25 + jaw * 0.7));
  const oLeft = 60 - openW;
  const oRight = 60 + openW;
  const oTop = 60 - openH * 0.85;
  const oBot = 60 + openH * 0.95;

  const opening = [
    `M ${oLeft.toFixed(1)} 60`,
    `C ${(60 - openW * 0.4).toFixed(1)} ${oTop.toFixed(1)},`,
    `${(60 + openW * 0.4).toFixed(1)} ${oTop.toFixed(1)},`,
    `${oRight.toFixed(1)} 60`,
    `C ${(60 + openW * 0.4).toFixed(1)} ${oBot.toFixed(1)},`,
    `${(60 - openW * 0.4).toFixed(1)} ${oBot.toFixed(1)},`,
    `${oLeft.toFixed(1)} 60 Z`,
  ].join(" ");

  return { outer, opening };
}

function scoreByNames(
  blendshapes: BlendshapeScore[] | null | undefined,
  names: string[],
) {
  if (!blendshapes?.length) return 0;
  let total = 0;
  let hit = 0;
  for (const item of blendshapes) {
    if (names.includes(item.categoryName)) {
      total += item.score;
      hit += 1;
    }
  }
  return hit ? Math.min(1, total / hit) : 0;
}

/** Expression / mood factor from MediaPipe blendshapes. */
export function expressionFromBlendshapes(
  blendshapes: BlendshapeScore[] | null | undefined,
): ExpressionFeatures {
  return {
    smile: scoreByNames(blendshapes, ["mouthSmileLeft", "mouthSmileRight"]),
    browUp: scoreByNames(blendshapes, [
      "browInnerUp",
      "browOuterUpLeft",
      "browOuterUpRight",
    ]),
    browDown: scoreByNames(blendshapes, ["browDownLeft", "browDownRight"]),
    jawOpen: scoreByNames(blendshapes, ["jawOpen"]),
    mouthFunnel: scoreByNames(blendshapes, ["mouthFunnel", "mouthPucker"]),
  };
}
