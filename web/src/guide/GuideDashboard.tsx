import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { analyzeSession } from "./analyzeSession";
import { InsightPanel } from "./components/InsightPanel";
import { LipCoachPanel } from "./components/LipCoachPanel";
import { LipCropPanel } from "./components/LipCropPanel";
import { SessionReviewPanel } from "./components/SessionReviewPanel";
import { TranscriptPanel } from "./components/TranscriptPanel";
import {
  expressionFromBlendshapes,
  lipFeaturesFromLandmarks,
} from "./features";
import { useBrain } from "./hooks/useBrain";
import { useCamera } from "./hooks/useCamera";
import { useFaceLandmarker } from "./hooks/useFaceLandmarker";
import { useLipFrame } from "./hooks/useLipFrame";
import { useLiveTranscript } from "./hooks/useLiveTranscript";
import {
  formatDuration,
  useSessionRecorder,
} from "./hooks/useSessionRecorder";
import { useSpectrogram } from "./hooks/useSpectrogram";
import { unpackLandmarks } from "./landmarksPack";
import { saveRecording } from "./recordings/recordingStore";
import type { SessionAnalysis } from "./sessionTypes";
import { findBankLesson } from "./training/bank";
import { buildSessionLessons } from "./training/buildSessionLessons";
import { LessonPicker } from "./training/LessonPicker";
import { LessonPlayer } from "./training/LessonPlayer";
import type { LessonMemory, TrainerMode } from "./training/types";
import { useLessonSession } from "./training/useLessonSession";
import { mediapipePoseForViseme } from "./training/visemePoses";
import type { GuideMode, TranscriptWord } from "./types";
import { type VisemeId } from "./visemes";
import "./GuideDashboard.css";

type GuideDashboardProps = {
  mode: GuideMode;
  /** Word to jump straight into, e.g. from the SLP dashboard's assigned set. */
  initialWord?: string | null;
};

export function GuideDashboard({ mode, initialWord }: GuideDashboardProps) {
  const isLive = mode === "live";
  const [trainerMode, setTrainerMode] = useState<TrainerMode>(
    !isLive && initialWord
      ? (findBankLesson(initialWord)?.kind ?? "word")
      : "free",
  );
  const [pendingWord, setPendingWord] = useState<string | null>(
    !isLive ? initialWord ?? null : null,
  );
  const isLearn = !isLive && trainerMode !== "free";

  const [active, setActive] = useState(false);
  const [learnCam, setLearnCam] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [spectroCanvas, setSpectroCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [coachTarget, setCoachTarget] = useState<VisemeId | null>(null);

  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [buildingLessons, setBuildingLessons] = useState(false);
  const [builtLessons, setBuiltLessons] = useState<LessonMemory[] | null>(null);
  const [builtLessonsTip, setBuiltLessonsTip] = useState<string | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(
    null,
  );
  const [savingRecording, setSavingRecording] = useState(false);
  const [savedRecordingId, setSavedRecordingId] = useState<string | null>(null);
  const [recordingSaveError, setRecordingSaveError] = useState<string | null>(
    null,
  );

  const cameraActive =
    (!isLive && trainerMode === "free" && active) ||
    (isLive && active) ||
    (isLearn && learnCam);

  // Keep STT off during Learn pick/result so free-practice history can't
  // swallow lesson speech, and vice versa. Live / free only while armed.
  const [lessonPhase, setLessonPhase] = useState<
    "pick" | "guide" | "result"
  >("pick");
  const sttEnabled =
    cameraActive &&
    ((isLive && active) ||
      (!isLive && trainerMode === "free" && active) ||
      (isLearn && lessonPhase === "guide"));

  const camera = useCamera(cameraActive);
  const face = useFaceLandmarker(videoEl, cameraActive && camera.ready);
  const spectro = useSpectrogram(camera.stream, spectroCanvas, cameraActive);
  const transcript = useLiveTranscript(
    sttEnabled,
    spectro.volume,
    spectro.pitchHint,
    isLive && active ? recordingStartedAt : null,
  );
  const lipFrame = useLipFrame(
    videoEl,
    face.lipBox,
    cameraActive && Boolean(face.lipBox),
    isLive ? 1100 : 900,
  );

  const latestText =
    transcript.words.at(-1)?.text ?? transcript.interim ?? "";
  const lips = useMemo(
    () => lipFeaturesFromLandmarks(face.landmarks, latestText),
    [face.landmarks, latestText],
  );
  const expression = useMemo(
    () => expressionFromBlendshapes(face.blendshapes),
    [face.blendshapes],
  );

  const trackingReady = Boolean(cameraActive && face.landmarks);

  const fullTranscript = transcript.words.map((w) => w.text).join(" ");
  const recentWords = transcript.words.map((w) => w.text);
  // Learn scoring / feedback: only the latest speech window so free practice
  // (or earlier steps) never falsely match the current sound.
  const recentSpoken = [
    ...transcript.words.slice(-8).map((w) => w.text),
    transcript.interim,
  ]
    .join(" ")
    .trim();
  const spokenHint = isLearn
    ? recentSpoken
    : `${fullTranscript} ${transcript.interim}`.trim();
  const clearLessonTranscript = useCallback(() => transcript.clear(), [
    transcript.clear,
  ]);

  const lesson = useLessonSession(
    isLive ? "free" : trainerMode,
    lips,
    spectro.volume,
    spectro.pitchHint,
    trackingReady,
    spokenHint,
    lipFrame,
    clearLessonTranscript,
    expression,
  );

  useEffect(() => {
    setLessonPhase(lesson.phase);
  }, [lesson.phase]);

  useEffect(() => {
    if (isLearn && lessonPhase !== "guide") {
      transcript.clear();
    }
  }, [isLearn, lessonPhase, transcript.clear]);

  // Learn modes: keep camera on for pick, guide, and result (no dead empty panels)
  useEffect(() => {
    if (!isLearn) {
      setLearnCam(false);
      return;
    }
    setLearnCam(true);
    setActive(true);
  }, [isLearn]);

  const suggestedViseme = useMemo(
    () => coachTarget ?? lips.visemeGuess,
    [coachTarget, lips.visemeGuess],
  );
  const lessonTarget =
    isLearn && lesson.phase === "guide"
      ? (lesson.currentStep?.viseme ?? null)
      : null;
  // Lesson scoring stays local and frame-rate fast. Only send a crop to the
  // slower vision model while a learner is on an active sound step.
  const lessonVisionActive = Boolean(
    lessonTarget && trackingReady && lipFrame,
  );
  const brainEnabled =
    !isLive &&
    active &&
    (trainerMode === "free" || (isLearn && lessonVisionActive));
  const brainCoachTarget = lessonTarget ?? suggestedViseme;

  const brain = useBrain({
    enabled: brainEnabled,
    mode,
    transcript: fullTranscript,
    recentWords,
    lips,
    volume: spectro.volume,
    pitchHint: spectro.pitchHint,
    expression,
    coachTarget: brainCoachTarget,
    lipImage: lipFrame,
  });
  const lessonVisionInsight =
    isLearn && brain.insight?.source === "ollama" ? brain.insight : null;

  const finishLiveCapture = useCallback(() => {
    setActive(false);
    setRecordingStartedAt(null);
  }, []);

  const recorder = useSessionRecorder({
    active: active && isLive,
    startedAt: recordingStartedAt,
    stream: camera.stream,
    lips,
    volume: spectro.volume,
    pitchHint: spectro.pitchHint,
    expression,
    lipImage: lipFrame,
    landmarks: face.landmarks,
    transcript: fullTranscript,
    recentWords,
    words: transcript.words,
    onCaptureComplete: finishLiveCapture,
  });

  const coloredWords: TranscriptWord[] = useMemo(() => {
    const sourceWords = isLive
      ? (recorder.session?.words ?? transcript.words)
      : transcript.words;
    const insight = isLive ? analysis?.overall : brain.insight;
    if (!insight?.words.length) return sourceWords;
    const byText = new Map(
      insight.words.map((w) => [w.text.toLowerCase(), w.tone] as const),
    );
    return sourceWords.map((word) => ({
      ...word,
      tone: byText.get(word.text.toLowerCase()) ?? insight.tone ?? word.tone,
    }));
  }, [
    isLive,
    recorder.session?.words,
    transcript.words,
    analysis?.overall,
    brain.insight,
  ]);

  const title = isLive ? "Live Guide" : "Personal Trainer";

  const videoCallback = useCallback(
    (node: HTMLVideoElement | null) => {
      camera.attachVideo(node);
      setVideoEl(node);
    },
    [camera.attachVideo],
  );

  const onSelectTarget = useCallback((id: VisemeId | null) => {
    setCoachTarget(id);
  }, []);

  const setTrainer = useCallback(
    (next: TrainerMode) => {
      setTrainerMode(next);
      setActive(false);
      setLearnCam(false);
      setCoachTarget(null);
      setLessonPhase("pick");
      transcript.clear();
    },
    [transcript.clear],
  );

  // Re-arm when navigated in with a new assigned word while already mounted.
  useEffect(() => {
    if (!isLive && initialWord) setPendingWord(initialWord);
  }, [isLive, initialWord]);

  // Consume a preloaded word or sentence: look it up in either bank, switch
  // to the matching Learn tab, then auto-start it once the lesson session
  // has reset to the pick phase. Falls back to "word" for unknown text.
  useEffect(() => {
    if (isLive || !pendingWord) return;
    const mem = findBankLesson(pendingWord);
    const targetMode: TrainerMode = mem?.kind ?? "word";
    if (trainerMode !== targetMode) {
      setTrainer(targetMode);
      return;
    }
    if (lesson.phase !== "pick") return;
    if (mem) lesson.startLesson(mem);
    setPendingWord(null);
  }, [isLive, pendingWord, trainerMode, lesson.phase, lesson.startLesson, setTrainer]);

  const toggleActive = useCallback(() => {
    if (active && isLive) {
      recorder.stop();
      return;
    }
    if (!active && isLive) {
      setAnalysis(null);
      setAnalyzeError(null);
      setAnalyzeProgress(null);
      setBuiltLessons(null);
      setBuiltLessonsTip(null);
      setRecordingStartedAt(Date.now());
      setSavedRecordingId(null);
      setRecordingSaveError(null);
      transcript.clear();
    }
    if (!active && !isLive && trainerMode === "free") {
      transcript.clear();
    }
    setActive((value) => !value);
  }, [active, isLive, recorder, trainerMode, transcript.clear]);

  const onSaveRecording = useCallback(async () => {
    if (!recorder.session || savingRecording) return;
    setSavingRecording(true);
    setRecordingSaveError(null);
    try {
      await saveRecording(recorder.session);
      setSavedRecordingId(recorder.session.id);
    } catch (err) {
      setRecordingSaveError(
        err instanceof Error ? err.message : "Could not save this take locally",
      );
    } finally {
      setSavingRecording(false);
    }
  }, [recorder.session, savingRecording]);

  const onAnalyze = useCallback(async () => {
    if (!recorder.session || analyzing || buildingLessons) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeProgress({ done: 0, total: 0 });
    try {
      try {
        await fetch("/api/wake", { method: "POST" });
      } catch {
        /* heuristic still works */
      }
      const result = await analyzeSession(recorder.session, (done, total) => {
        setAnalyzeProgress({ done, total });
      });
      setAnalysis(result);
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Could not analyze session",
      );
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress(null);
    }
  }, [recorder.session, analyzing, buildingLessons]);

  const onBuildLessons = useCallback(async () => {
    if (!recorder.session || buildingLessons || analyzing) return;
    setBuildingLessons(true);
    setAnalyzeError(null);
    try {
      const result = await buildSessionLessons(recorder.session);
      setBuiltLessons(result.lessons);
      setBuiltLessonsTip(result.tip);
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : "Could not build lessons",
      );
    } finally {
      setBuildingLessons(false);
    }
  }, [recorder.session, buildingLessons, analyzing]);

  const onDiscard = useCallback(() => {
    recorder.discard();
    setAnalysis(null);
    setAnalyzeError(null);
    setAnalyzeProgress(null);
    setBuiltLessons(null);
    setBuiltLessonsTip(null);
    setSavedRecordingId(null);
    setRecordingSaveError(null);
    setRecordingStartedAt(null);
    transcript.clear();
  }, [recorder, transcript]);

  const backToPick = useCallback(() => {
    lesson.backToPick();
  }, [lesson]);

  const retry = useCallback(() => {
    setLearnCam(true);
    setActive(true);
    lesson.retry();
  }, [lesson]);

  const brainPill = (() => {
    if (isLive) {
      if (active && recorder.stopping) return "Recording · finishing…";
      if (active) return `Recording · ${formatDuration(recorder.elapsedMs)}`;
      if (buildingLessons) return "Brain · building lessons…";
      if (builtLessons?.length) {
        return `Brain · ${builtLessons.length} word lesson${builtLessons.length === 1 ? "" : "s"}`;
      }
      if (analyzing) return "Brain · reviewing…";
      if (analysis) {
        return analysis.overall.source === "ollama"
          ? "Brain · session ready"
          : "Brain · session (local)";
      }
      if (recorder.session) return "Brain · ready to build";
      return "Brain · record first";
    }
    if (isLearn) {
      if (lesson.busy) return "Brain · building lesson…";
      if (lesson.phase === "guide") {
        if (!trackingReady) return "Lesson · find face";
        if (brain.waking) return "Lesson · waking vision…";
        if (brain.thinking) return "Lesson · checking visual…";
        if (lessonVisionInsight?.usedVision) return "Lesson · Gemma vision";
        return "Lesson · guiding live";
      }
      if (lesson.phase === "result") return "Lesson · feedback";
      return "Lesson · pick";
    }
    if (!active) return "Brain · idle";
    if (brain.waking) return "Brain · waking…";
    if (brain.thinking) return "Brain · seeing…";
    if (brain.ollama && brain.modelReady) return "Brain · Gemma vision";
    if (brain.serverOk) return "Brain · live";
    return "Brain · on-device";
  })();

  const playbackUrl =
    isLive && !active ? recorder.session?.mediaUrl ?? null : null;

  const coachForced =
    isLearn && lesson.phase === "guide" && lesson.currentStep
      ? lesson.currentStep.viseme
      : isLearn
        ? null
        : coachTarget;

  const teacherLandmarks = useMemo(() => {
    if (!isLearn || lesson.phase !== "guide") return null;
    return unpackLandmarks(lesson.currentStep?.teacherLandmarks ?? null);
  }, [isLearn, lesson.phase, lesson.currentStep, lesson.stepIndex]);

  const cameraTargetLandmarks = useMemo(() => {
    if (!isLearn || lesson.phase !== "guide" || !lesson.currentStep) {
      return null;
    }
    // Prefer a captured teacher mouth for this step; otherwise the distinct
    // MediaPipe pose for THIS viseme (ah vs ee vs m must look different).
    if (teacherLandmarks?.length) return teacherLandmarks;
    return mediapipePoseForViseme(lesson.currentStep.viseme);
  }, [
    isLearn,
    lesson.phase,
    lesson.stepIndex,
    lesson.currentStep,
    teacherLandmarks,
  ]);

  return (
    <div className="guide-shell">
      <header className="guide-topbar">
        <div className="guide-topbar-left">
          <Link className="back" to="/guide">
            ← Back
          </Link>
          <h1 className="guide-title">{title}</h1>
          {!isLive && (
            <div
              className="trainer-modes"
              role="tablist"
              aria-label="Trainer mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={trainerMode === "free"}
                className={`trainer-mode-chip ${trainerMode === "free" ? "is-active" : ""}`}
                onClick={() => setTrainer("free")}
              >
                Free practice
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={trainerMode === "word"}
                className={`trainer-mode-chip ${trainerMode === "word" ? "is-active" : ""}`}
                onClick={() => setTrainer("word")}
              >
                Learn a word
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={trainerMode === "sentence"}
                className={`trainer-mode-chip ${trainerMode === "sentence" ? "is-active" : ""}`}
                onClick={() => setTrainer("sentence")}
              >
                Learn a sentence
              </button>
            </div>
          )}
        </div>
        <div className="guide-topbar-actions">
          {isLive && (
            <Link className="btn btn-ghost btn-compact" to="/guide/recordings">
              Library
            </Link>
          )}
          <span className="guide-pill brain-pill">{brainPill}</span>
          {isLive && recorder.session && !active && !builtLessons?.length && (
            <button
              type="button"
              className="btn btn-accent"
              disabled={
                analyzing ||
                buildingLessons ||
                recorder.session.samples.length === 0
              }
              onClick={() => void onBuildLessons()}
            >
              {buildingLessons ? "Building…" : "Build lessons"}
            </button>
          )}
          {(isLive || trainerMode === "free") && (
            <button
              type="button"
              className={`session-transport ${
                active ? "is-armed is-stop" : "is-start"
              } ${isLive ? "is-live" : "is-free"}`}
              onClick={toggleActive}
              disabled={
                analyzing || buildingLessons || (isLive && recorder.stopping)
              }
              aria-pressed={active}
            >
              <span className="session-transport-mark" aria-hidden />
              <span className="session-transport-label">
                {isLive
                  ? active
                    ? recorder.stopping
                      ? "Finishing…"
                      : "Stop"
                    : recorder.session
                      ? "Record again"
                      : "Record"
                  : active
                    ? "Pause"
                    : "Start"}
              </span>
              {isLive && active && !recorder.stopping && (
                <span className="session-transport-time">
                  {formatDuration(recorder.elapsedMs)}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      <div
        className={`guide-grid ${isLearn ? "is-learn" : ""} ${
          isLearn && lesson.phase === "result" ? "is-result" : ""
        } ${isLearn && lesson.phase === "pick" ? "is-pick" : ""}`}
      >
        <div className="guide-left">
          <section className="guide-panel camera-panel">
            <header className="guide-panel-head">
              <h2>Camera</h2>
              <span className="guide-pill">
                {camera.error
                  ? "Need access"
                  : cameraActive
                    ? isLive
                      ? recorder.stopping
                        ? "Saving"
                        : "Recording"
                      : isLearn
                        ? "Live guide"
                        : "Live"
                    : playbackUrl
                      ? "Playback"
                      : "Off"}
              </span>
            </header>
            <div className="camera-frame">
              {playbackUrl ? (
                <video
                  className="camera-video"
                  src={playbackUrl}
                  controls
                  playsInline
                />
              ) : (
                <video
                  ref={videoCallback}
                  className="camera-video"
                  playsInline
                  muted
                />
              )}
              {!cameraActive && !playbackUrl && !camera.error && (
                <p className="guide-empty">
                  {isLive
                    ? "Press Record — Gemma builds word lessons after you stop"
                    : isLearn
                      ? "Starting camera…"
                      : "Press Start"}
                </p>
              )}
              {active && isLive && (
                <p className="guide-rec-badge" aria-live="polite">
                  {recorder.stopping
                    ? "● Finalizing take…"
                    : `● REC ${formatDuration(recorder.elapsedMs)} · ${recorder.sampleCount} samples`}
                </p>
              )}
              {camera.error && (
                <p className="guide-empty guide-error">{camera.error}</p>
              )}
            </div>
          </section>

          <LipCropPanel
            video={cameraActive && !playbackUrl ? videoEl : null}
            lipBox={cameraActive ? face.lipBox : null}
            landmarks={cameraActive ? face.landmarks : null}
            targetLandmarks={cameraActive ? cameraTargetLandmarks : null}
            status={face.status}
            error={face.error}
            match={
              isLearn && lesson.phase === "guide"
                ? (lesson.liveScore?.match ?? null)
                : null
            }
            poseLabel={
              isLearn && lesson.phase === "guide" && lesson.currentStep
                ? `Target ${lesson.currentStep.label}`
                : null
            }
          />
        </div>

        {isLearn ? (
          lesson.phase === "pick" || !lesson.lesson ? (
            <LessonPicker
              kind={trainerMode === "sentence" ? "sentence" : "word"}
              busy={lesson.busy}
              error={lesson.error}
              onPick={lesson.startLesson}
              onCustom={(text) => void lesson.buildCustom(text)}
            />
          ) : (
            <LessonPlayer
              lesson={lesson.lesson}
              phase={lesson.phase}
              stepIndex={lesson.stepIndex}
              liveCue={lesson.liveScore?.cue}
              liveMatch={lesson.liveScore?.match}
              visionCue={lessonVisionInsight?.lipCue}
              shapeMatch={lesson.liveScore?.shapeMatch}
              voiceOk={lesson.liveScore?.voiceOk}
              needsVoice={lesson.liveScore?.needsVoice}
              goodMs={lesson.goodMs}
              goodHoldMs={lesson.goodHoldMs}
              trackingReady={trackingReady}
              volume={lesson.volume}
              voiceActive={lesson.voiceActive}
              result={lesson.result}
              feedback={lesson.feedback}
              feedbackBusy={lesson.feedbackBusy}
              sentenceProgress={lesson.sentenceProgress}
              nextWordLoading={lesson.nextWordLoading}
              onBackToPick={backToPick}
              onRetry={retry}
              onSkip={lesson.advance}
              onContinueSentence={lesson.continueSentence}
            />
          )
        ) : (
          <TranscriptPanel
            words={coloredWords}
            interim={cameraActive ? transcript.interim : ""}
            fontScale={fontScale}
            onFontScale={setFontScale}
            onClear={transcript.clear}
            listening={transcript.listening}
            error={transcript.error}
          />
        )}

        <div className="guide-right">
          {isLive ? (
            <SessionReviewPanel
              session={active ? null : recorder.session}
              analysis={active ? null : analysis}
              analyzing={analyzing}
              saving={savingRecording}
              saved={recorder.session?.id === savedRecordingId}
              saveError={recordingSaveError}
              buildingLessons={buildingLessons}
              builtLessons={active ? null : builtLessons}
              builtLessonsTip={active ? null : builtLessonsTip}
              recording={active}
              elapsedMs={recorder.elapsedMs}
              sampleCount={recorder.sampleCount}
              progress={analyzeProgress}
              error={analyzeError}
              onAnalyze={() => void onAnalyze()}
              onBuildLessons={() => void onBuildLessons()}
              onSave={() => void onSaveRecording()}
              onDiscard={onDiscard}
            />
          ) : (
            <LipCoachPanel
              mode={mode}
              lips={lips}
              expression={expression}
              landmarks={face.landmarks}
              tracking={cameraActive && Boolean(face.landmarks)}
              brainCue={
                isLearn
                  ? lesson.phase === "guide"
                    ? (lesson.liveScore?.cue ??
                      lesson.currentStep?.cue ??
                      null)
                    : null
                  : (brain.insight?.lipCue ?? null)
              }
              lipMatch={
                isLearn
                  ? lesson.phase === "guide"
                    ? (lesson.liveScore?.match ?? null)
                    : null
                  : (brain.insight?.lipMatch ?? null)
              }
              onSelectTarget={isLearn ? undefined : onSelectTarget}
              forcedViseme={
                isLearn && lesson.phase === "guide" ? coachForced : coachTarget
              }
              demo={Boolean(
                isLearn && lesson.phase === "guide" && teacherLandmarks,
              )}
              demoLandmarks={
                isLearn && lesson.phase === "guide" ? teacherLandmarks : null
              }
              hidePicks={isLearn}
              headerTitle={
                isLearn
                  ? lesson.phase === "guide" && teacherLandmarks
                    ? "Teacher mouth"
                    : "Your lips"
                  : "Lip coach"
              }
              statusPill={
                isLearn && lesson.phase === "guide" && lesson.currentStep
                  ? `Make “${lesson.currentStep.speakAs}” · ${lesson.currentStep.label}`
                  : isLearn && lesson.phase === "result"
                    ? "Live"
                    : undefined
              }
              speakAs={
                isLearn && lesson.phase === "guide" && lesson.currentStep
                  ? lesson.currentStep.speakAs
                  : undefined
              }
            />
          )}
          <InsightPanel
            insight={
              isLive
                ? active
                  ? null
                  : (analysis?.overall ?? null)
                : isLearn
                  ? lessonVisionInsight
                  : brain.insight
            }
            brainError={
              isLive
                ? analyzeError
                : isLearn
                  ? (lesson.error ?? brain.error)
                  : brain.error
            }
            ollama={brain.ollama}
            serverOk={brain.serverOk}
            waking={isLive ? false : brain.waking}
            thinking={
              isLive
                ? analyzing || buildingLessons
                : isLearn
                  ? lesson.busy || brain.thinking
                  : brain.thinking
            }
            lips={lips}
            expression={expression}
            volume={spectro.volume}
            pitchHint={spectro.pitchHint}
            canvasRef={setSpectroCanvas}
            spectroError={spectro.error}
            idleHint={
              isLive
                ? active
                  ? "Recording lip vectors now — Gemma builds lessons after you stop."
                  : "Record someone speaking, then Build word lessons — real mouth shapes go to Personal Trainer."
                : isLearn
                  ? lesson.phase === "guide"
                    ? "Local scoring stays instant. Gemma adds a visual cue when it is ready."
                    : lesson.phase === "result"
                      ? "Camera stays on — try again anytime."
                      : "Pick a word to start."
                  : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
