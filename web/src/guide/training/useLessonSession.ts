import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logLessonAttempt } from "../../slp/store";
import type { LipFeatures } from "../features";
import { demoLandmarksForViseme } from "./demoLandmarks";
import { fetchLesson } from "./fetchLesson";
import { scoreAttempt, scoreStep, shapeDistance } from "./scoreStep";
import type {
  LessonAttemptResult,
  LessonKind,
  LessonMemory,
  LessonPhase,
  TrainerMode,
} from "./types";

type LiveSample = { lips: LipFeatures; volume: number };

/**
 * Watch → recreate → result session for Learn Word / Learn Sentence.
 */
export function useLessonSession(
  trainerMode: TrainerMode,
  lips: LipFeatures,
  volume: number,
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

  const bestRef = useRef<Array<LiveSample | null>>([]);
  const lipsRef = useRef(lips);
  const volumeRef = useRef(volume);
  lipsRef.current = lips;
  volumeRef.current = volume;

  // Reset when switching trainer mode chips
  useEffect(() => {
    setPhase("pick");
    setLesson(null);
    setStepIndex(0);
    setBusy(false);
    setError(null);
    setResult(null);
    bestRef.current = [];
  }, [trainerMode]);

  const startLesson = useCallback((mem: LessonMemory) => {
    setLesson(mem);
    setPhase("watch");
    setStepIndex(0);
    setResult(null);
    setError(null);
    bestRef.current = mem.steps.map(() => null);
  }, []);

  const buildCustom = useCallback(
    async (text: string) => {
      if (!kind) return;
      setBusy(true);
      setError(null);
      try {
        const mem = await fetchLesson(text, kind);
        startLesson(mem);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not build lesson");
      } finally {
        setBusy(false);
      }
    },
    [kind, startLesson],
  );

  const watchAgain = useCallback(() => {
    if (!lesson) return;
    setPhase("watch");
    setStepIndex(0);
    setResult(null);
    bestRef.current = lesson.steps.map(() => null);
  }, [lesson]);

  const backToPick = useCallback(() => {
    setPhase("pick");
    setLesson(null);
    setStepIndex(0);
    setResult(null);
    setError(null);
  }, []);

  const beginRecreate = useCallback(() => {
    if (!lesson) return;
    setPhase("recreate");
    setStepIndex(0);
    setResult(null);
    bestRef.current = lesson.steps.map(() => null);
  }, [lesson]);

  // Watch phase: autoplay steps
  useEffect(() => {
    if (phase !== "watch" || !lesson) return;
    const step = lesson.steps[stepIndex];
    if (!step) return;
    const hold = step.holdMs || 650;
    const id = window.setTimeout(() => {
      if (stepIndex >= lesson.steps.length - 1) {
        // stay on last step until user clicks I'm ready
        return;
      }
      setStepIndex((i) => i + 1);
    }, hold);
    return () => window.clearTimeout(id);
  }, [phase, lesson, stepIndex]);

  // Recreate phase: sample best lips per step, advance on timer
  useEffect(() => {
    if (phase !== "recreate" || !lesson) return;
    const step = lesson.steps[stepIndex];
    if (!step) return;

    const sampleId = window.setInterval(() => {
      const sample = {
        lips: { ...lipsRef.current },
        volume: volumeRef.current,
      };
      const prev = bestRef.current[stepIndex];
      if (
        !prev ||
        shapeDistance(sample.lips, step) < shapeDistance(prev.lips, step)
      ) {
        bestRef.current[stepIndex] = sample;
      }
    }, 80);

    const hold = Math.max(900, (step.holdMs || 650) + 350);
    const advanceId = window.setTimeout(() => {
      if (stepIndex >= lesson.steps.length - 1) {
        const attempt = scoreAttempt(lesson, bestRef.current);
        setResult(attempt);
        setPhase("result");
        // Log per-phoneme attempts for the SLP dashboard — reads the scoring
        // output the trainer already produced, touches nothing upstream.
        logLessonAttempt(lesson, attempt);
        return;
      }
      setStepIndex((i) => i + 1);
    }, hold);

    return () => {
      window.clearInterval(sampleId);
      window.clearTimeout(advanceId);
    };
  }, [phase, lesson, stepIndex]);

  const currentStep = lesson?.steps[stepIndex] ?? null;

  const demoLandmarks = useMemo(() => {
    if (phase !== "watch" || !currentStep) return null;
    return demoLandmarksForViseme(currentStep.viseme);
  }, [phase, currentStep]);

  const liveScore = useMemo(() => {
    if (phase !== "recreate" || !currentStep) return null;
    return scoreStep(currentStep, lips, volume);
  }, [phase, currentStep, lips, volume]);

  return {
    kind,
    phase,
    lesson,
    stepIndex,
    busy,
    error,
    result,
    currentStep,
    demoLandmarks,
    liveScore,
    startLesson,
    buildCustom,
    watchAgain,
    backToPick,
    beginRecreate,
    retry: beginRecreate,
  };
}
