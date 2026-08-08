/** MediaPipe Face Landmarker lip topology — full lips set for 1:1 mapping */

export type Point = { x: number; y: number; z?: number };

/** Ordered outer lip loop (clockwise) */
export const OUTER_LIP = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84,
  181, 91, 146,
] as const;

/** Ordered inner lip loop (clockwise) */
export const INNER_LIP = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87,
  178, 88, 95,
] as const;

/**
 * Full MediaPipe lip landmark set (Face Mesh lips region).
 * Every index here is plotted as a 3D point + edge vectors.
 */
export const ALL_LIP_INDEXES = [
  0, 11, 12, 13, 14, 15, 16, 17, 37, 38, 39, 40, 41, 42, 61, 62, 72, 73, 74, 76,
  77, 78, 80, 81, 82, 84, 85, 86, 87, 88, 89, 90, 91, 95, 96, 146, 178, 179, 180,
  181, 183, 184, 185, 191, 267, 268, 269, 270, 271, 272, 291, 292, 302, 303,
  304, 306, 307, 308, 310, 311, 312, 314, 315, 316, 317, 318, 320, 321, 324,
  325, 375, 402, 403, 404, 405, 407, 408, 409, 415,
] as const;

/** MediaPipe FACEMESH_LIPS-style undirected edges (landmark index pairs) */
export const LIP_EDGES: ReadonlyArray<readonly [number, number]> = [
  // Outer rim
  [61, 146], [146, 91], [91, 181], [181, 84], [84, 17], [17, 314], [314, 405],
  [405, 321], [321, 375], [375, 291], [291, 409], [409, 270], [270, 269],
  [269, 267], [267, 0], [0, 37], [37, 39], [39, 40], [40, 185], [185, 61],
  // Inner rim
  [78, 95], [95, 88], [88, 178], [178, 87], [87, 14], [14, 317], [317, 402],
  [402, 318], [318, 324], [324, 308], [308, 415], [415, 310], [310, 311],
  [311, 312], [312, 13], [13, 82], [82, 81], [81, 80], [80, 191], [191, 78],
  // Upper lip bridges
  [0, 267], [267, 269], [269, 270], [270, 409], [78, 191], [191, 80], [80, 81],
  [81, 82], [82, 13], [37, 40], [40, 185], [185, 61],
  // Lower lip bridges
  [17, 84], [84, 181], [181, 91], [91, 146], [14, 87], [87, 178], [178, 88],
  [88, 95],
  // Outer ↔ inner spokes (1:1 vector detail)
  [61, 78], [146, 95], [91, 88], [181, 178], [84, 87], [17, 14], [314, 317],
  [405, 402], [321, 318], [375, 324], [291, 308], [409, 415], [270, 310],
  [269, 311], [267, 312], [0, 13], [37, 82], [39, 81], [40, 80], [185, 191],
  // Extra mid-lip chords
  [78, 13], [13, 308], [95, 88], [88, 87], [87, 14], [317, 318], [318, 324],
  [38, 0], [268, 267], [12, 11], [15, 16], [86, 85], [316, 315],
];

export const LIP_LANDMARK_INDEXES = ALL_LIP_INDEXES;

export function lipBoundingBox(
  landmarks: Point[],
  padding = 0.08,
): { x: number; y: number; w: number; h: number } | null {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let count = 0;

  for (const index of ALL_LIP_INDEXES) {
    const point = landmarks[index];
    if (!point) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    count += 1;
  }

  if (count < 8) return null;

  const padX = (maxX - minX) * padding + 0.02;
  const padY = (maxY - minY) * padding + 0.02;
  const x = Math.max(0, minX - padX);
  const y = Math.max(0, minY - padY);
  const w = Math.min(1 - x, maxX - minX + padX * 2);
  const h = Math.min(1 - y, maxY - minY + padY * 2);

  return { x, y, w, h };
}

export type LipMeshBuffers = {
  outer: Float32Array;
  inner: Float32Array;
  /** Every lip landmark in MediaPipe order (ALL_LIP_INDEXES) */
  all: Float32Array;
  /** Flat [x1,y1,z1, x2,y2,z2, ...] segments for every LIP_EDGE */
  edges: Float32Array;
  /** Flat [cx,cy,cz, px,py,pz, ...] spokes from mouth center → each landmark */
  spokes: Float32Array;
  pointCount: number;
  edgeCount: number;
};

/**
 * Mouth mesh in a screen-locked frame (x/y from camera image, not mouth axis).
 * Shape follows MediaPipe; head tilt / yaw does not twist orientation.
 */
export function lipMeshes3D(
  landmarks: Point[],
  mirrorX = true,
): LipMeshBuffers | null {
  const mapPoint = (p: Point) => ({
    x: mirrorX ? 1 - p.x : p.x,
    y: p.y,
    z: p.z ?? 0,
  });

  if (!landmarks[61] || !landmarks[291]) return null;

  const left = mapPoint(landmarks[61]);
  const right = mapPoint(landmarks[291]);
  const top = mapPoint(landmarks[13] ?? landmarks[0] ?? left);
  const bottom = mapPoint(landmarks[14] ?? left);

  const cx = (left.x + right.x) * 0.5;
  const cy = (top.y + bottom.y) * 0.5;
  const cz = (left.z + right.z + top.z + bottom.z) * 0.25;

  // Screen-stable frame: shape follows MediaPipe, head tilt does not rotate.
  const mouthW = Math.hypot(right.x - left.x, right.y - left.y) || 1;
  const cheekL = landmarks[234];
  const cheekR = landmarks[454];
  let faceW = mouthW;
  if (cheekL && cheekR) {
    const lx = mirrorX ? 1 - cheekL.x : cheekL.x;
    const rx = mirrorX ? 1 - cheekR.x : cheekR.x;
    faceW = Math.max(0.12, Math.abs(rx - lx));
  }

  const scale = Math.min(
    9.5,
    Math.max(6.5, 2.4 / Math.max(faceW * 0.45, mouthW)),
  );

  const project = (p: Point) => {
    const m = mapPoint(p);
    return {
      x: (m.x - cx) * scale,
      y: -(m.y - cy) * scale,
      z: Math.max(-0.45, Math.min(0.45, -(m.z - cz) * scale * 0.35)),
    };
  };

  const toBuffer = (indexes: readonly number[]) => {
    const pts: { x: number; y: number; z: number }[] = [];
    for (const index of indexes) {
      const p = landmarks[index];
      if (!p) continue;
      pts.push(project(p));
    }
    const out = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i += 1) {
      out[i * 3] = pts[i].x;
      out[i * 3 + 1] = pts[i].y;
      out[i * 3 + 2] = pts[i].z;
    }
    return out;
  };

  const outer = toBuffer(OUTER_LIP);
  const inner = toBuffer(INNER_LIP);
  if (outer.length < 9 || inner.length < 9) return null;

  // Index → projected point for full 1:1 set
  const projected = new Map<number, { x: number; y: number; z: number }>();
  for (const index of ALL_LIP_INDEXES) {
    const p = landmarks[index];
    if (!p) continue;
    projected.set(index, project(p));
  }

  const all = new Float32Array(projected.size * 3);
  let ai = 0;
  for (const index of ALL_LIP_INDEXES) {
    const p = projected.get(index);
    if (!p) continue;
    all[ai++] = p.x;
    all[ai++] = p.y;
    all[ai++] = p.z;
  }

  const edgeSegs: number[] = [];
  for (const [a, b] of LIP_EDGES) {
    const pa = projected.get(a);
    const pb = projected.get(b);
    if (!pa || !pb) continue;
    edgeSegs.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
  }

  const center = { x: 0, y: 0, z: 0 };
  let n = 0;
  for (let i = 0; i < all.length; i += 3) {
    center.x += all[i];
    center.y += all[i + 1];
    center.z += all[i + 2];
    n += 1;
  }
  if (n > 0) {
    center.x /= n;
    center.y /= n;
    center.z /= n;
  }

  const spokeSegs: number[] = [];
  for (let i = 0; i < all.length; i += 3) {
    spokeSegs.push(
      center.x,
      center.y,
      center.z,
      all[i],
      all[i + 1],
      all[i + 2],
    );
  }

  return {
    outer,
    inner,
    all: all.slice(0, ai),
    edges: new Float32Array(edgeSegs),
    spokes: new Float32Array(spokeSegs),
    pointCount: ai / 3,
    edgeCount: edgeSegs.length / 6,
  };
}
