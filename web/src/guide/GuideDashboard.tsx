import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LipCoachPanel } from "./components/LipCoachPanel";
import { LipCropPanel } from "./components/LipCropPanel";
import { SpectrogramPanel } from "./components/SpectrogramPanel";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { useCamera } from "./hooks/useCamera";
import { useFaceLandmarker } from "./hooks/useFaceLandmarker";
import { useLiveTranscript } from "./hooks/useLiveTranscript";
import { useSpectrogram } from "./hooks/useSpectrogram";
import type { GuideMode } from "./types";
import { visemeFromText } from "./visemes";
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

  const camera = useCamera(active);
  const face = useFaceLandmarker(videoEl, active && camera.ready);
  const spectro = useSpectrogram(camera.stream, spectroCanvas, active);
  const transcript = useLiveTranscript(
    active,
    spectro.volume,
    spectro.pitchHint,
  );

  const title = mode === "trainer" ? "Personal Trainer" : "Live Guide";
  const hint =
    mode === "trainer"
      ? "Match the coach mouth with yours — lips, tone, and words together."
      : "Watch their lips and tone — the coach shows the shape that fits.";

  const videoCallback = useCallback(
    (node: HTMLVideoElement | null) => {
      camera.attachVideo(node);
      setVideoEl(node);
    },
    [camera.attachVideo],
  );

  const suggestedViseme = useMemo(() => {
    const latest = transcript.words.at(-1)?.text ?? transcript.interim;
    return visemeFromText(latest);
  }, [transcript.words, transcript.interim]);

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
            Your lips vs coach · MediaPipe local · 3D mouth later
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
          words={transcript.words}
          interim={transcript.interim}
          fontScale={fontScale}
          onFontScale={setFontScale}
          onClear={transcript.clear}
          listening={transcript.listening}
          error={transcript.error}
        />

        <div className="guide-right">
          <LipCoachPanel suggestedId={suggestedViseme} mode={mode} />
          <SpectrogramPanel
            canvasRef={setSpectroCanvas}
            volume={spectro.volume}
            pitchHint={spectro.pitchHint}
            error={spectro.error}
          />
        </div>
      </div>
    </div>
  );
}
