type SpectrogramPanelProps = {
  canvasRef: (node: HTMLCanvasElement | null) => void;
  volume: number;
  pitchHint: number;
  error: string | null;
};

export function SpectrogramPanel({
  canvasRef,
  volume,
  pitchHint,
  error,
}: SpectrogramPanelProps) {
  return (
    <section className="guide-panel spectro-panel">
      <header className="guide-panel-head">
        <h2>Voice wave</h2>
        <span className="guide-pill">
          vol {(volume * 100).toFixed(0)}% · pitch{" "}
          {(pitchHint * 100).toFixed(0)}
        </span>
      </header>
      <div className="spectro-frame">
        <canvas ref={canvasRef} className="spectro-canvas" />
        <div className="wave-legend" aria-hidden>
          <span className="wave-legend-loud">loud</span>
          <span className="wave-legend-happy">happy</span>
          <span className="wave-legend-shallow">shallow</span>
        </div>
        {error && <p className="guide-empty">{error}</p>}
      </div>
    </section>
  );
}
