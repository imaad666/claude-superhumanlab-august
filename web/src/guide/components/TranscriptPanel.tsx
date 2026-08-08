import type { ToneKind, TranscriptWord } from "../types";
import { TONE_LABELS } from "../types";

type TranscriptPanelProps = {
  words: TranscriptWord[];
  interim: string;
  fontScale: number;
  onFontScale: (next: number) => void;
  onClear: () => void;
  listening: boolean;
  error: string | null;
};

const TONE_CLASS: Record<ToneKind, string> = {
  calm: "tone-calm",
  warm: "tone-warm",
  bright: "tone-bright",
  soft: "tone-soft",
};

export function TranscriptPanel({
  words,
  interim,
  fontScale,
  onFontScale,
  onClear,
  listening,
  error,
}: TranscriptPanelProps) {
  return (
    <section className="guide-panel transcript-panel">
      <header className="guide-panel-head">
        <div>
          <h2>Transcription</h2>
          <p className="guide-sub">
            Color = tonality · {listening ? "listening" : "paused"}
          </p>
        </div>
        <div className="transcript-controls">
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={() => onFontScale(Math.max(0.85, fontScale - 0.15))}
            aria-label="Decrease text size"
          >
            A−
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={() => onFontScale(Math.min(2.2, fontScale + 0.15))}
            aria-label="Increase text size"
          >
            A+
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
      </header>

      <div
        className="transcript-body"
        style={{ fontSize: `${1.35 * fontScale}rem` }}
      >
        {words.length === 0 && !interim && (
          <p className="guide-empty">Start speaking — words will land here.</p>
        )}
        <p className="transcript-line">
          {words.map((word) => (
            <span
              key={word.id}
              className={`transcript-word ${TONE_CLASS[word.tone]}`}
              title={TONE_LABELS[word.tone]}
            >
              {word.text}{" "}
            </span>
          ))}
          {interim && <span className="transcript-interim">{interim}</span>}
        </p>
      </div>

      <footer className="tone-legend">
        <span className="tone-calm">steady</span>
        <span className="tone-warm">warm</span>
        <span className="tone-bright">emphasis</span>
        <span className="tone-soft">gentle</span>
        {error && <span className="guide-error">{error}</span>}
      </footer>
    </section>
  );
}
