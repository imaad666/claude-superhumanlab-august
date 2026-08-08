import { useEffect, useRef, useState } from "react";
import type { ExpressionFeatures, LipFeatures } from "../features";
import type { GuideMode, ToneKind } from "../types";

export type BrainInsight = {
  tone: ToneKind;
  mood: string;
  intention: string;
  summary: string;
  lipMatch: "good" | "close" | "try_again";
  lipCue: string;
  words: { text: string; tone: ToneKind; tip?: string | null }[];
  source: "ollama" | "heuristic";
  model: string | null;
};

type BrainInput = {
  enabled: boolean;
  mode: GuideMode;
  transcript: string;
  recentWords: string[];
  lips: LipFeatures;
  volume: number;
  pitchHint: number;
  expression: ExpressionFeatures;
  coachTarget: string | null;
};

export function useBrain(input: BrainInput) {
  const [insight, setInsight] = useState<BrainInsight | null>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ollama, setOllama] = useState(false);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) throw new Error("Brain offline");
        const data = (await res.json()) as { ollama?: boolean };
        if (!cancelled) {
          setStatus("ready");
          setOllama(Boolean(data.ollama));
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setOllama(false);
          setError("Start the local brain: cd server && uvicorn main:app --port 8000");
        }
      }
    }

    void ping();
    const id = window.setInterval(ping, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!input.enabled || status !== "ready") return;

    let cancelled = false;

    async function analyze() {
      const current = inputRef.current;
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: current.mode,
            transcript: current.transcript,
            recent_words: current.recentWords,
            lips: {
              openness: current.lips.openness,
              width: current.lips.width,
              roundness: current.lips.roundness,
              viseme_guess: current.lips.visemeGuess,
            },
            audio: {
              volume: current.volume,
              pitch_hint: current.pitchHint,
            },
            expression: {
              smile: current.expression.smile,
              brow_up: current.expression.browUp,
              brow_down: current.expression.browDown,
              jaw_open: current.expression.jawOpen,
              mouth_funnel: current.expression.mouthFunnel,
            },
            coach_target: current.coachTarget,
          }),
        });
        if (!res.ok) throw new Error(`Analyze failed (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setInsight({
          tone: data.tone,
          mood: data.mood,
          intention: data.intention,
          summary: data.summary,
          lipMatch: data.lip_match,
          lipCue: data.lip_cue,
          words: data.words ?? [],
          source: data.source,
          model: data.model,
        });
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Analyze failed");
        }
      }
    }

    void analyze();
    const id = window.setInterval(analyze, 2200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [input.enabled, status]);

  return { insight, status, error, ollama };
}
