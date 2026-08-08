import { useCallback, useEffect, useRef, useState } from "react";
import type { ExpressionFeatures, LipFeatures } from "../features";
import type { GuideSession, SessionSample } from "../sessionTypes";
import type { TranscriptWord } from "../types";

type RecorderInput = {
  active: boolean;
  stream: MediaStream | null;
  lips: LipFeatures;
  volume: number;
  pitchHint: number;
  expression: ExpressionFeatures;
  lipImage: string | null;
  transcript: string;
  recentWords: string[];
  words: TranscriptWord[];
  /** How often to sample metrics / lip crops (ms). */
  sampleEveryMs?: number;
};

function pickMime(): string | undefined {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  return undefined;
}

/**
 * Live Guide recorder — captures A/V + metric samples while active.
 * Model analysis happens after stop (see analyzeSession).
 */
export function useSessionRecorder(input: RecorderInput) {
  const {
    active,
    stream,
    sampleEveryMs = 1200,
  } = input;

  const [elapsedMs, setElapsedMs] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [session, setSession] = useState<GuideSession | null>(null);

  const samplesRef = useRef<SessionSample[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mediaUrlRef = useRef<string | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const stoppingRef = useRef(false);

  const clearMediaUrl = useCallback(() => {
    if (mediaUrlRef.current) {
      URL.revokeObjectURL(mediaUrlRef.current);
      mediaUrlRef.current = null;
    }
  }, []);

  // Begin a new take when recording starts
  useEffect(() => {
    if (!active) return;

    stoppingRef.current = false;
    clearMediaUrl();
    samplesRef.current = [];
    chunksRef.current = [];
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setSampleCount(0);
    setSession(null);

    const tick = window.setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 250);

    return () => {
      window.clearInterval(tick);
      stoppingRef.current = true;
      const startedAt = startedAtRef.current ?? Date.now();
      const endedAt = Date.now();
      const samples = [...samplesRef.current];
      const finalWords = [...inputRef.current.words];

      const finish = (url: string | null) => {
        setSession({
          id: `live-${startedAt}`,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          samples,
          words: finalWords,
          mediaUrl: url,
        });
        setSampleCount(samples.length);
        setElapsedMs(endedAt - startedAt);
        startedAtRef.current = null;
      };

      const rec = mediaRef.current;
      mediaRef.current = null;

      if (rec && rec.state !== "inactive") {
        rec.onstop = () => {
          clearMediaUrl();
          const blob = new Blob(chunksRef.current, {
            type: rec.mimeType || "video/webm",
          });
          let mediaUrl: string | null = null;
          if (blob.size > 0) {
            mediaUrl = URL.createObjectURL(blob);
            mediaUrlRef.current = mediaUrl;
          }
          finish(mediaUrl);
        };
        try {
          rec.stop();
        } catch {
          finish(null);
        }
      } else {
        finish(null);
      }
    };
  }, [active, clearMediaUrl]);

  // Attach MediaRecorder once the camera stream is ready
  useEffect(() => {
    if (!active || !stream || typeof MediaRecorder === "undefined") return;
    if (mediaRef.current && mediaRef.current.state !== "inactive") return;

    try {
      const mime = pickMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.start(1000);
    } catch {
      mediaRef.current = null;
    }

    return () => {
      /* stop handled by active-effect cleanup */
    };
  }, [active, stream]);

  // Sample metrics while recording
  useEffect(() => {
    if (!active) return;

    const push = () => {
      const started = startedAtRef.current;
      if (started == null || stoppingRef.current) return;
      const cur = inputRef.current;
      const speaking =
        cur.volume > 0.04 ||
        cur.lips.openness > 0.12 ||
        cur.expression.jawOpen > 0.15 ||
        cur.recentWords.length > 0;

      const last = samplesRef.current.at(-1);
      if (
        last &&
        !speaking &&
        cur.volume < 0.03 &&
        Date.now() - started - last.t < sampleEveryMs * 2
      ) {
        return;
      }

      samplesRef.current.push({
        t: Date.now() - started,
        lips: { ...cur.lips },
        volume: cur.volume,
        pitchHint: cur.pitchHint,
        expression: { ...cur.expression },
        lipImage: cur.lipImage,
        transcript: cur.transcript,
        recentWords: [...cur.recentWords],
      });
      setSampleCount(samplesRef.current.length);
    };

    push();
    const id = window.setInterval(push, sampleEveryMs);
    return () => window.clearInterval(id);
  }, [active, sampleEveryMs]);

  const discard = useCallback(() => {
    clearMediaUrl();
    samplesRef.current = [];
    setSession(null);
    setSampleCount(0);
    setElapsedMs(0);
  }, [clearMediaUrl]);

  return {
    recording: active,
    elapsedMs,
    sampleCount,
    session,
    discard,
  };
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
