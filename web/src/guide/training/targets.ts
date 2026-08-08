import type { StepTargets } from "./types";
import type { VisemeId } from "../visemes";

/** Ideal lip geometry per viseme — used for watch demo + scoring. */
export const VISEME_TARGETS: Record<VisemeId, StepTargets> = {
  rest: { openness: 0.06, width: 0.35, roundness: 0.12, volume: 0 },
  A: { openness: 0.55, width: 0.42, roundness: 0.35, volume: 0.12 },
  E: { openness: 0.28, width: 0.62, roundness: 0.18, volume: 0.1 },
  I: { openness: 0.22, width: 0.72, roundness: 0.12, volume: 0.1 },
  O: { openness: 0.38, width: 0.32, roundness: 0.62, volume: 0.11 },
  U: { openness: 0.22, width: 0.26, roundness: 0.72, volume: 0.1 },
  M: { openness: 0.04, width: 0.4, roundness: 0.08, volume: 0.06 },
  F: { openness: 0.16, width: 0.48, roundness: 0.2, volume: 0.08 },
  L: { openness: 0.32, width: 0.45, roundness: 0.22, volume: 0.1 },
};

export function targetsFor(viseme: VisemeId): StepTargets {
  return { ...VISEME_TARGETS[viseme] };
}
