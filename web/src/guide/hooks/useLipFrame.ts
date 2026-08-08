import { useEffect, useRef, useState } from "react";

type LipBox = { x: number; y: number; w: number; h: number };

/**
 * Captures a small JPEG of the mouth crop for the vision brain.
 * Kept tiny (~160px, q=0.55) so Ollama stays snappy.
 */
export function useLipFrame(
  video: HTMLVideoElement | null,
  lipBox: LipBox | null,
  enabled: boolean,
  intervalMs = 900,
) {
  const [frame, setFrame] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setFrame(null);
      return;
    }

    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    const size = 160;

    const snap = () => {
      if (!video || !lipBox) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const sx = lipBox.x * vw;
      const sy = lipBox.y * vh;
      const sw = Math.max(1, lipBox.w * vw);
      const sh = Math.max(1, lipBox.h * vh);
      const scale = Math.min(size / sw, size / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      const dx = (size - dw) / 2;
      const dy = (size - dh) / 2;

      ctx.fillStyle = "#1a1210";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
      // #region agent log
      fetch("http://127.0.0.1:7904/ingest/a7463e60-1f4a-4b91-b6b8-9ad6b90b1214", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "21c060",
        },
        body: JSON.stringify({
          sessionId: "21c060",
          hypothesisId: "H1",
          location: "useLipFrame.ts:snap",
          message: "lip frame captured",
          data: { bytes: dataUrl.length, intervalMs },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setFrame(dataUrl);
    };

    snap();
    const id = window.setInterval(snap, intervalMs);
    return () => window.clearInterval(id);
  }, [video, lipBox, enabled, intervalMs]);

  return frame;
}
