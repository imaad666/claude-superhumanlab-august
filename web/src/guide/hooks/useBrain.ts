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
  /** data-URL or raw base64 lip crop for vision model */
  lipImage: string | null;
};

export function useBrain(input: BrainInput) {
  const [remote, setRemote] = useState<BrainInsight | null>(null);
  const [serverOk, setServerOk] = useState(false);
  const [ollama, setOllama] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [waking, setWaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const wokeRef = useRef(false);
  const inFlight = useRef(false);

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

  // Live metrics always; vision coaching overlays when fresh
  const insight = useMemo(() => {
    if (!local) return remote;
    if (!remote || remote.source !== "ollama") return local;
    return {
      ...local,
      tone: remote.tone,
      mood: remote.mood,
      intention: remote.intention,
      summary: remote.summary,
      lipMatch: remote.lipMatch,
      lipCue: remote.lipCue,
      source: remote.source,
      model: remote.model,
      usedVision: remote.usedVision,
      words: remote.words.length ? remote.words : local.words,
    };
  }, [local, remote]);

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

  useEffect(() => {
    if (!input.enabled || !serverOk || wokeRef.current) return;
    let cancelled = false;

    async function wake() {
      // #region agent log
      fetch("http://127.0.0.1:7904/ingest/a7463e60-1f4a-4b91-b6b8-9ad6b90b1214", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "21c060",
        },
        body: JSON.stringify({
          sessionId: "21c060",
          hypothesisId: "H4",
          location: "useBrain.ts:wake",
          message: "brain wake started",
          data: { mode: inputRef.current.mode, enabled: inputRef.current.enabled },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
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
        if (data.error && !data.ok) setError(data.error);
      } catch {
        if (!cancelled) {
          setError("Could not wake vision model — live metrics still on");
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
    if (input.enabled) return;

    // An in-flight request is intentionally ignored after Stop. Reset all
    // request-derived UI state as well, so the panel cannot remain “Seeing…”
    // or show coaching from the previous camera session.
    wokeRef.current = false;
    inFlight.current = false;
    setRemote(null);
    setWaking(false);
    setThinking(false);
    setError(null);
  }, [input.enabled]);

  useEffect(() => {
    if (!input.enabled || !serverOk) return;

    let cancelled = false;

    async function analyze() {
      if (inFlight.current) return;
      const current = inputRef.current;
      const targetAtRequest = current.coachTarget;
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
          location: "useBrain.ts:analyze",
          message: "analyze request",
          data: {
            mode: current.mode,
            hasLipImage: Boolean(current.lipImage),
            lipImageChars: current.lipImage?.length ?? 0,
            openness: current.lips.openness,
            volume: current.volume,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      inFlight.current = true;
      setThinking(true);
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
            lip_image: current.lipImage,
          }),
        });
        if (!res.ok) throw new Error(`Analyze failed (${res.status})`);
        const data = await res.json();
        // A lesson may already have advanced to a new sound while Gemma was
        // looking at the previous crop. Never show that old cue on the new
        // target step.
        if (cancelled || inputRef.current.coachTarget !== targetAtRequest) {
          return;
        }
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
          usedVision: Boolean(data.used_vision),
        });
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Analyze failed");
        }
      } finally {
        inFlight.current = false;
        if (!cancelled) setThinking(false);
      }
    }

    void analyze();
    // Vision is slower — poll gently; heuristic UI stays live via `local`
    const timer = window.setInterval(analyze, 2800);
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
    // re-run when a new lip frame arrives (throttled by inFlight)
    input.lipImage?.slice(0, 48),
  ]);

  return {
    insight,
    live: local,
    status: (input.enabled ? "ready" : "idle") as "idle" | "ready" | "error",
    error,
    ollama,
    serverOk,
    modelReady,
    waking,
    thinking,
    source: insight?.source ?? null,
  };
}
