import { useEffect, useRef } from "react";
import type { Point } from "../lips";

type LipCropPanelProps = {
  video: HTMLVideoElement | null;
  lipBox: { x: number; y: number; w: number; h: number } | null;
  landmarks: Point[] | null;
  status: "loading" | "ready" | "error";
  error: string | null;
};

export function LipCropPanel({
  video,
  lipBox,
  status,
  error,
}: LipCropPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !video || !lipBox) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const sx = lipBox.x * vw;
    const sy = lipBox.y * vh;
    const sw = Math.max(1, lipBox.w * vw);
    const sh = Math.max(1, lipBox.h * vh);

    const size = 280;
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = "#2a1f16";
    ctx.fillRect(0, 0, size, size);

    // Cover-fit the lip crop into the square
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
    ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }, [video, lipBox, video?.currentTime]);

  return (
    <section className="guide-panel lip-panel">
      <header className="guide-panel-head">
        <h2>Lips</h2>
        <span className="guide-pill">
          {status === "ready" && lipBox ? "Live" : status === "error" ? "Off" : "…"}
        </span>
      </header>
      <div className="lip-frame">
        <canvas ref={canvasRef} className="lip-canvas" />
        {!lipBox && error && <p className="guide-empty">{error}</p>}
      </div>
    </section>
  );
}
