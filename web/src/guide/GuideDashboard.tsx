import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InsightPanel } from "./components/InsightPanel";
import { LipCoachPanel } from "./components/LipCoachPanel";
import { LipCropPanel } from "./components/LipCropPanel";
import { TranscriptPanel } from "./components/TranscriptPanel";
import {
  expressionFromBlendshapes,
  lipFeaturesFromLandmarks,
} from "./features";
import { useBrain } from "./hooks/useBrain";
import { useCamera } from "./hooks/useCamera";
import { useFaceLandmarker } from "./hooks/useFaceLandmarker";
import { useLiveTranscript } from "./hooks/useLiveTranscript";
import { useSpectrogram } from "./hooks/useSpectrogram";
import type { GuideMode, TranscriptWord } from "./types";
import { visemeFromText, type VisemeId } from "./visemes";
import "./GuideDashboard.css";

type GuideDashboardProps = {
  mode: GuideMode;
};

export function GuideDashboard({ mode }: GuideDashboardProps) {
  const [active, setActive] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [spectroCanvas, setSpectroCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [coachTarget, setCoachTarget] = useState<VisemeId | null>(null);

  const camera = useCamera(active);
  const face = useFaceLandmarker(videoEl, active && camera.ready);
  const spectro = useSpectrogram(camera.stream, spectroCanvas, active);
  const transcript = useLiveTranscript(
    active,
    spectro.volume,
    spectro.pitchHint,
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

  const suggestedViseme = useMemo(
    () => coachTarget ?? visemeFromText(latestText),
    [coachTarget, latestText],
  );

  const brain = useBrain({
    enabled: active,
    mode,
    transcript: transcript.words.map((w) => w.text).join(" "),
    recentWords: transcript.words.map((w) => w.text),
    lips,
    volume: spectro.volume,
    pitchHint: spectro.pitchHint,
    expression,
    coachTarget: suggestedViseme,
  });

  const coloredWords: TranscriptWord[] = useMemo(() => {
    if (!brain.insight?.words.length) return transcript.words;
    const byText = new Map(
      brain.insight.words.map((w) => [w.text.toLowerCase(), w.tone] as const),
    );
    return transcript.words.map((word) => ({
      ...word,
      tone: byText.get(word.text.toLowerCase()) ?? brain.insight?.tone ?? word.tone,
    }));
  }, [transcript.words, brain.insight]);

  const title = mode === "trainer" ? "Personal Trainer" : "Live Guide";
  const hint =
    mode === "trainer"
      ? "Match the coach mouth — local brain reads lips, tone, and mood."
      : "Local brain reads their tone, mood, and intention from face + voice.";

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

  return (
    <div className="guide-shell">
      <header className="guide-topbar">
        <div className="guide-topbar-left">
          <Link className="back" to="/guide">
            ← Speech Guide
          </Link>
          <div>
            <p className="eyebrow">{title}</p>
            <h1 className="guide-title">{hint}</h1>
          </div>
        </div>
        <div className="guide-topbar-actions">
          <span className="guide-pill guide-pill-soft">
            {brain.status === "ready"
              ? brain.ollama
                ? "Brain online · Ollama"
                : "Brain online · heuristic (install Gemma/Qwen for richer reads)"
              : brain.error ?? "Brain offline"}
          </span>
          <button
            type="button"
            className={active ? "btn btn-primary" : "btn btn-accent"}
            onClick={() => setActive((value) => !value)}
          >
            {active ? "Pause session" : "Start session"}
          </button>
        </div>
      </header>

      <div className="guide-grid">
        <div className="guide-left">
          <section className="guide-panel camera-panel">
            <header className="guide-panel-head">
              <h2>Camera</h2>
              <span className="guide-pill">
                {camera.error
                  ? "Permission needed"
                  : active
                    ? "Live"
                    : "Ready"}
              </span>
            </header>
            <div className="camera-frame">
              <video
                ref={videoCallback}
                className="camera-video"
                playsInline
                muted
              />
              {!active && (
                <p className="guide-empty">
                  Hit Start session to open camera + mic.
                </p>
              )}
              {camera.error && (
                <p className="guide-empty guide-error">{camera.error}</p>
              )}
            </div>
          </section>

          <LipCropPanel
            video={videoEl}
            lipBox={face.lipBox}
            landmarks={face.landmarks}
            status={face.status}
            error={face.error}
          />
        </div>

        <TranscriptPanel
          words={coloredWords}
          interim={transcript.interim}
          fontScale={fontScale}
          onFontScale={setFontScale}
          onClear={transcript.clear}
          listening={transcript.listening}
          error={transcript.error}
        />

        <div className="guide-right">
          <LipCoachPanel
            suggestedId={suggestedViseme}
            mode={mode}
            brainCue={brain.insight?.lipCue ?? null}
            lipMatch={brain.insight?.lipMatch ?? null}
            onSelectTarget={onSelectTarget}
          />
          <InsightPanel
            insight={brain.insight}
            brainError={brain.error}
            ollama={brain.ollama}
            volume={spectro.volume}
            pitchHint={spectro.pitchHint}
            canvasRef={setSpectroCanvas}
            spectroError={spectro.error}
          />
        </div>
      </div>
    </div>
  );
}
