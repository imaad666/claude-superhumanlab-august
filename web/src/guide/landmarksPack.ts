import { ALL_LIP_INDEXES, type Point } from "./lips";

/** Lip + cheek anchors we persist from Live Guide for trainer replay. */
const PACK_INDEXES = [...ALL_LIP_INDEXES, 234, 454] as const;

export type PackedLandmarks = {
  /** Landmark index → [x, y, z] */
  p: Record<string, [number, number, number]>;
};

/** Compact lip mesh for storage (not full 478 face). */
export function packLandmarks(landmarks: Point[] | null): PackedLandmarks | null {
  if (!landmarks?.length) return null;
  const p: PackedLandmarks["p"] = {};
  for (const idx of PACK_INDEXES) {
    const pt = landmarks[idx];
    if (!pt) continue;
    p[String(idx)] = [
      Math.round(pt.x * 10000) / 10000,
      Math.round(pt.y * 10000) / 10000,
      Math.round((pt.z ?? 0) * 10000) / 10000,
    ];
  }
  return Object.keys(p).length >= 8 ? { p } : null;
}

/** Expand packed lips into a MediaPipe-length array for LipMesh3D / crops. */
export function unpackLandmarks(packed: PackedLandmarks | null | undefined): Point[] | null {
  if (!packed?.p) return null;
  const points: Point[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.55,
    z: 0,
  }));
  let n = 0;
  for (const [key, xyz] of Object.entries(packed.p)) {
    const idx = Number(key);
    if (!Number.isFinite(idx) || idx < 0 || idx >= points.length) continue;
    const [x, y, z] = xyz;
    points[idx] = { x, y, z: z ?? 0 };
    n += 1;
  }
  return n >= 8 ? points : null;
}
