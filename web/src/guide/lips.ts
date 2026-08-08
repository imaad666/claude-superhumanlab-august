/** Outer + inner lip landmark indices for MediaPipe Face Landmarker */
export const LIP_LANDMARK_INDEXES = [
  0, 11, 12, 13, 14, 15, 16, 17, 37, 38, 39, 40, 41, 42, 61, 62, 72, 73, 74, 76,
  77, 78, 80, 81, 82, 84, 85, 87, 88, 89, 90, 91, 95, 96, 146, 178, 179, 180,
  181, 183, 184, 185, 191, 267, 268, 269, 270, 271, 272, 291, 292, 302, 303,
  304, 306, 307, 308, 310, 311, 312, 314, 315, 317, 318, 320, 321, 324, 325,
  375, 402, 403, 404, 405, 407, 408, 409, 415,
] as const;

export type Point = { x: number; y: number };

export function lipBoundingBox(
  landmarks: Point[],
  padding = 0.08,
): { x: number; y: number; w: number; h: number } | null {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let count = 0;

  for (const index of LIP_LANDMARK_INDEXES) {
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
