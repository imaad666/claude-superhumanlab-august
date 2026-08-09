import { useEffect, useRef } from "react";
import {
  ALL_LIP_INDEXES,
  INNER_LIP,
  LIP_EDGES,
  OUTER_LIP,
  alignLandmarksToBox,
  alignLandmarksToFace,
  lipBoundingBox,
  type Point,
} from "../lips";

type MatchTone = "good" | "close" | "try_again";

type LipCropPanelProps = {
  video: HTMLVideoElement | null;
  lipBox: { x: number; y: number; w: number; h: number } | null;
  landmarks: Point[] | null;
  targetLandmarks?: Point[] | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  poseLabel?: string | null;
  /** Live combined match — drives immersive frame color. */
  match?: MatchTone | null;
};

/**
 * Live camera lip crop + MediaPipe overlay.
 * Ghost (green target) is drawn last and brighter so “follow this” reads first;
 * the live matrix stays dim underneath. Frame border mirrors match quality.
 */
export function LipCropPanel({
  video,
  lipBox,
  landmarks,
  targetLandmarks = null,
  status,
  error,
  poseLabel = null,
  match = null,
}: LipCropPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 280;
    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = "#2a1f16";
    ctx.fillRect(0, 0, size, size);

    if (video && lipBox) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      const sx = lipBox.x * vw;
      const sy = lipBox.y * vh;
      const sw = Math.max(1, lipBox.w * vw);
      const sh = Math.max(1, lipBox.h * vh);
      const scale = Math.min(size / sw, size / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      const dx = (size - dw) / 2;
      const dy = (size - dh) / 2;

      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(8, 8, size - 16, size - 16, 16);
      } else {
        ctx.rect(8, 8, size - 16, size - 16);
      }
      ctx.clip();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Live first (dim), ghost target last (bright) — follow-map on top.
      // Align to the face WITHOUT squashing into the live lip box, so "ah"
      // stays more open than "ee" / "m" and each sound looks different.
      if (landmarks?.length) {
        drawMediaPipeLips(ctx, landmarks, lipBox, dx, dy, dw, dh, true, "live");
      }
      if (targetLandmarks?.length) {
        const placed =
          landmarks?.length
            ? alignLandmarksToFace(targetLandmarks, landmarks)
            : alignLandmarksToBox(targetLandmarks, {
                x: lipBox.x + lipBox.w * 0.08,
                y: lipBox.y + lipBox.h * 0.1,
                w: lipBox.w * 0.84,
                h: lipBox.h * 0.8,
              });
        if (placed) {
          drawMediaPipeLips(
            ctx,
            placed,
            lipBox,
            dx,
            dy,
            dw,
            dh,
            true,
            "target",
          );
        }
      }
      ctx.restore();
      return;
    }

    if (landmarks?.length) {
      const box = lipBoundingBox(landmarks, 0.4) ?? {
        x: 0.32,
        y: 0.4,
        w: 0.36,
        h: 0.32,
      };
      const frame = 16;
      const scale = Math.min(
        (size - frame * 2) / box.w,
        (size - frame * 2) / box.h,
      );
      const dw = box.w * scale;
      const dh = box.h * scale;
      const dx = (size - dw) / 2;
      const dy = (size - dh) / 2;

      ctx.fillStyle = "#1a1210";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(10, 10, size - 20, size - 20, 14);
      } else {
        ctx.rect(10, 10, size - 20, size - 20);
      }
      ctx.fill();

      drawMediaPipeLips(ctx, landmarks, box, dx, dy, dw, dh, true, "live");
    }
  }, [video, lipBox, landmarks, targetLandmarks, video?.currentTime, poseLabel]);

  const showingPose = Boolean(landmarks?.length) && !(video && lipBox);
  const frameMatch = match ?? null;

  return (
    <section className="guide-panel lip-panel">
      <header className="guide-panel-head">
        <h2>Lips</h2>
        <span className="guide-pill">
          {showingPose
            ? poseLabel
              ? `Pose · ${poseLabel}`
              : "MediaPipe pose"
            : status === "ready" && lipBox
              ? targetLandmarks?.length
                ? "Follow green"
                : "Live"
              : status === "error"
                ? "Off"
                : "…"}
        </span>
      </header>
      <div
        className={`lip-frame ${frameMatch ? `is-match-${frameMatch}` : ""}`}
      >
        <canvas ref={canvasRef} className="lip-canvas" />
        {targetLandmarks?.length && lipBox ? (
          <div className="lip-overlay-legend" aria-label="Lip overlay legend">
            <span>
              <i className="lip-overlay-key is-target" />
              Follow
            </span>
            <span>
              <i className="lip-overlay-key is-live" />
              You
            </span>
          </div>
        ) : null}
        {!landmarks?.length && !lipBox && error && (
          <p className="guide-empty">{error}</p>
        )}
        {!landmarks?.length && !lipBox && !error && (
          <p className="guide-empty">Waiting for lip landmarks</p>
        )}
      </div>
    </section>
  );
}

function drawMediaPipeLips(
  ctx: CanvasRenderingContext2D,
  landmarks: Point[],
  box: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  mirror: boolean,
  style: "live" | "target",
) {
  const pt = (index: number) => {
    const p = landmarks[index];
    if (!p) return null;
    const nx = mirror ? 1 - p.x : p.x;
    const left = mirror ? 1 - box.x - box.w : box.x;
    return {
      x: dx + ((nx - left) / box.w) * dw,
      y: dy + ((p.y - box.y) / box.h) * dh,
    };
  };

  const pointsFor = (loop: readonly number[]) =>
    loop.map((index) => pt(index)).filter((p): p is { x: number; y: number } => Boolean(p));

  /** Smooth closed lip curve — looks like a race ghost, not a mesh cage. */
  const strokeSmoothLoop = (loop: readonly number[], close = true) => {
    const pts = pointsFor(loop);
    if (pts.length < 3) return false;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length; i += 1) {
      const p0 = pts[(i - 1 + pts.length) % pts.length];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const p3 = pts[(i + 2) % pts.length];
      // Catmull-Rom → cubic Bezier
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      if (!close && i === pts.length - 2) break;
    }
    if (close) ctx.closePath();
    return true;
  };

  const traceLoop = (loop: readonly number[]) => {
    ctx.beginPath();
    let started = false;
    for (const index of loop) {
      const p = pt(index);
      if (!p) continue;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    if (started) ctx.closePath();
    return started;
  };

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const isTarget = style === "target";

  if (isTarget) {
    // Ghost follow map: soft lip ribbon + smooth dashed outline. No dense mesh.
    const outerPts = pointsFor(OUTER_LIP);
    const innerPts = pointsFor(INNER_LIP);
    if (outerPts.length >= 3 && innerPts.length >= 3) {
      ctx.beginPath();
      // Outer
      ctx.moveTo(outerPts[0].x, outerPts[0].y);
      for (let i = 0; i < outerPts.length; i += 1) {
        const p0 = outerPts[(i - 1 + outerPts.length) % outerPts.length];
        const p1 = outerPts[i];
        const p2 = outerPts[(i + 1) % outerPts.length];
        const p3 = outerPts[(i + 2) % outerPts.length];
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6,
          p1.y + (p2.y - p0.y) / 6,
          p2.x - (p3.x - p1.x) / 6,
          p2.y - (p3.y - p1.y) / 6,
          p2.x,
          p2.y,
        );
      }
      ctx.closePath();
      // Inner (opposite winding for even-odd hole)
      ctx.moveTo(innerPts[0].x, innerPts[0].y);
      for (let i = innerPts.length - 1; i >= 0; i -= 1) {
        const p0 = innerPts[(i + 1) % innerPts.length];
        const p1 = innerPts[i];
        const p2 = innerPts[(i - 1 + innerPts.length) % innerPts.length];
        const p3 = innerPts[(i - 2 + innerPts.length) % innerPts.length];
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6,
          p1.y + (p2.y - p0.y) / 6,
          p2.x - (p3.x - p1.x) / 6,
          p2.y - (p3.y - p1.y) / 6,
          p2.x,
          p2.y,
        );
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(72, 220, 120, 0.2)";
      ctx.fill("evenodd");
    }

    ctx.setLineDash([7, 5]);
    ctx.shadowColor = "rgba(80, 240, 130, 0.55)";
    ctx.shadowBlur = 8;

    ctx.strokeStyle = "rgba(90, 235, 130, 0.95)";
    ctx.lineWidth = 2.35;
    if (strokeSmoothLoop(OUTER_LIP)) ctx.stroke();

    ctx.strokeStyle = "rgba(150, 255, 175, 0.85)";
    ctx.lineWidth = 1.65;
    if (strokeSmoothLoop(INNER_LIP)) ctx.stroke();

    // A few soft beads on the outer rim only — not a full landmark cloud.
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    const rim = pointsFor(OUTER_LIP);
    ctx.fillStyle = "rgba(200, 255, 215, 0.9)";
    for (let i = 0; i < rim.length; i += 2) {
      const p = rim[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.55, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Live matrix — dim, so the green ghost leads.
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 210, 168, 0.22)";
  ctx.lineWidth = 0.9;
  for (const [a, b] of LIP_EDGES) {
    const pa = pt(a);
    const pb = pt(b);
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(194, 74, 56, 0.42)";
  ctx.lineWidth = 1.55;
  for (const loop of [OUTER_LIP, INNER_LIP]) {
    if (!traceLoop(loop)) continue;
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 224, 194, 0.45)";
  for (const index of ALL_LIP_INDEXES) {
    const p = pt(index);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
}
