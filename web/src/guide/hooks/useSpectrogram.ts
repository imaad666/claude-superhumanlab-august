import { useEffect, useRef, useState } from "react";

type SpectrogramState = {
  volume: number;
  pitchHint: number;
  error: string | null;
};

/** Horizontal reference lines drawn on the voice wave. */
const BASELINES = [
  { id: "loud", label: "loud", level: 0.72, color: "rgba(214, 90, 31, 0.85)" },
  { id: "happy", label: "happy", level: 0.48, color: "rgba(196, 137, 32, 0.8)" },
  { id: "mid", label: "mid", level: 0.28, color: "rgba(255, 246, 234, 0.35)" },
  {
    id: "shallow",
    label: "shallow",
    level: 0.12,
    color: "rgba(120, 160, 190, 0.75)",
  },
] as const;

const HISTORY = 360;

/**
 * Mic metrics + continuous scrolling voice waveform.
 * History lives in a ring buffer so the wave keeps going for the whole
 * recording — silence just flattens the line; it does not reset.
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

  // Persistent across canvas remounts while this effect is alive.
  const historyRef = useRef({
    amp: new Float32Array(HISTORY),
    pitch: new Float32Array(HISTORY),
    scope: new Float32Array(HISTORY),
    write: 0,
    filled: 0,
    scopeWrite: 0,
    scopeFilled: 0,
  });

  useEffect(() => {
    if (!enabled || !stream) {
      // Clear history only when the take ends — next Record starts fresh.
      const h = historyRef.current;
      h.amp.fill(0);
      h.pitch.fill(0);
      h.scope.fill(0);
      h.write = 0;
      h.filled = 0;
      h.scopeWrite = 0;
      h.scopeFilled = 0;
      setMetrics({ volume: 0, pitchHint: 0, error: null });
      const paint = canvasRef.current;
      const ctx = paint?.getContext("2d");
      if (paint && ctx) {
        ctx.clearRect(0, 0, paint.width, paint.height);
      }
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setMetrics((prev) => ({ ...prev, error: "No microphone track" }));
      return;
    }

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
    analyser.smoothingTimeConstant = 0.45;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const time = new Uint8Array(analyser.fftSize);
    let smoothVol = 0;
    let smoothPitch = 0;
    const chunk = new Float32Array(6);

    const paintWave = (
      paint: HTMLCanvasElement,
      volume: number,
      pitchHint: number,
      signedChunk: Float32Array,
    ) => {
      const ctx = paint.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = paint.getBoundingClientRect();
      const needW = Math.max(1, Math.floor(rect.width * dpr));
      const needH = Math.max(1, Math.floor(rect.height * dpr));
      // Resize without wiping history — history is in the ring buffer, not pixels.
      if (paint.width !== needW || paint.height !== needH) {
        paint.width = needW;
        paint.height = needH;
      }
      const w = paint.width;
      const h = paint.height;
      if (w < 4 || h < 4) return;

      const hist = historyRef.current;
      hist.amp[hist.write] = volume;
      hist.pitch[hist.write] = pitchHint;
      hist.write = (hist.write + 1) % HISTORY;
      hist.filled = Math.min(HISTORY, hist.filled + 1);

      // Append downsampled oscilloscope samples — keeps scrolling for the whole take.
      for (let i = 0; i < signedChunk.length; i += 1) {
        hist.scope[hist.scopeWrite] = signedChunk[i];
        hist.scopeWrite = (hist.scopeWrite + 1) % HISTORY;
        hist.scopeFilled = Math.min(HISTORY, hist.scopeFilled + 1);
      }

      ctx.fillStyle = "#2a1f16";
      ctx.fillRect(0, 0, w, h);

      const midY = h * 0.5;
      const ampScale = h * 0.42;

      // Baseline guides (amplitude zones for loud / happy / mid / shallow)
      ctx.save();
      ctx.font = `${Math.max(10, Math.round(11 * dpr))}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      for (const line of BASELINES) {
        const yUp = midY - line.level * ampScale;
        const yDn = midY + line.level * ampScale;
        ctx.strokeStyle = line.color;
        ctx.lineWidth = Math.max(1, dpr * 0.75);
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.moveTo(0, yUp);
        ctx.lineTo(w, yUp);
        ctx.moveTo(0, yDn);
        ctx.lineTo(w, yDn);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = line.color;
        ctx.fillText(line.label, 6 * dpr, yUp);
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255, 246, 234, 0.18)";
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();
      ctx.restore();

      const n = hist.scopeFilled;
      if (n < 2) return;
      const start = (hist.scopeWrite - n + HISTORY) % HISTORY;

      // Soft amplitude envelope behind the wavelength
      const envN = hist.filled;
      if (envN > 1) {
        const envStart = (hist.write - envN + HISTORY) % HISTORY;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        for (let i = 0; i < envN; i += 1) {
          const idx = (envStart + i) % HISTORY;
          const x = (i / Math.max(1, envN - 1)) * (w - 1);
          ctx.lineTo(x, midY - hist.amp[idx] * ampScale);
        }
        for (let i = envN - 1; i >= 0; i -= 1) {
          const idx = (envStart + i) % HISTORY;
          const x = (i / Math.max(1, envN - 1)) * (w - 1);
          ctx.lineTo(x, midY + hist.amp[idx] * ampScale);
        }
        ctx.closePath();
        const glow = ctx.createLinearGradient(
          0,
          midY - ampScale,
          0,
          midY + ampScale,
        );
        glow.addColorStop(0, "rgba(214, 90, 31, 0.18)");
        glow.addColorStop(0.5, "rgba(255, 246, 234, 0.05)");
        glow.addColorStop(1, "rgba(120, 160, 190, 0.14)");
        ctx.fillStyle = glow;
        ctx.fill();
      }

      // Continuous wavelength (time-domain)
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        const idx = (start + i) % HISTORY;
        const x = (i / Math.max(1, n - 1)) * (w - 1);
        const y = midY - hist.scope[idx] * ampScale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const bright = Math.min(1, pitchHint * 1.4);
      const r = Math.round(220 + bright * 20);
      const g = Math.round(140 + bright * 60);
      const b = Math.round(70 + (1 - bright) * 40);
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = Math.max(1.5, 1.75 * dpr);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      const liveY = midY - volume * ampScale;
      ctx.fillStyle =
        volume >= 0.72
          ? BASELINES[0].color
          : volume >= 0.48
            ? BASELINES[1].color
            : volume >= 0.28
              ? BASELINES[2].color
              : BASELINES[3].color;
      ctx.beginPath();
      ctx.arc(w - 5 * dpr, liveY, 3.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    };

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

      let speechEnergy = 0;
      const lo = Math.floor(freq.length * 0.02);
      const hi = Math.floor(freq.length * 0.35);
      for (let i = lo; i < hi; i += 1) speechEnergy += freq[i];
      speechEnergy /= Math.max(1, (hi - lo) * 255);

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
      const rawPitch = total > 0 ? weighted / total / Math.max(1, hi - lo) : 0;
      smoothPitch = smoothPitch * 0.7 + rawPitch * 0.3;
      const pitchHint = smoothPitch;

      // ~6 scope points per frame so the wavelength scrolls smoothly for the whole take.
      const step = Math.max(1, Math.floor(time.length / chunk.length));
      for (let i = 0; i < chunk.length; i += 1) {
        const v = (time[i * step] - 128) / 128;
        // Scale raw wave into the same 0–1 visual range as volume baselines.
        chunk[i] = Math.max(-1, Math.min(1, v * (1.8 + volume * 2.2)));
      }

      const paint = canvasRef.current;
      if (paint) paintWave(paint, volume, pitchHint, chunk);

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
