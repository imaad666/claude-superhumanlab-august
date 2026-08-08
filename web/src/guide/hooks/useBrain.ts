import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeHeuristic,
  type BrainInsight,
} from "../brainHeuristic";
import type { ExpressionFeatures, LipFeatures } from "../features";
import type { GuideMode } from "../types";

export type { BrainInsight };

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
  const [remote, setRemote] = useState<BrainInsight | null>(null);
  const [serverOk, setServerOk] = useState(false);
  const [ollama, setOllama] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const wokeRef = useRef(false);

  const local = useMemo(() => {
    if (!input.enabled) return null;
    return analyzeHeuristic({
      mode: input.mode,
      transcript: input.transcript,
      recentWords: input.recentWords,
      lips: input.lips,
      volume: input.volume,
      pitchHint: input.pitchHint,
      expression: input.expression,
      coachTarget: input.coachTarget,
    });
  }, [
    input.enabled,
    input.mode,
    input.transcript,
    input.recentWords,
    input.lips,
    input.volume,
    input.pitchHint,
    input.expression,
    input.coachTarget,
  ]);

  // Prefer live Ollama when available; otherwise snappy local heuristic
  const insight =
    remote?.source === "ollama" ? remote : (local ?? remote);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) throw new Error("Brain offline");
        const data = (await res.json()) as {
          ollama?: boolean;
          model_ready?: boolean;
        };
        if (!cancelled) {
          setServerOk(true);
          setOllama(Boolean(data.ollama));
          setModelReady(Boolean(data.model_ready));
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setServerOk(false);
          setOllama(false);
          setModelReady(false);
          setRemote(null);
        }
      }
    }

    void ping();
    const id = window.setInterval(ping, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // On Start: wake Ollama + pull/warm model once
  useEffect(() => {
    if (!input.enabled || !serverOk || wokeRef.current) return;
    let cancelled = false;

    async function wake() {
      setWaking(true);
      try {
        const res = await fetch("/api/wake", { method: "POST" });
        const data = (await res.json()) as {
          ok?: boolean;
          ollama?: boolean;
          model_ready?: boolean;
          warm?: boolean;
          error?: string;
        };
        if (cancelled) return;
        wokeRef.current = true;
        setOllama(Boolean(data.ollama));
        setModelReady(Boolean(data.model_ready && data.warm));
        if (data.error && !data.ok) {
          setError(data.error);
        }
      } catch {
        if (!cancelled) {
          setError("Could not wake model — using on-device brain");
        }
      } finally {
        if (!cancelled) setWaking(false);
      }
    }

    void wake();
    return () => {
      cancelled = true;
    };
  }, [input.enabled, serverOk]);

  useEffect(() => {
    if (!input.enabled) {
      wokeRef.current = false;
    }
  }, [input.enabled]);

  useEffect(() => {
    if (!input.enabled || !serverOk) return;

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
        setRemote({
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
          setRemote(null);
          setError(err instanceof Error ? err.message : "Analyze failed");
        }
      }
    }

    void analyze();
    const timer = window.setInterval(analyze, 1600);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    input.enabled,
    serverOk,
    input.transcript,
    input.coachTarget,
    input.recentWords.length,
    modelReady,
  ]);

  return {
    insight,
    status: (input.enabled ? "ready" : "idle") as "idle" | "ready" | "error",
    error,
    ollama,
    serverOk,
    modelReady,
    waking,
    source: insight?.source ?? null,
  };
}
