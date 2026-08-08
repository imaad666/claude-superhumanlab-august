import type { BrainInsight } from "../hooks/useBrain";
import { TONE_LABELS } from "../types";

type InsightPanelProps = {
  insight: BrainInsight | null;
  brainError: string | null;
  ollama: boolean;
  serverOk: boolean;
  waking?: boolean;
  volume: number;
  pitchHint: number;
  canvasRef: (node: HTMLCanvasElement | null) => void;
  spectroError: string | null;
};

export function InsightPanel({
  insight,
  brainError,
  ollama,
  serverOk,
  waking = false,
  canvasRef,
  spectroError,
}: InsightPanelProps) {
  const sourceLabel = !insight
    ? "Idle"
    : waking
      ? "Waking model…"
      : ollama && insight.source === "ollama"
        ? insight.model ?? "Qwen"
        : serverOk
          ? "Local brain"
          : "On-device";

  return (
    <section className="guide-panel insight-panel">
      <header className="guide-panel-head">
        <h2>Brain</h2>
        <span className="guide-pill">{sourceLabel}</span>
      </header>

      {insight ? (
        <div className="insight-body">
          <div className="insight-chips" aria-label="Tone mood intention">
            <span className={`insight-chip tone-${insight.tone}`}>
              {TONE_LABELS[insight.tone] ?? insight.tone}
            </span>
            <span className="insight-chip">{insight.mood}</span>
            <span className="insight-chip insight-chip-hot">
              {insight.intention}
            </span>
            <span className={`insight-chip match-${insight.lipMatch}`}>
              lips · {insight.lipMatch.replace("_", " ")}
            </span>
          </div>

          <p className="insight-summary">{insight.summary}</p>
          {insight.lipCue && (
            <p className="insight-cue">{insight.lipCue}</p>
          )}
        </div>
      ) : (
        <div className="insight-body">
          <p className="insight-summary muted">
            {brainError ?? "Press Start — brain fuses lips, voice, and words."}
          </p>
        </div>
      )}

      <div className="spectro-frame insight-spectro">
        <canvas ref={canvasRef} className="spectro-canvas" />
        {spectroError && <p className="guide-empty">{spectroError}</p>}
      </div>
    </section>
  );
}
