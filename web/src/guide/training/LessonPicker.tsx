import { useState } from "react";
import { bankFor } from "./bank";
import type { LessonKind, LessonMemory } from "./types";

type LessonPickerProps = {
  kind: LessonKind;
  busy: boolean;
  error: string | null;
  onPick: (lesson: LessonMemory) => void;
  onCustom: (text: string) => void;
};

export function LessonPicker({
  kind,
  busy,
  error,
  onPick,
  onCustom,
}: LessonPickerProps) {
  const [custom, setCustom] = useState("");
  const bank = bankFor(kind);

  return (
    <section className="guide-panel lesson-picker">
      <header className="guide-panel-head">
        <h2>{kind === "word" ? "Learn a word" : "Learn a sentence"}</h2>
        <span className="guide-pill">Pick or type</span>
      </header>

      <div className="lesson-picker-body">
        <p className="insight-summary muted">
          Watch the mouth shapes, then recreate them. Starter bank works
          offline; custom text builds a lesson with the local model.
        </p>

        <div className="lesson-bank" role="list" aria-label="Starter bank">
          {bank.map((item) => (
            <button
              key={item.text}
              type="button"
              role="listitem"
              className="lesson-bank-chip"
              disabled={busy}
              onClick={() => onPick(item)}
            >
              {item.text}
            </button>
          ))}
        </div>

        <form
          className="lesson-custom"
          onSubmit={(e) => {
            e.preventDefault();
            onCustom(custom);
          }}
        >
          <input
            className="lesson-input"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={
              kind === "word" ? "Or type a word…" : "Or type a short sentence…"
            }
            disabled={busy}
            maxLength={kind === "word" ? 24 : 48}
            aria-label={kind === "word" ? "Custom word" : "Custom sentence"}
          />
          <button
            type="submit"
            className="btn btn-accent btn-compact"
            disabled={busy || !custom.trim()}
          >
            {busy ? "Building…" : "Build lesson"}
          </button>
        </form>

        {error && <p className="guide-error lesson-error">{error}</p>}
      </div>
    </section>
  );
}
