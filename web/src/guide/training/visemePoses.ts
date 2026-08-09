import type { Point } from "../lips";
import { ALL_LIP_INDEXES, INNER_LIP, OUTER_LIP } from "../lips";
import type { VisemeId } from "../visemes";

/**
 * Distinct MediaPipe lip poses per sound.
 * Fills OUTER/INNER/ALL lip indexes so the Lips panel mesh + 3D coach
 * both show real topology — not a single circle morph.
 */
type PoseTune = {
  halfW: number;
  upper: number;
  lower: number;
  bow: number;
  /** Horizontal smile stretch (E/I) vs neutral */
  smile: number;
  purse: number;
  protrude: number;
  tuckLower: number;
  press: number;
  /** Extra thickness between outer and inner rings */
  thickness: number;
};

const TUNES: Record<VisemeId, PoseTune> = {
  rest: {
    halfW: 0.058,
    upper: 0.011,
    lower: 0.013,
    bow: 0.3,
    smile: 0,
    purse: 0.05,
    protrude: 0.004,
    tuckLower: 0,
    press: 0.2,
    thickness: 0.55,
  },
  M: {
    halfW: 0.05,
    upper: 0.004,
    lower: 0.004,
    bow: 0.05,
    smile: 0,
    purse: 0.12,
    protrude: 0.002,
    tuckLower: 0,
    press: 0.95,
    thickness: 0.35,
  },
  A: {
    halfW: 0.062,
    upper: 0.042,
    lower: 0.062,
    bow: 0.12,
    smile: 0.05,
    purse: 0,
    protrude: 0.008,
    tuckLower: 0,
    press: 0,
    thickness: 0.7,
  },
  E: {
    halfW: 0.086,
    upper: 0.02,
    lower: 0.024,
    bow: 0.45,
    smile: 0.55,
    purse: 0,
    protrude: 0.004,
    tuckLower: 0,
    press: 0,
    thickness: 0.5,
  },
  I: {
    halfW: 0.095,
    upper: 0.014,
    lower: 0.016,
    bow: 0.5,
    smile: 0.75,
    purse: 0,
    protrude: 0.003,
    tuckLower: 0,
    press: 0,
    thickness: 0.45,
  },
  O: {
    halfW: 0.04,
    upper: 0.036,
    lower: 0.04,
    bow: 0.02,
    smile: 0,
    purse: 0.62,
    protrude: 0.032,
    tuckLower: 0,
    press: 0,
    thickness: 0.65,
  },
  U: {
    halfW: 0.03,
    upper: 0.026,
    lower: 0.028,
    bow: 0,
    smile: 0,
    purse: 0.82,
    protrude: 0.042,
    tuckLower: 0,
    press: 0,
    thickness: 0.6,
  },
  F: {
    halfW: 0.064,
    upper: 0.012,
    lower: 0.018,
    bow: 0.22,
    smile: 0.1,
    purse: 0.08,
    protrude: 0.012,
    tuckLower: 0.7,
    press: 0.15,
    thickness: 0.4,
  },
  L: {
    halfW: 0.06,
    upper: 0.028,
    lower: 0.034,
    bow: 0.18,
    smile: 0.08,
    purse: 0.04,
    protrude: 0.01,
    tuckLower: 0,
    press: 0,
    thickness: 0.55,
  },
};

const CX = 0.5;
const CY = 0.56;

export function mediapipePoseForViseme(viseme: VisemeId): Point[] {
  const tune = TUNES[viseme] ?? TUNES.rest;
  const points: Point[] = Array.from({ length: 478 }, () => ({
    x: CX,
    y: CY,
    z: 0,
  }));

  const set = (i: number, x: number, y: number, z = 0) => {
    points[i] = { x, y, z };
  };

  const halfW =
    tune.halfW * (1 - tune.purse * 0.4) * (1 + tune.smile * 0.28);
  const upper = tune.upper * (1 - tune.press * 0.85);
  const lower =
    tune.lower * (1 - tune.press * 0.85) * (1 - tune.tuckLower * 0.5);
  const lowerYShift = -tune.tuckLower * Math.max(upper, 0.01) * 1.1;

  // Face width anchors
  set(234, CX - halfW * 2.4, CY, 0.02);
  set(454, CX + halfW * 2.4, CY, 0.02);

  const outerPts = placeLipLoop(
    OUTER_LIP.length,
    halfW,
    upper,
    lower,
    lowerYShift,
    tune,
    1,
  );
  const innerScale = 0.55 + tune.thickness * 0.2;
  const innerPts = placeLipLoop(
    INNER_LIP.length,
    halfW * innerScale,
    upper * (0.55 + tune.thickness * 0.15),
    lower * (0.55 + tune.thickness * 0.15),
    lowerYShift * 0.9,
    tune,
    0.9,
  );

  for (let i = 0; i < OUTER_LIP.length; i += 1) {
    const p = outerPts[i];
    set(OUTER_LIP[i], p.x, p.y, p.z);
  }
  for (let i = 0; i < INNER_LIP.length; i += 1) {
    const p = innerPts[i];
    set(INNER_LIP[i], p.x, p.y, p.z);
  }

  // Fill remaining MediaPipe lip indexes by projecting onto mouth ellipse
  for (const idx of ALL_LIP_INDEXES) {
    if (points[idx].x !== CX || points[idx].y !== CY) continue;
    // Place mid-band between outer extent and center
    const ang = (idx % 20) / 20 * Math.PI * 2;
    const x = CX + Math.cos(ang) * halfW * 0.85;
    const y =
      CY +
      (Math.sin(ang) >= 0 ? -upper : lower + lowerYShift) *
        Math.abs(Math.sin(ang)) *
        0.75;
    set(idx, x, y, tune.protrude * 0.2);
  }

  // Key points
  set(61, CX - halfW, CY, tune.protrude * 0.35);
  set(291, CX + halfW, CY, tune.protrude * 0.35);
  set(0, CX, CY - upper * (1.05 - tune.bow * 0.08), tune.protrude * 0.55);
  set(17, CX, CY + lower + lowerYShift, tune.protrude * 0.3);
  set(13, CX, CY - upper * 0.65, -0.005 + tune.protrude * 0.35);
  set(14, CX, CY + lower * 0.65 + lowerYShift, -0.005 + tune.protrude * 0.25);

  return points;
}

function placeLipLoop(
  n: number,
  halfW: number,
  upper: number,
  lower: number,
  lowerYShift: number,
  tune: PoseTune,
  zScale: number,
): Array<{ x: number; y: number; z: number }> {
  const upperN = Math.ceil(n / 2);
  const lowerN = n - upperN;
  const out: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i < upperN; i += 1) {
    const t = upperN <= 1 ? 0.5 : i / (upperN - 1);
    // Smile: corners rise slightly
    const cornerLift = tune.smile * 0.012 * (1 - Math.sin(t * Math.PI));
    const x = CX + (t * 2 - 1) * halfW;
    const arch = Math.sin(t * Math.PI);
    const bowDip =
      tune.bow * 0.008 * Math.pow(Math.cos((t - 0.5) * Math.PI), 2);
    // Purse: flatten sides into a rounder opening (x already narrowed)
    const y = CY - upper * arch + bowDip - cornerLift;
    const z =
      (tune.protrude * (0.35 + 0.65 * arch) -
        Math.abs(t - 0.5) * 0.012 +
        tune.purse * 0.01 * arch) *
      zScale;
    out.push({ x, y, z });
  }

  for (let i = 0; i < lowerN; i += 1) {
    const t = lowerN <= 1 ? 0.5 : i / (lowerN - 1);
    const cornerLift = tune.smile * 0.01 * (1 - Math.sin(t * Math.PI));
    const x = CX + (1 - t * 2) * halfW;
    const arch = Math.sin(t * Math.PI);
    const y = CY + lower * arch + lowerYShift - cornerLift * 0.3;
    const z =
      (tune.protrude * (0.2 + 0.45 * arch) - Math.abs(t - 0.5) * 0.01) *
      zScale;
    out.push({ x, y, z });
  }

  return out;
}
