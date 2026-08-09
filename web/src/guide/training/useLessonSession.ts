import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logLessonAttempt } from "../../slp/store";
import type { LipFeatures } from "../features";
import { fetchLesson } from "./fetchLesson";
import { isVoiceActive, scoreAttempt, scoreStep, shapeDistance } from "./scoreStep";
import type {
  LessonAttemptResult,
  LessonKind,
  LessonMemory,
  LessonPhase,
  TrainerMode,
} from "./types";

type LiveSample = { lips: LipFeatures; volume: number };

const GOOD_HOLD_MS = 520;
const MAX_STEP_MS = 6000;

/**
 * Camera-first live guide: lips + voice → coach each sound → validate.
 * Logs finished attempts to the SLP store for progress.
 */
export function useLessonSession(
  trainerMode: TrainerMode,
  lips: LipFeatures,
  volume: number,
  trackingReady: boolean,
  spokenHint = "",
) {
  const kind: LessonKind | null =
    trainerMode === "word"
      ? "word"
      : trainerMode === "sentence"
        ? "sentence"
        : null;

  const [phase, setPhase] = useState<LessonPhase>("pick");
  const [lesson, setLesson] = useState<LessonMemory | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LessonAttemptResult | null>(null);
  const [goodMs, setGoodMs] = useState(0);

  const bestRef = useRef<Array<LiveSample | null>>([]);
  const lipsRef = useRef(lips);
  const volumeRef = useRef(volume);
  const spokenRef = useRef(spokenHint);
  const goodSinceRef = useRef<number | null>(null);
  const advancingRef = useRef(false);
  lipsRef.current = lips;
  volumeRef.current = volume;
  spokenRef.current = spokenHint;

  useEffect(() => {
    setPhase("pick");
    setLesson(null);
    setStepIndex(0);
    setBusy(false);
    setError(null);
    setResult(null);
    setGoodMs(0);
    bestRef.current = [];
    goodSinceRef.current = null;
  }, [trainerMode]);

  const startGuide = useCallback((mem: LessonMemory) => {
    setLesson(mem);
    setPhase("guide");
    setStepIndex(0);
    setResult(null);
    setError(null);
    setGoodMs(0);
    bestRef.current = mem.steps.map(() => null);
    goodSinceRef.current = null;
    advancingRef.current = false;
  }, []);

  const buildCustom = useCallback(
    async (text: string) => {
      if (!kind) return;
      setBusy(true);
      setError(null);
      try {
        const mem = await fetchLesson(text, kind);
        startGuide(mem);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not build lesson");
      } finally {
        setBusy(false);
      }
    },
    [kind, startGuide],
  );

  const retry = useCallback(() => {
    if (!lesson) return;
    startGuide(lesson);
  }, [lesson, startGuide]);

  const backToPick = useCallback(() => {
    setPhase("pick");
    setLesson(null);
    setStepIndex(0);
    setResult(null);
    setError(null);
    setGoodMs(0);
    goodSinceRef.current = null;
  }, []);

  const finish = useCallback((mem: LessonMemory) => {
    const attempt = scoreAttempt(mem, bestRef.current);
    setResult(attempt);
    setPhase("result");
    setGoodMs(0);
    goodSinceRef.current = null;
    // SLP dashboard progress — phoneme attempts from this lesson.
    logLessonAttempt(mem, attempt);
  }, []);

  const advance = useCallback(() => {
    if (!lesson || advancingRef.current) return;
    advancingRef.current = true;
    if (stepIndex >= lesson.steps.length - 1) {
      finish(lesson);
      return;
    }
    setStepIndex((i) => i + 1);
    setGoodMs(0);
    goodSinceRef.current = null;
    window.setTimeout(() => {
      advancingRef.current = false;
    }, 120);
  }, [lesson, stepIndex, finish]);

  const currentStep = lesson?.steps[stepIndex] ?? null;

  const liveScore = useMemo(() => {
    if (phase !== "guide" || !currentStep) return null;
    return scoreStep(currentStep, lips, volume, spokenHint);
  }, [phase, currentStep, lips, volume, spokenHint]);

  // Live guide: sample lips+voice; advance when held "good"
  useEffect(() => {
    if (phase !== "guide" || !lesson || !currentStep) return;

    const stepStarted = Date.now();
    const sampleId = window.setInterval(() => {
      if (!trackingReady) return;

      const sample = {
        lips: { ...lipsRef.current },
        volume: volumeRef.current,
      };
      const prev = bestRef.current[stepIndex];
      const scoreNow = scoreStep(
        currentStep,
        sample.lips,
        sample.volume,
        spokenRef.current,
      );
      if (
        !prev ||
        shapeDistance(sample.lips, currentStep) <
          shapeDistance(prev.lips, currentStep) ||
        sample.volume > prev.volume + 0.02
      ) {
        bestRef.current[stepIndex] = sample;
      }

      const now = Date.now();

      if (scoreNow.match === "good") {
        if (goodSinceRef.current == null) goodSinceRef.current = now;
        const held = now - goodSinceRef.current;
        setGoodMs(held);
        if (held >= GOOD_HOLD_MS) {
          advance();
        }
      } else {
        goodSinceRef.current = null;
        setGoodMs(0);
      }

      if (now - stepStarted >= MAX_STEP_MS) {
        advance();
      }
    }, 80);

    return () => window.clearInterval(sampleId);
  }, [phase, lesson, currentStep, stepIndex, trackingReady, advance]);

  return {
    kind,
    phase,
    lesson,
    stepIndex,
    busy,
    error,
    result,
    currentStep,
    liveScore,
    goodMs,
    goodHoldMs: GOOD_HOLD_MS,
    voiceActive: isVoiceActive(volume),
    volume,
    startLesson: startGuide,
    buildCustom,
    retry,
    backToPick,
    advance,
  };
}
