import type { Point } from "../lips";
import { ALL_LIP_INDEXES, INNER_LIP, OUTER_LIP } from "../lips";
import type { StepTargets } from "./types";
import type { VisemeId } from "../visemes";
import { targetsFor } from "./targets";

/**
 * Synthetic MediaPipe landmarks for Watch-phase 3D lip mesh.
 *
 * OUTER_LIP / INNER_LIP are clockwise:
 *   0..mid  = left corner → upper lip → right corner
 *   mid..n  = right corner → lower lip → left corner
 * A plain ellipse in index order twists the ribbon — we place arcs explicitly.
 */
export function demoLandmarksForViseme(viseme: VisemeId): Point[] {
  return demoLandmarksForTargets(targetsFor(viseme));
}

export function demoLandmarksForTargets(targets: StepTargets): Point[] {
  const points: Point[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.55,
    z: 0,
  }));

  const cx = 0.5;
  const cy = 0.56;

  // Map 0–1 feature targets → image-space mouth size
  const halfW = 0.048 + targets.width * 0.055;
  // Round vowels pull corners in (smaller width visually) while staying open
  const roundSqueeze = targets.roundness * 0.012;
  const rx = Math.max(0.028, halfW - roundSqueeze);
  const open = 0.008 + targets.openness * 0.055;
  const roundZ = targets.roundness * 0.035;
  // Upper lip is slightly thinner than lower
  const upperRy = open * (0.55 + targets.roundness * 0.15);
  const lowerRy = open * (0.75 + (1 - targets.roundness) * 0.1);

  const set = (index: number, x: number, y: number, z = 0) => {
    points[index] = { x, y, z };
  };

  // Cheeks — LipMesh3D uses these for face-width scale
  set(234, cx - rx * 2.4, cy, 0.015);
  set(454, cx + rx * 2.4, cy, 0.015);

  const placeLipRing = (
    indexes: readonly number[],
    scaleX: number,
    scaleUpperY: number,
    scaleLowerY: number,
    zBase: number,
  ) => {
    const n = indexes.length;
    // MediaPipe lip rings: first half-ish upper L→R, rest lower R→L
    const upperCount = Math.ceil(n / 2);
    const lowerCount = n - upperCount;

    for (let i = 0; i < upperCount; i += 1) {
      const t = upperCount === 1 ? 0.5 : i / (upperCount - 1); // 0 left → 1 right
      const ang = Math.PI - t * Math.PI; // π → 0 (upper semicircle)
      const x = cx + Math.cos(ang) * scaleX;
      // Flatten top a bit so it's lip-like, not a perfect circle
      const arch = Math.sin(t * Math.PI); // 0 at corners, 1 at center
      const y = cy - scaleUpperY * (0.35 + 0.65 * arch);
      const z =
        zBase -
        roundZ * (0.35 + 0.65 * (1 - Math.abs(t - 0.5) * 2)); // forward at center when round
      set(indexes[i], x, y, z);
    }

    for (let i = 0; i < lowerCount; i += 1) {
      const t = lowerCount === 1 ? 0.5 : i / (lowerCount - 1); // 0 right → 1 left
      const ang = 0 - t * Math.PI; // 0 → -π (lower semicircle R→L)
      const x = cx + Math.cos(ang) * scaleX;
      const arch = Math.sin(t * Math.PI);
      const y = cy + scaleLowerY * (0.4 + 0.6 * arch);
      const z = zBase - roundZ * 0.25 * arch;
      set(indexes[upperCount + i], x, y, z);
    }
  };

  placeLipRing(OUTER_LIP, rx, upperRy, lowerRy, 0.012);
  placeLipRing(
    INNER_LIP,
    rx * 0.72,
    upperRy * 0.7,
    lowerRy * 0.7,
    -0.008,
  );

  // Key landmarks LipMesh3D / features read directly
  set(61, cx - rx, cy, roundZ * 0.4);
  set(291, cx + rx, cy, roundZ * 0.4);
  set(13, cx, cy - upperRy * 0.95, -0.004); // inner upper
  set(14, cx, cy + lowerRy * 0.95, -0.004); // inner lower
  set(0, cx, cy - upperRy * 1.05, 0.002); // outer upper mid
  set(17, cx, cy + lowerRy * 1.05, 0.002); // outer lower mid

  // Remaining lip indexes: blend toward nearest outer/inner if unset-looking
  const placed = new Set<number>([...OUTER_LIP, ...INNER_LIP, 61, 291, 13, 14, 0, 17, 234, 454]);
  for (const index of ALL_LIP_INDEXES) {
    if (placed.has(index)) continue;
    // Mild mid-lip default between outer corners
    set(index, cx, cy, 0);
  }

  // Bridge points between outer and inner (upper/lower mid bands)
  // Approximate a few common mid-lip indexes for smoother ribbon
  const midUpper = [37, 267, 39, 269, 40, 270, 82, 312, 81, 311];
  for (let i = 0; i < midUpper.length; i += 1) {
    const t = (i % 5) / 4;
    const x = cx + (t - 0.5) * rx * 1.2;
    const y = cy - upperRy * (0.55 + (i < 5 ? 0.25 : 0.1));
    set(midUpper[i], x, y, roundZ * 0.15);
  }

  return points;
}
