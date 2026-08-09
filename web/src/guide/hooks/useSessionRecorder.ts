import { useCallback, useEffect, useRef, useState } from "react";
import type { ExpressionFeatures, LipFeatures } from "../features";
import { packLandmarks } from "../landmarksPack";
import type { Point } from "../lips";
import type { GuideSession, SessionSample } from "../sessionTypes";
import type { TranscriptWord } from "../types";

type RecorderInput = {
  active: boolean;
  /** Shared clock origin for browser transcript, lip samples, and A/V. */
  startedAt?: number | null;
  stream: MediaStream | null;
  lips: LipFeatures;
  volume: number;
  pitchHint: number;
  expression: ExpressionFeatures;
  lipImage: string | null;
  landmarks: Point[] | null;
  transcript: string;
  recentWords: string[];
  words: TranscriptWord[];
  /** Lets the owner release the camera only after MediaRecorder has flushed. */
  onCaptureComplete?: () => void;
  /** How often to sample metrics / lip vectors (ms). */
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
 * Live Guide recorder — captures A/V + MediaPipe lip vectors while active.
 * Model lesson-build / analysis happens after stop.
 */
export function useSessionRecorder(input: RecorderInput) {
  const {
    active,
    stream,
    sampleEveryMs = 280,
  } = input;

  const [elapsedMs, setElapsedMs] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [session, setSession] = useState<GuideSession | null>(null);
  const [stopping, setStopping] = useState(false);

  const samplesRef = useRef<SessionSample[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mediaUrlRef = useRef<string | null>(null);
  const mediaStartedAtRef = useRef<number | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const stoppingRef = useRef(false);
  const finalizedRef = useRef(false);
  const finishRef = useRef<(
    url: string | null,
    blob?: Blob | null,
    mimeType?: string | null,
  ) => void>(() => undefined);

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
    finalizedRef.current = false;
    clearMediaUrl();
    samplesRef.current = [];
    chunksRef.current = [];
    startedAtRef.current = inputRef.current.startedAt ?? Date.now();
    mediaStartedAtRef.current = null;
    setElapsedMs(0);
    setSampleCount(0);
    setSession(null);
    setStopping(false);

    const finish = (
      url: string | null,
      blob: Blob | null = null,
      mimeType: string | null = null,
    ) => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      const startedAt = startedAtRef.current ?? Date.now();
      const endedAt = Date.now();
      const samples = [...samplesRef.current];
      const finalWords = [...inputRef.current.words];
      const transcript = inputRef.current.transcript.trim();
      const mediaStartedAt = mediaStartedAtRef.current ?? startedAt;

      setSession({
        id: `live-${startedAt}`,
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        mediaStartOffsetMs: Math.max(0, mediaStartedAt - startedAt),
        samples,
        words: finalWords,
        transcript,
        transcriptSource: transcript ? "live-browser" : "none",
        mediaUrl: url,
        mediaBlob: blob,
        mediaMimeType: mimeType,
      });
      setSampleCount(samples.length);
      setElapsedMs(endedAt - startedAt);
      setStopping(false);
      startedAtRef.current = null;
      inputRef.current.onCaptureComplete?.();
    };
    finishRef.current = finish;

    const tick = window.setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 250);

    return () => {
      window.clearInterval(tick);
      if (finalizedRef.current) return;
      stoppingRef.current = true;
      const recorder = mediaRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
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
      recorder.onstart = () => {
        mediaStartedAtRef.current = Date.now();
      };
      recorder.onstop = () => {
        clearMediaUrl();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        let mediaUrl: string | null = null;
        if (blob.size > 0) {
          mediaUrl = URL.createObjectURL(blob);
          mediaUrlRef.current = mediaUrl;
        }
        if (mediaRef.current === recorder) mediaRef.current = null;
        finishRef.current(
          mediaUrl,
          blob.size > 0 ? blob : null,
          recorder.mimeType || null,
        );
      };
      recorder.start(1000);
    } catch {
      mediaRef.current = null;
    }

    return () => {
      /* stop handled by active-effect cleanup */
    };
  }, [active, stream, clearMediaUrl]);

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

      // Keep lip crops sparse — vectors every tick, JPEG less often.
      const lastWithImage = [...samplesRef.current]
        .reverse()
        .find((s) => s.lipImage);
      const wantImage =
        Boolean(cur.lipImage) &&
        (!lastWithImage || Date.now() - started - lastWithImage.t >= 1100);

      samplesRef.current.push({
        t: Date.now() - started,
        lips: { ...cur.lips },
        volume: cur.volume,
        pitchHint: cur.pitchHint,
        expression: { ...cur.expression },
        lipImage: wantImage ? cur.lipImage : null,
        landmarks: packLandmarks(cur.landmarks),
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
    mediaStartedAtRef.current = null;
    setSession(null);
    setSampleCount(0);
    setElapsedMs(0);
  }, [clearMediaUrl]);

  const stop = useCallback(() => {
    if (!active || stoppingRef.current) return;
    stoppingRef.current = true;
    setStopping(true);
    const recorder = mediaRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        finishRef.current(null);
      }
      return;
    }
    finishRef.current(null);
  }, [active]);

  return {
    recording: active,
    stopping,
    elapsedMs,
    sampleCount,
    session,
    stop,
    discard,
  };
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
