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
import { mediapipePoseForViseme } from "./training/visemePoses";
import { unpackLandmarks } from "./landmarksPack";
import type { SessionAnalysis } from "./sessionTypes";
import { findBankLesson } from "./training/bank";
import { buildSessionLessons } from "./training/buildSessionLessons";
import { LessonPicker } from "./training/LessonPicker";
import { LessonPlayer } from "./training/LessonPlayer";
import type { LessonMemory, TrainerMode } from "./training/types";
import { useLessonSession } from "./training/useLessonSession";
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

  const cameraActive =
    (!isLive && trainerMode === "free" && active) ||
    (isLive && active) ||
    (isLearn && learnCam);

  const camera = useCamera(cameraActive);
  const face = useFaceLandmarker(videoEl, cameraActive && camera.ready);
  const spectro = useSpectrogram(camera.stream, spectroCanvas, cameraActive);
  const transcript = useLiveTranscript(
    cameraActive && (!isLearn || learnCam),
    spectro.volume,
    spectro.pitchHint,
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
  const spokenHint = `${fullTranscript} ${transcript.interim}`.trim();

  const lesson = useLessonSession(
    isLive ? "free" : trainerMode,
    lips,
    spectro.volume,
    trackingReady,
    spokenHint,
  );

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

  const brain = useBrain({
    enabled: !isLive && trainerMode === "free" && active,
    mode,
    transcript: fullTranscript,
    recentWords,
    lips,
    volume: spectro.volume,
    pitchHint: spectro.pitchHint,
    expression,
    coachTarget: suggestedViseme,
    lipImage: lipFrame,
  });

  const recorder = useSessionRecorder({
    active: active && isLive,
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

  const setTrainer = useCallback((next: TrainerMode) => {
    setTrainerMode(next);
    setActive(false);
    setLearnCam(false);
    setCoachTarget(null);
  }, []);

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
    if (!active && isLive) {
      setAnalysis(null);
      setAnalyzeError(null);
      setAnalyzeProgress(null);
      setBuiltLessons(null);
      transcript.clear();
    }
    setActive((value) => !value);
  }, [active, isLive, transcript]);

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
        return trackingReady ? "Lesson · guiding live" : "Lesson · find face";
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
  }, [isLearn, lesson.phase, lesson.currentStep]);

  const ghostLandmarks = useMemo(() => {
    if (!isLearn || lesson.phase !== "guide" || !lesson.currentStep) return null;
    if (teacherLandmarks?.length) return teacherLandmarks;
    return mediapipePoseForViseme(lesson.currentStep.viseme);
  }, [isLearn, lesson.phase, lesson.currentStep, teacherLandmarks]);

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
              className={active ? "btn btn-primary" : "btn btn-accent"}
              onClick={toggleActive}
              disabled={analyzing || buildingLessons}
            >
              {isLive
                ? active
                  ? "Stop"
                  : recorder.session
                    ? "Record again"
                    : "Record"
                : active
                  ? "Pause"
                  : "Start"}
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
                      ? "Recording"
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
                  ● REC {formatDuration(recorder.elapsedMs)} ·{" "}
                  {recorder.sampleCount} samples
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
            ghostLandmarks={
              isLearn && lesson.phase === "guide" ? ghostLandmarks : null
            }
            status={face.status}
            error={face.error}
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
              shapeMatch={lesson.liveScore?.shapeMatch}
              voiceOk={lesson.liveScore?.voiceOk}
              needsVoice={lesson.liveScore?.needsVoice}
              goodMs={lesson.goodMs}
              goodHoldMs={lesson.goodHoldMs}
              trackingReady={trackingReady}
              volume={lesson.volume}
              voiceActive={lesson.voiceActive}
              result={lesson.result}
              onBackToPick={backToPick}
              onRetry={retry}
              onSkip={lesson.advance}
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
              buildingLessons={buildingLessons}
              builtLessons={active ? null : builtLessons}
              recording={active}
              elapsedMs={recorder.elapsedMs}
              sampleCount={recorder.sampleCount}
              progress={analyzeProgress}
              error={analyzeError}
              onAnalyze={() => void onAnalyze()}
              onBuildLessons={() => void onBuildLessons()}
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
                  ? null
                  : brain.insight
            }
            brainError={
              isLive ? analyzeError : isLearn ? lesson.error : brain.error
            }
            ollama={brain.ollama}
            serverOk={brain.serverOk}
            waking={isLive || isLearn ? false : brain.waking}
            thinking={
              isLive
                ? analyzing || buildingLessons
                : isLearn
                  ? lesson.busy
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
                    ? "Blue ghost = target. Match it and speak the sound."
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
