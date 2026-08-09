import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logLessonAttempt } from "../../slp/store";
import type { ExpressionFeatures, LipFeatures } from "../features";
import { analyzeLessonAttempt, type LessonAttemptSample } from "./analyzeAttempt";
import { findBankLesson } from "./bank";
import { fetchLesson } from "./fetchLesson";
import { heuristicLesson } from "./heuristicLesson";
import { isVoiceActive, scoreAttempt, scoreStep, shapeDistance } from "./scoreStep";
import type {
  LessonAttemptResult,
  LessonAttemptFeedback,
  LessonKind,
  LessonMemory,
  LessonPhase,
  TrainerMode,
} from "./types";

type LiveSample = LessonAttemptSample;

export type SentenceProgress = {
  text: string;
  wordIndex: number;
  totalWords: number;
  nextWord: string | null;
  nextReady: boolean;
};

const GOOD_HOLD_MS = 520;
const MAX_STEP_MS = 6000;

function sentenceWords(text: string): string[] {
  return text.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? [];
}

function immediateWordLesson(word: string): LessonMemory {
  return findBankLesson(word, "word") ?? heuristicLesson(word, "word");
}

/**
 * Camera-first live guide: lips + voice → coach each sound → validate.
 * Logs finished attempts to the SLP store for progress.
 */
export function useLessonSession(
  trainerMode: TrainerMode,
  lips: LipFeatures,
  volume: number,
  pitchHint: number,
  trackingReady: boolean,
  spokenHint = "",
  lipImage: string | null = null,
  onWordStart?: () => void,
  expression: ExpressionFeatures | null = null,
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
  const [feedback, setFeedback] = useState<LessonAttemptFeedback | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [goodMs, setGoodMs] = useState(0);
  const [sentenceProgress, setSentenceProgress] =
    useState<SentenceProgress | null>(null);
  const [nextWordLoading, setNextWordLoading] = useState(false);

  const bestRef = useRef<Array<LiveSample | null>>([]);
  const lipsRef = useRef(lips);
  const volumeRef = useRef(volume);
  const pitchRef = useRef(pitchHint);
  const spokenRef = useRef(spokenHint);
  const lipImageRef = useRef(lipImage);
  const expressionRef = useRef(expression);
  const goodSinceRef = useRef<number | null>(null);
  const advancingRef = useRef(false);
  const feedbackRequestRef = useRef(0);
  const sentenceRunRef = useRef(0);
  const prefetchedWordsRef = useRef(new Map<number, LessonMemory>());
  const prefetchingWordsRef = useRef(new Set<number>());
  // Only the word immediately after the one on screen may control the
  // "preparing" state. An older request can finish after the learner has
  // already moved on, so it must not make the newer word look ready.
  const nextWordLoadRef = useRef<{
    runId: number;
    wordIndex: number;
  } | null>(null);
  lipsRef.current = lips;
  volumeRef.current = volume;
  pitchRef.current = pitchHint;
  spokenRef.current = spokenHint;
  lipImageRef.current = lipImage;
  expressionRef.current = expression;

  useEffect(() => {
    setPhase("pick");
    setLesson(null);
    setStepIndex(0);
    setBusy(false);
    setError(null);
    setResult(null);
    setFeedback(null);
    setFeedbackBusy(false);
    feedbackRequestRef.current += 1;
    sentenceRunRef.current += 1;
    prefetchedWordsRef.current.clear();
    prefetchingWordsRef.current.clear();
    nextWordLoadRef.current = null;
    setSentenceProgress(null);
    setNextWordLoading(false);
    setGoodMs(0);
    bestRef.current = [];
    goodSinceRef.current = null;
  }, [trainerMode]);

  const startWordGuide = useCallback((mem: LessonMemory) => {
    onWordStart?.();
    setLesson(mem);
    setPhase("guide");
    setStepIndex(0);
    setResult(null);
    setFeedback(null);
    setFeedbackBusy(false);
    feedbackRequestRef.current += 1;
    setError(null);
    setGoodMs(0);
    bestRef.current = mem.steps.map(() => null);
    goodSinceRef.current = null;
    advancingRef.current = false;
  }, [onWordStart]);

  const prefetchSentenceWord = useCallback(
    (word: string, wordIndex: number, runId: number) => {
      if (
        prefetchedWordsRef.current.has(wordIndex) ||
        prefetchingWordsRef.current.has(wordIndex)
      ) {
        return;
      }
      prefetchingWordsRef.current.add(wordIndex);
      nextWordLoadRef.current = { runId, wordIndex };
      setNextWordLoading(true);
      void fetchLesson(word, "word")
        .then((nextLesson) => {
          if (sentenceRunRef.current !== runId) return;
          prefetchedWordsRef.current.set(wordIndex, nextLesson);
          setSentenceProgress((current) =>
            current && current.wordIndex + 1 === wordIndex
              ? { ...current, nextReady: true }
              : current,
          );
        })
        .catch(() => {
          // A local heuristic lesson will be used immediately if needed.
        })
        .finally(() => {
          prefetchingWordsRef.current.delete(wordIndex);
          if (sentenceRunRef.current !== runId) return;
          if (
            nextWordLoadRef.current?.runId === runId &&
            nextWordLoadRef.current.wordIndex === wordIndex
          ) {
            nextWordLoadRef.current = null;
            setNextWordLoading(false);
          }
        });
    },
    [],
  );

  const startGuide = useCallback(
    (mem: LessonMemory) => {
      const words = mem.kind === "sentence" ? sentenceWords(mem.text) : [];
      if (mem.kind === "sentence" && words.length === 0) {
        setError("Type a sentence with at least one word");
        return;
      }
      if (words.length > 1) {
        const runId = sentenceRunRef.current + 1;
        sentenceRunRef.current = runId;
        prefetchedWordsRef.current.clear();
        prefetchingWordsRef.current.clear();
        nextWordLoadRef.current = null;
        const nextWord = words[1] ?? null;
        setSentenceProgress({
          text: mem.text,
          wordIndex: 0,
          totalWords: words.length,
          nextWord,
          nextReady: false,
        });
        setNextWordLoading(Boolean(nextWord));
        startWordGuide(immediateWordLesson(words[0]));
        if (nextWord) prefetchSentenceWord(nextWord, 1, runId);
        return;
      }

      if (mem.kind === "sentence") {
        sentenceRunRef.current += 1;
        prefetchedWordsRef.current.clear();
        prefetchingWordsRef.current.clear();
        nextWordLoadRef.current = null;
        setSentenceProgress({
          text: mem.text,
          wordIndex: 0,
          totalWords: 1,
          nextWord: null,
          nextReady: false,
        });
        setNextWordLoading(false);
        startWordGuide(immediateWordLesson(words[0]));
        return;
      }

      sentenceRunRef.current += 1;
      prefetchedWordsRef.current.clear();
      prefetchingWordsRef.current.clear();
      nextWordLoadRef.current = null;
      setSentenceProgress(null);
      setNextWordLoading(false);
      startWordGuide(mem);
    },
    [prefetchSentenceWord, startWordGuide],
  );

  const buildCustom = useCallback(
    async (text: string) => {
      if (!kind) return;
      setBusy(true);
      setError(null);
      try {
        const clean = text.trim().replace(/\s+/g, " ");
        if (!clean) throw new Error("Type a word or sentence first");
        if (kind === "sentence") {
          // Start immediately on word one; the following word is fetched in
          // the background instead of waiting for a whole-sentence lesson.
          startGuide({
            text: clean,
            kind: "sentence",
            tip: "Practice one word at a time.",
            steps: [],
            source: "heuristic",
          });
        } else {
          const mem = await fetchLesson(clean, kind);
          startGuide(mem);
        }
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
    startWordGuide(lesson);
  }, [lesson, startWordGuide]);

  const continueSentence = useCallback(() => {
    if (
      !sentenceProgress ||
      sentenceProgress.wordIndex >= sentenceProgress.totalWords - 1
    ) {
      return;
    }
    const words = sentenceWords(sentenceProgress.text);
    const nextIndex = sentenceProgress.wordIndex + 1;
    const nextWord = words[nextIndex];
    if (!nextWord) return;

    const followingIndex = nextIndex + 1;
    const followingWord = words[followingIndex] ?? null;
    const nextLesson =
      prefetchedWordsRef.current.get(nextIndex) ?? immediateWordLesson(nextWord);
    const runId = sentenceRunRef.current;
    setSentenceProgress({
      ...sentenceProgress,
      wordIndex: nextIndex,
      nextWord: followingWord,
      nextReady: Boolean(
        followingWord && prefetchedWordsRef.current.has(followingIndex),
      ),
    });
    setNextWordLoading(
      Boolean(followingWord && !prefetchedWordsRef.current.has(followingIndex)),
    );
    if (!followingWord || prefetchedWordsRef.current.has(followingIndex)) {
      nextWordLoadRef.current = null;
    }
    startWordGuide(nextLesson);
    if (followingWord) {
      prefetchSentenceWord(followingWord, followingIndex, runId);
    }
  }, [prefetchSentenceWord, sentenceProgress, startWordGuide]);

  const backToPick = useCallback(() => {
    setPhase("pick");
    setLesson(null);
    setStepIndex(0);
    setResult(null);
    setFeedback(null);
    setFeedbackBusy(false);
    feedbackRequestRef.current += 1;
    sentenceRunRef.current += 1;
    prefetchedWordsRef.current.clear();
    prefetchingWordsRef.current.clear();
    nextWordLoadRef.current = null;
    setSentenceProgress(null);
    setNextWordLoading(false);
    setError(null);
    setGoodMs(0);
    goodSinceRef.current = null;
  }, []);

  const finish = useCallback((mem: LessonMemory) => {
    const attempt = scoreAttempt(mem, bestRef.current);
    const samples = [...bestRef.current];
    const transcript = spokenRef.current;
    const requestId = feedbackRequestRef.current + 1;
    feedbackRequestRef.current = requestId;

    setResult(attempt);
    setFeedback(null);
    setFeedbackBusy(true);
    setPhase("result");
    setGoodMs(0);
    goodSinceRef.current = null;
    // SLP dashboard progress — phoneme attempts from this lesson.
    logLessonAttempt(mem, attempt);

    void analyzeLessonAttempt(mem, attempt, samples, transcript)
      .then((nextFeedback) => {
        if (feedbackRequestRef.current === requestId) {
          setFeedback(nextFeedback);
        }
      })
      .catch(() => {
        // The local score remains useful if the model is unavailable.
      })
      .finally(() => {
        if (feedbackRequestRef.current === requestId) {
          setFeedbackBusy(false);
        }
      });
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

      const current = {
        lips: { ...lipsRef.current },
        volume: volumeRef.current,
        pitchHint: pitchRef.current,
        lipImage: lipImageRef.current,
        expression: expressionRef.current
          ? { ...expressionRef.current }
          : null,
      };
      const prev = bestRef.current[stepIndex];
      const sampleCount = (prev?.sampleCount ?? 0) + 1;
      const betterShape =
        !prev ||
        shapeDistance(current.lips, currentStep) <
          shapeDistance(prev.lips, currentStep);
      const sample = {
        // Preserve the frame with the best mouth geometry, independent of
        // the loudest moment. Voice evidence is accumulated separately.
        lips: betterShape ? current.lips : prev.lips,
        lipImage: betterShape ? current.lipImage : prev.lipImage,
        expression: betterShape
          ? current.expression
          : (prev.expression ?? current.expression),
        volume: Math.max(prev?.volume ?? 0, current.volume),
        pitchHint:
          ((prev?.pitchHint ?? 0) * (sampleCount - 1) + current.pitchHint) /
          sampleCount,
        voicedMs:
          (prev?.voicedMs ?? 0) +
          (isVoiceActive(current.volume) ? 80 : 0),
        sampleCount,
      };
      const scoreNow = scoreStep(
        currentStep,
        current.lips,
        current.volume,
        spokenRef.current,
        current.pitchHint,
        current.expression,
      );
      bestRef.current[stepIndex] = sample;

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
    feedback,
    feedbackBusy,
    sentenceProgress,
    nextWordLoading,
    currentStep,
    liveScore,
    goodMs,
    goodHoldMs: GOOD_HOLD_MS,
    voiceActive: isVoiceActive(volume),
    volume,
    startLesson: startGuide,
    buildCustom,
    retry,
    continueSentence,
    backToPick,
    advance,
  };
}
