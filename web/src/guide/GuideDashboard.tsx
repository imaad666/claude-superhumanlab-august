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
import type { SessionAnalysis } from "./sessionTypes";
import { LessonPicker } from "./training/LessonPicker";
import { LessonPlayer } from "./training/LessonPlayer";
import type { TrainerMode } from "./training/types";
import { useLessonSession } from "./training/useLessonSession";
import type { GuideMode, TranscriptWord } from "./types";
import { type VisemeId } from "./visemes";
import "./GuideDashboard.css";

type GuideDashboardProps = {
  mode: GuideMode;
};

export function GuideDashboard({ mode }: GuideDashboardProps) {
  const isLive = mode === "live";
  const [trainerMode, setTrainerMode] = useState<TrainerMode>("free");
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

  const lesson = useLessonSession(
    isLive ? "free" : trainerMode,
    lips,
    spectro.volume,
  );

  useEffect(() => {
    if (!isLearn) {
      setLearnCam(false);
      return;
    }
    if (lesson.phase === "recreate") {
      setLearnCam(true);
      setActive(true);
    } else {
      setLearnCam(false);
      setActive(false);
    }
  }, [isLearn, lesson.phase]);

  const suggestedViseme = useMemo(
    () => coachTarget ?? lips.visemeGuess,
    [coachTarget, lips.visemeGuess],
  );

  const fullTranscript = transcript.words.map((w) => w.text).join(" ");
  const recentWords = transcript.words.map((w) => w.text);

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

  const toggleActive = useCallback(() => {
    if (!active && isLive) {
      setAnalysis(null);
      setAnalyzeError(null);
      setAnalyzeProgress(null);
      transcript.clear();
    }
    setActive((value) => !value);
  }, [active, isLive, transcript]);

  const onAnalyze = useCallback(async () => {
    if (!recorder.session || analyzing) return;
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
  }, [recorder.session, analyzing]);

  const onDiscard = useCallback(() => {
    recorder.discard();
    setAnalysis(null);
    setAnalyzeError(null);
    setAnalyzeProgress(null);
    transcript.clear();
  }, [recorder, transcript]);

  const beginRecreate = useCallback(() => {
    setLearnCam(true);
    setActive(true);
    lesson.beginRecreate();
  }, [lesson]);

  const watchAgain = useCallback(() => {
    setLearnCam(false);
    setActive(false);
    lesson.watchAgain();
  }, [lesson]);

  const backToPick = useCallback(() => {
    setLearnCam(false);
    setActive(false);
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
      if (analyzing) return "Brain · reviewing…";
      if (analysis) {
        return analysis.overall.source === "ollama"
          ? "Brain · session ready"
          : "Brain · session (local)";
      }
      if (recorder.session) return "Brain · waiting to analyze";
      return "Brain · record first";
    }
    if (isLearn) {
      if (lesson.busy) return "Brain · building lesson…";
      if (lesson.phase === "watch") return "Lesson · watch";
      if (lesson.phase === "recreate") return "Lesson · your turn";
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
    isLearn && lesson.currentStep ? lesson.currentStep.viseme : coachTarget;

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
          {isLive && recorder.session && !active && !analysis && (
            <button
              type="button"
              className="btn btn-accent"
              disabled={analyzing || recorder.session.samples.length === 0}
              onClick={() => void onAnalyze()}
            >
              {analyzing ? "Analyzing…" : "Analyze"}
            </button>
          )}
          {(isLive || trainerMode === "free") && (
            <button
              type="button"
              className={active ? "btn btn-primary" : "btn btn-accent"}
              onClick={toggleActive}
              disabled={analyzing}
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

      <div className="guide-grid">
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
                        ? "Your turn"
                        : "Live"
                    : playbackUrl
                      ? "Playback"
                      : isLearn && lesson.phase === "watch"
                        ? "Watch mode"
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
                    ? "Press Record — model runs after you stop"
                    : isLearn
                      ? lesson.phase === "watch"
                        ? "Watch the lip coach — camera waits for Your turn"
                        : "Pick a word or sentence to begin"
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
            status={face.status}
            error={face.error}
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
              result={lesson.result}
              onWatchAgain={watchAgain}
              onReady={beginRecreate}
              onBackToPick={backToPick}
              onRetry={retry}
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
              recording={active}
              elapsedMs={recorder.elapsedMs}
              sampleCount={recorder.sampleCount}
              progress={analyzeProgress}
              error={analyzeError}
              onAnalyze={() => void onAnalyze()}
              onDiscard={onDiscard}
            />
          ) : (
            <LipCoachPanel
              mode={mode}
              lips={
                isLearn && lesson.phase === "watch" && lesson.currentStep
                  ? {
                      openness: lesson.currentStep.targets.openness,
                      width: lesson.currentStep.targets.width,
                      roundness: lesson.currentStep.targets.roundness,
                      visemeGuess: lesson.currentStep.viseme,
                    }
                  : lips
              }
              expression={expression}
              landmarks={face.landmarks}
              tracking={
                isLearn && lesson.phase === "watch"
                  ? Boolean(lesson.demoLandmarks)
                  : cameraActive && Boolean(face.landmarks)
              }
              brainCue={
                isLearn
                  ? (lesson.liveScore?.cue ??
                    lesson.currentStep?.cue ??
                    lesson.result?.summary ??
                    null)
                  : (brain.insight?.lipCue ?? null)
              }
              lipMatch={
                isLearn
                  ? (lesson.liveScore?.match ?? lesson.result?.overall ?? null)
                  : (brain.insight?.lipMatch ?? null)
              }
              onSelectTarget={isLearn ? undefined : onSelectTarget}
              forcedViseme={isLearn ? coachForced : null}
              demoLandmarks={
                isLearn && lesson.phase === "watch"
                  ? lesson.demoLandmarks
                  : null
              }
              demo={isLearn && lesson.phase === "watch"}
              hidePicks={isLearn}
              headerTitle={isLearn ? "Watch & copy" : "Lip coach"}
              statusPill={
                isLearn && lesson.currentStep
                  ? `${lesson.currentStep.label} · “${lesson.currentStep.speakAs}”`
                  : undefined
              }
              speakAs={
                isLearn && lesson.currentStep
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
                  ? lesson.result
                    ? {
                        tone: "warm",
                        mood: "encouraging",
                        intention: "practicing",
                        summary: lesson.result.summary,
                        lipMatch: lesson.result.overall,
                        lipCue:
                          lesson.result.scores.find((s) => s.match !== "good")
                            ?.cue ?? "Great effort — try again anytime.",
                        words: [],
                        source: "heuristic",
                        model: null,
                        usedVision: false,
                      }
                    : null
                  : brain.insight
            }
            brainError={
              isLive ? analyzeError : isLearn ? lesson.error : brain.error
            }
            ollama={brain.ollama}
            serverOk={brain.serverOk}
            waking={isLive || isLearn ? false : brain.waking}
            thinking={
              isLive ? analyzing : isLearn ? lesson.busy : brain.thinking
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
                  ? "Recording signals now — vision coaching waits until you stop."
                  : "Record someone speaking, then Analyze — vision runs after the clip."
                : isLearn
                  ? "Pick a word or sentence — watch the mouths, then recreate."
                  : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
