import { useEffect, useRef, useState } from "react";

type SpectrogramState = {
  volume: number;
  pitchHint: number;
  error: string | null;
};

/**
 * Audio metrics always run when mic is live.
 * Canvas is optional — only used to paint the scrolling spectrogram.
 */
export function useSpectrogram(
  stream: MediaStream | null,
  canvas: HTMLCanvasElement | null,
  enabled: boolean,
) {
  const [metrics, setMetrics] = useState<SpectrogramState>({
    volume: 0,
    pitchHint: 0,
    error: null,
  });
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;

  useEffect(() => {
    if (!enabled || !stream) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setMetrics((prev) => ({ ...prev, error: "No microphone track" }));
      return;
    }

    // Prefer speech pickup over call AEC (Safari/Mac often under-reports otherwise).
    for (const track of audioTracks) {
      try {
        void track.applyConstraints({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        } as MediaTrackConstraints);
      } catch {
        /* constraints optional */
      }
    }

    let cancelled = false;
    let raf = 0;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.35;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const time = new Uint8Array(analyser.fftSize);
    let smoothVol = 0;

    const draw = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);

      let sum = 0;
      let peak = 0;
      for (let i = 0; i < time.length; i += 1) {
        const v = (time[i] - 128) / 128;
        sum += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
      const rms = Math.sqrt(sum / time.length);

      // Speech-band energy (roughly 80Hz–3kHz) — better than raw RMS alone.
      let speechEnergy = 0;
      const lo = Math.floor(freq.length * 0.02);
      const hi = Math.floor(freq.length * 0.35);
      for (let i = lo; i < hi; i += 1) speechEnergy += freq[i];
      speechEnergy /= Math.max(1, (hi - lo) * 255);

      // Gain tuned for laptop mics — quiet speech should still clear ~0.08–0.2.
      const instant = Math.min(
        1,
        rms * 9.5 + peak * 1.35 + speechEnergy * 1.1,
      );
      smoothVol = smoothVol * 0.55 + instant * 0.45;
      const volume = Math.min(1, smoothVol);

      let weighted = 0;
      let total = 0;
      for (let i = lo; i < hi; i += 1) {
        weighted += (i - lo) * freq[i];
        total += freq[i];
      }
      const pitchHint = total > 0 ? weighted / total / Math.max(1, hi - lo) : 0;

      const paint = canvasRef.current;
      const ctx = paint?.getContext("2d") ?? null;
      if (paint && ctx) {
        const dpr = window.devicePixelRatio || 1;
        const rect = paint.getBoundingClientRect();
        const needW = Math.max(1, Math.floor(rect.width * dpr));
        const needH = Math.max(1, Math.floor(rect.height * dpr));
        if (paint.width !== needW || paint.height !== needH) {
          paint.width = needW;
          paint.height = needH;
        }
        const w = paint.width;
        const h = paint.height;
        if (w > 2 && h > 2) {
          const image = ctx.getImageData(2, 0, w - 2, h);
          ctx.putImageData(image, 0, 0);
          const col = w - 2;
          for (let y = 0; y < h; y += 1) {
            const bin = Math.floor((1 - y / h) * (freq.length - 1));
            const value = freq[bin] / 255;
            const r = Math.floor(40 + value * 180);
            const g = Math.floor(60 + value * 90);
            const b = Math.floor(30 + value * 40);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(col, y, 2, 1);
          }
        }
      }

      setMetrics((prev) => {
        const nextVolume = Math.round(volume * 100) / 100;
        const nextPitch = Math.round(pitchHint * 100) / 100;
        if (
          Math.abs(prev.volume - nextVolume) < 0.01 &&
          Math.abs(prev.pitchHint - nextPitch) < 0.01 &&
          !prev.error
        ) {
          return prev;
        }
        return { volume: nextVolume, pitchHint: nextPitch, error: null };
      });
      raf = requestAnimationFrame(draw);
    };

    void context.resume().then(() => {
      if (!cancelled) raf = requestAnimationFrame(draw);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      source.disconnect();
      void context.close();
    };
  }, [enabled, stream]);

  return metrics;
}
