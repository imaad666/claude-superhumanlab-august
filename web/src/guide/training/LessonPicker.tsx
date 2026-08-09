import { useMemo, useState } from "react";
import { getAssignedSet } from "../../slp/store";
import { bankFor, findBankLesson } from "./bank";
import { capturedFor } from "./capturedLessons";
import type { LessonKind, LessonMemory } from "./types";

type LessonPickerProps = {
  kind: LessonKind;
  busy: boolean;
  error: string | null;
  onPick: (lesson: LessonMemory) => void;
  onCustom: (text: string) => void;
};

type WordGroup = {
  id: string;
  label: string;
  words: string[];
};

const WORD_GROUPS: WordGroup[] = [
  { id: "basics", label: "Basics", words: ["hello", "yes", "no", "mom", "dog"] },
  {
    id: "everyday",
    label: "Everyday",
    words: ["water", "food", "please", "thank", "love"],
  },
  { id: "feelings", label: "Feelings", words: ["happy", "friend"] },
];

function speakPreview(lesson: LessonMemory): string {
  return lesson.steps.map((s) => s.speakAs).join(" · ");
}

export function LessonPicker({
  kind,
  busy,
  error,
  onPick,
  onCustom,
}: LessonPickerProps) {
  const [custom, setCustom] = useState("");
  const bank = bankFor(kind);
  const captured = kind === "word" ? capturedFor("word") : [];

  const byText = useMemo(() => {
    const map = new Map<string, LessonMemory>();
    for (const item of bank) map.set(item.text.toLowerCase(), item);
    return map;
  }, [bank]);

  const groups = useMemo(() => {
    if (kind !== "word") {
      return [
        {
          id: "sentences",
          label: "Sentences",
          lessons: bank,
        },
      ];
    }

    const used = new Set<string>();
    const grouped = WORD_GROUPS.map((g) => {
      const lessons = g.words
        .map((w) => byText.get(w))
        .filter((l): l is LessonMemory => Boolean(l));
      for (const l of lessons) used.add(l.text.toLowerCase());
      return { id: g.id, label: g.label, lessons };
    }).filter((g) => g.lessons.length);

    const leftover = bank.filter((l) => !used.has(l.text.toLowerCase()));
    if (leftover.length) {
      grouped.push({ id: "more", label: "More", lessons: leftover });
    }
    return grouped;
  }, [kind, bank, byText]);

  const assignedWords = kind === "word" ? getAssignedSet()?.words ?? [] : [];
  const assignedBy = getAssignedSet()?.assignedBy;
  const assignedLessons = assignedWords
    .map((w) => findBankLesson(w, "word"))
    .filter((l): l is LessonMemory => Boolean(l));

  return (
    <section className="guide-panel lesson-picker">
      <header className="guide-panel-head">
        <div>
          <h2>{kind === "word" ? "Learn a word" : "Learn a sentence"}</h2>
          <p className="guide-sub">
            Pick one — then speak it while matching your lips
          </p>
        </div>
      </header>

      <div className="lesson-picker-body">
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
              kind === "word" ? "Type your own word…" : "Type a short sentence…"
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
            {busy ? "Building…" : "Build"}
          </button>
        </form>

        {assignedLessons.length > 0 && (
          <div className="lesson-group">
            <p className="lesson-section-label">
              {assignedBy === "SLP" ? "From your SLP" : "Practice next"}
            </p>
            <ul className="lesson-list" aria-label="Assigned words">
              {assignedLessons.map((item) => (
                <li key={`assigned-${item.text}`}>
                  <button
                    type="button"
                    className="lesson-list-item is-assigned"
                    disabled={busy}
                    onClick={() => onPick(item)}
                  >
                    <span className="lesson-list-word">{item.text}</span>
                    <span className="lesson-list-meta">
                      {speakPreview(item)}
                      {item.contrast ? (
                        <span className="lesson-list-count">{item.contrast}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {captured.length > 0 && (
          <div className="lesson-group">
            <p className="lesson-section-label">From Live Guide</p>
            <ul className="lesson-list" aria-label="Captured lessons">
              {captured.map((item) => (
                <li key={`${item.capturedFrom}-${item.text}`}>
                  <button
                    type="button"
                    className="lesson-list-item is-captured"
                    disabled={busy}
                    onClick={() => onPick(item)}
                  >
                    <span className="lesson-list-word">{item.text}</span>
                    <span className="lesson-list-meta">
                      {speakPreview(item)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.id} className="lesson-group">
            <p className="lesson-section-label">{group.label}</p>
            <ul className="lesson-list" aria-label={group.label}>
              {group.lessons.map((item) => (
                <li key={item.text}>
                  <button
                    type="button"
                    className="lesson-list-item"
                    disabled={busy}
                    onClick={() => onPick(item)}
                  >
                    <span className="lesson-list-word">{item.text}</span>
                    <span className="lesson-list-meta">
                      {speakPreview(item)}
                      <span className="lesson-list-count">
                        {item.steps.length} sounds
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {error && <p className="guide-error lesson-error">{error}</p>}
      </div>
    </section>
  );
}
