import { useCallback, useEffect, useRef, useState } from "react";
import type { ToneKind, TranscriptWord } from "../types";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

function toneFromMetrics(volume: number, pitchHint: number): ToneKind {
  if (volume < 0.02) return "soft";
  if (pitchHint > 0.45) return "bright";
  if (volume > 0.12) return "warm";
  return "calm";
}

function wordsFromText(
  text: string,
  volume: number,
  pitchHint: number,
  t?: number,
): TranscriptWord[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => ({
      id: `${Date.now()}-${i}-${word}`,
      text: word,
      tone: toneFromMetrics(volume, pitchHint + (i % 3) * 0.03),
      t,
    }));
}

export function useLiveTranscript(
  enabled: boolean,
  volume: number,
  pitchHint: number,
  recordingStartedAt: number | null = null,
) {
  const [words, setWords] = useState<TranscriptWord[]>([]);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const metricsRef = useRef({ volume, pitchHint });
  const recordingStartedAtRef = useRef<number | null>(recordingStartedAt);

  useEffect(() => {
    metricsRef.current = { volume, pitchHint };
  }, [volume, pitchHint]);

  useEffect(() => {
    recordingStartedAtRef.current = recordingStartedAt;
  }, [recordingStartedAt]);

  useEffect(() => {
    if (!enabled) return;

    const SpeechRecognitionCtor =
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
      ).SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        }
      ).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let interimText = "";
      const finals: string[] = [];

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finals.push(text);
        else interimText += text;
      }

      if (finals.length) {
        const { volume: v, pitchHint: p } = metricsRef.current;
        const startedAt = recordingStartedAtRef.current;
        const t = startedAt == null ? undefined : Math.max(0, Date.now() - startedAt);
        const next = finals.flatMap((chunk) => wordsFromText(chunk, v, p, t));
        setWords((prev) => [...prev, ...next].slice(-80));
      }
      setInterim(interimText);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(event.error);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      // Keep listening with a short delay (acceptable latency for demo)
      if (enabled) {
        window.setTimeout(() => {
          try {
            recognition.start();
            setListening(true);
          } catch {
            /* already started */
          }
        }, 280);
      }
    };

    try {
      recognition.start();
      setListening(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start STT");
    }

    return () => {
      recognition.onend = null;
      recognition.stop();
      recognitionRef.current = null;
      setListening(false);
    };
  }, [enabled]);

  const clear = useCallback(() => {
    setWords([]);
    setInterim("");
  }, []);

  return { words, interim, listening, error, clear };
}
