import { useEffect, useRef, useState } from "react";

type SpectrogramState = {
  volume: number;
  pitchHint: number;
  error: string | null;
};

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

  const audioRef = useRef<{
    context: AudioContext;
    analyser: AnalyserNode;
    source: MediaStreamAudioSourceNode;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !stream || !canvas) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setMetrics((prev) => ({ ...prev, error: "No microphone track" }));
      return;
    }

    let cancelled = false;
    let raf = 0;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    audioRef.current = { context, analyser, source };

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const time = new Uint8Array(analyser.fftSize);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      if (cancelled || !ctx) return;
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);

      let sum = 0;
      for (let i = 0; i < time.length; i += 1) {
        const v = (time[i] - 128) / 128;
        sum += v * v;
      }
      const volume = Math.sqrt(sum / time.length);

      let weighted = 0;
      let total = 0;
      for (let i = 0; i < freq.length; i += 1) {
        weighted += i * freq[i];
        total += freq[i];
      }
      const pitchHint = total > 0 ? weighted / total / freq.length : 0;

      // Scroll spectrogram left by 2px, draw new column on the right
      const w = canvas.width;
      const h = canvas.height;
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

      setMetrics((prev) => {
        const nextVolume = Math.round(volume * 100) / 100;
        const nextPitch = Math.round(pitchHint * 100) / 100;
        if (
          Math.abs(prev.volume - nextVolume) < 0.02 &&
          Math.abs(prev.pitchHint - nextPitch) < 0.02 &&
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
      window.removeEventListener("resize", resize);
      source.disconnect();
      void context.close();
      audioRef.current = null;
    };
  }, [enabled, stream, canvas]);

  return metrics;
}
