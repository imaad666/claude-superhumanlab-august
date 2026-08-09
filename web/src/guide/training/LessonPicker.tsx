import { useState } from "react";
import { getAssignedSet } from "../../slp/store";
import { bankFor, findBankLesson } from "./bank";
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

  const assignedWords = kind === "word" ? getAssignedSet()?.words ?? [] : [];
  const assignedBy = getAssignedSet()?.assignedBy;
  const assignedLessons = assignedWords
    .map((w) => findBankLesson(w, "word"))
    .filter((l): l is LessonMemory => Boolean(l));

  return (
    <section className="guide-panel lesson-picker">
      <header className="guide-panel-head">
        <h2>{kind === "word" ? "Learn a word" : "Learn a sentence"}</h2>
        <span className="guide-pill">Pick or type</span>
      </header>

      <div className="lesson-picker-body">
        {assignedLessons.length > 0 && (
          <div className="lesson-assigned">
            <p className="lesson-assigned-label">
              {assignedBy === "SLP" ? "From your SLP" : "Practice next"}
            </p>
            <div className="lesson-bank" role="list" aria-label="Assigned words">
              {assignedLessons.map((item) => (
                <button
                  key={`assigned-${item.text}`}
                  type="button"
                  role="listitem"
                  className="lesson-bank-chip is-assigned"
                  disabled={busy}
                  onClick={() => onPick(item)}
                >
                  {item.text}
                </button>
              ))}
            </div>
          </div>
        )}

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
