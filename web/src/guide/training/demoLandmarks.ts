import type { Point } from "../lips";
import type { VisemeId } from "../visemes";
import { mediapipePoseForViseme } from "./visemePoses";

/** @deprecated Prefer mediapipePoseForViseme — kept for session hook compat. */
export function demoLandmarksForViseme(viseme: VisemeId): Point[] {
  return mediapipePoseForViseme(viseme);
}
