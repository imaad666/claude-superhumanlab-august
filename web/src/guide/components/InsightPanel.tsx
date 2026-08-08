import type { ExpressionFeatures, LipFeatures } from "../features";
import type { BrainInsight } from "../hooks/useBrain";
import { TONE_LABELS } from "../types";

type InsightPanelProps = {
  insight: BrainInsight | null;
  brainError: string | null;
  ollama: boolean;
  serverOk: boolean;
  waking?: boolean;
  thinking?: boolean;
  lips: LipFeatures;
  expression: ExpressionFeatures;
  volume: number;
  pitchHint: number;
  canvasRef: (node: HTMLCanvasElement | null) => void;
  spectroError: string | null;
  idleHint?: string;
};

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="metric-meter" title={`${label} ${pct}%`}>
      <span className="metric-meter-label">{label}</span>
      <div className="metric-meter-track">
        <div className="metric-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="metric-meter-val">{pct}</span>
    </div>
  );
}

export function InsightPanel({
  insight,
  brainError,
  ollama,
  serverOk,
  waking = false,
  thinking = false,
  lips,
  expression,
  volume,
  pitchHint,
  canvasRef,
  spectroError,
  idleHint,
}: InsightPanelProps) {
  const sourceLabel = waking
    ? "Waking vision…"
    : thinking
      ? "Seeing…"
      : !insight
        ? "Idle"
        : ollama && insight.source === "ollama"
          ? insight.usedVision
            ? `${insight.model ?? "Gemma"} · vision`
            : (insight.model ?? "Gemma")
          : serverOk
            ? "Live metrics"
            : "On-device";

  return (
    <section className="guide-panel insight-panel">
      <header className="guide-panel-head">
        <h2>Brain</h2>
        <span className="guide-pill">{sourceLabel}</span>
      </header>

      <div className="insight-body">
        <div className="metric-grid" aria-label="Live signals">
          <Meter label="open" value={lips.openness} />
          <Meter label="wide" value={lips.width} />
          <Meter label="round" value={lips.roundness} />
          <Meter label="vol" value={volume} />
          <Meter label="pitch" value={pitchHint} />
          <Meter label="smile" value={expression.smile} />
          <Meter label="jaw" value={expression.jawOpen} />
          <Meter label="funnel" value={expression.mouthFunnel} />
        </div>

        {insight ? (
          <>
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
              {insight.usedVision && (
                <span className="insight-chip insight-chip-vision">vision</span>
              )}
            </div>
            <p className="insight-summary">{insight.summary}</p>
            {insight.lipCue && <p className="insight-cue">{insight.lipCue}</p>}
          </>
        ) : (
          <p className="insight-summary muted">
            {brainError ??
              idleHint ??
              "Press Start — live metrics + vision coach on the lip crop."}
          </p>
        )}
      </div>

      <div className="spectro-frame insight-spectro">
        <canvas ref={canvasRef} className="spectro-canvas" />
        {spectroError && <p className="guide-empty">{spectroError}</p>}
      </div>
    </section>
  );
}
