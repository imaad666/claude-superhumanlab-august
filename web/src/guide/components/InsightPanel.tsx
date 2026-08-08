import type { BrainInsight } from "../hooks/useBrain";

type InsightPanelProps = {
  insight: BrainInsight | null;
  brainError: string | null;
  ollama: boolean;
  volume: number;
  pitchHint: number;
  canvasRef: (node: HTMLCanvasElement | null) => void;
  spectroError: string | null;
};

export function InsightPanel({
  insight,
  brainError,
  ollama,
  volume,
  pitchHint,
  canvasRef,
  spectroError,
}: InsightPanelProps) {
  return (
    <section className="guide-panel insight-panel">
      <header className="guide-panel-head">
        <div>
          <h2>Voice & meaning</h2>
          <p className="guide-sub">
            Spectrogram + brain ·{" "}
            {insight
              ? insight.source === "ollama"
                ? `Ollama ${insight.model ?? ""}`
                : "local heuristic"
              : ollama
                ? "Ollama ready"
                : "waiting"}
          </p>
        </div>
        <span className="guide-pill">
          vol {(volume * 100).toFixed(0)}% · pitch{" "}
          {(pitchHint * 100).toFixed(0)}
        </span>
      </header>

      <div className="insight-readout">
        {insight ? (
          <>
            <div className="insight-chips">
              <span className={`insight-chip tone-${insight.tone}`}>
                Tone · {insight.tone}
              </span>
              <span className="insight-chip">{insight.mood}</span>
              <span className="insight-chip insight-chip-hot">
                {insight.intention}
              </span>
              <span className={`insight-chip match-${insight.lipMatch}`}>
                Lips · {insight.lipMatch.replace("_", " ")}
              </span>
            </div>
            <p className="insight-summary">{insight.summary}</p>
            <p className="insight-cue">{insight.lipCue}</p>
          </>
        ) : (
          <p className="insight-summary muted">
            {brainError ??
              "Start a session — tone, mood, and intention will land here."}
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
