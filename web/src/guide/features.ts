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

function dist(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
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

  return {
    openness: Math.min(1, openness / (faceW * 0.35)),
    width: Math.min(1, width / (faceW * 0.55)),
    roundness: Math.min(1, roundness * 1.2),
    visemeGuess: visemeFromText(transcriptHint),
  };
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

/** Expression / mood factor from MediaPipe blendshapes (no extra CV lib). */
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
