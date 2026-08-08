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
        <h2>Spectrogram</h2>
        <span className="guide-pill">
          vol {(volume * 100).toFixed(0)}% · pitch band{" "}
          {(pitchHint * 100).toFixed(0)}
        </span>
      </header>
      <div className="spectro-frame">
        <canvas ref={canvasRef} className="spectro-canvas" />
        {error && <p className="guide-empty">{error}</p>}
      </div>
    </section>
  );
}
