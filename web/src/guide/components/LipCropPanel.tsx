import { useEffect, useRef } from "react";
import {
  ALL_LIP_INDEXES,
  INNER_LIP,
  LIP_EDGES,
  OUTER_LIP,
  alignLandmarksToBox,
  lipBoundingBox,
  type Point,
} from "../lips";

type LipCropPanelProps = {
  video: HTMLVideoElement | null;
  lipBox: { x: number; y: number; w: number; h: number } | null;
  landmarks: Point[] | null;
  /** Target mouth to chase — drawn as a ghost under live MediaPipe lips. */
  ghostLandmarks?: Point[] | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  poseLabel?: string | null;
};

/**
 * Live camera lip crop + MediaPipe overlay.
 * Optional ghost target (lesson shape to follow) sits under the live mesh.
 */
export function LipCropPanel({
  video,
  lipBox,
  landmarks,
  ghostLandmarks = null,
  status,
  error,
  poseLabel = null,
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

      if (ghostLandmarks?.length) {
        const ghost = alignLandmarksToBox(ghostLandmarks, lipBox);
        if (ghost) {
          drawMediaPipeLips(ctx, ghost, lipBox, dx, dy, dw, dh, true, "ghost");
        }
      }
      if (landmarks?.length) {
        drawMediaPipeLips(ctx, landmarks, lipBox, dx, dy, dw, dh, true, "live");
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

      if (ghostLandmarks?.length) {
        const ghost = alignLandmarksToBox(ghostLandmarks, box);
        if (ghost) {
          drawMediaPipeLips(ctx, ghost, box, dx, dy, dw, dh, true, "ghost");
        }
      }
      drawMediaPipeLips(ctx, landmarks, box, dx, dy, dw, dh, true, "live");
    }
  }, [video, lipBox, landmarks, ghostLandmarks, video?.currentTime, poseLabel]);

  const showingPose = Boolean(landmarks?.length) && !(video && lipBox);
  const hasGhost = Boolean(ghostLandmarks?.length);

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
              ? hasGhost
                ? "Live · ghost"
                : "Live"
              : status === "error"
                ? "Off"
                : "…"}
        </span>
      </header>
      <div className="lip-frame">
        <canvas ref={canvasRef} className="lip-canvas" />
        {!landmarks?.length && !lipBox && error && (
          <p className="guide-empty">{error}</p>
        )}
        {!landmarks?.length && !lipBox && !error && (
          <p className="guide-empty">Waiting for lip landmarks</p>
        )}
        {hasGhost && lipBox && (
          <p className="lip-ghost-legend" aria-hidden>
            <span className="lip-ghost-swatch is-ghost" /> target
            <span className="lip-ghost-swatch is-live" /> you
          </p>
        )}
      </div>
    </section>
  );
}

type DrawStyle = "live" | "ghost";

function drawMediaPipeLips(
  ctx: CanvasRenderingContext2D,
  landmarks: Point[],
  box: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  mirror: boolean,
  style: DrawStyle = "live",
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

  const ghost = style === "ghost";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (ghost) ctx.setLineDash([5, 5]);
  else ctx.setLineDash([]);

  ctx.strokeStyle = ghost
    ? "rgba(120, 200, 255, 0.35)"
    : "rgba(255, 210, 168, 0.55)";
  ctx.lineWidth = ghost ? 1.6 : 1.3;
  for (const [a, b] of LIP_EDGES) {
    const pa = pt(a);
    const pb = pt(b);
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  ctx.strokeStyle = ghost
    ? "rgba(90, 190, 255, 0.75)"
    : "rgba(194, 74, 56, 0.95)";
  ctx.lineWidth = ghost ? 2.8 : 2.4;
  for (const loop of [OUTER_LIP, INNER_LIP]) {
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
    ctx.closePath();
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.fillStyle = ghost ? "rgba(140, 210, 255, 0.55)" : "#ffe0c2";
  for (const index of ALL_LIP_INDEXES) {
    const p = pt(index);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ghost ? 1.6 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
