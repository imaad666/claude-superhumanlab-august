import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GeneratingSplat } from "../guide/components/GeneratingSplat";
import { assignableWords } from "../guide/training/bank";
import {
  applyGeneratedPlan,
  generateTherapyPlan,
} from "./generateTherapyPlan";
import {
  CURRICULUM,
  PLAN_SCHEDULE_OPTIONS,
  PLAN_TARGET_OPTIONS,
  PLAN_VOCAB_CHIPS,
  PLAN_VOCAB_LABELS,
} from "./lessonPlans";
import {
  SPEECH_ALPHABET,
  soundFullySelected,
  toggleSoundWords,
  wordsForSound,
  type SpeechSoundCell,
} from "./speechAlphabet";
import { autoAssign, computePhonemeStats, sessionTrend } from "./stats";
import {
  getAssignedSet,
  getPlan,
  getSessions,
  resetSlp,
  setAssignedSet,
  setPlan,
  SLP_EVENT,
} from "./store";
import type {
  PhonemeStats,
  TherapyPlan,
  TherapyVocabKey,
} from "./types";
import { EMPTY_VOCAB } from "./types";
import "./SlpDashboard.css";

const EMPTY_PLAN: TherapyPlan = {
  topic: "",
  targets: [],
  schedule: [],
  activitiesHave: "",
  activitiesNeed: "",
  vocab: { ...EMPTY_VOCAB },
  updatedAt: 0,
};

type View = "learner" | "slp";

function scoreTone(score: number): "good" | "close" | "weak" {
  if (score >= 70) return "good";
  if (score >= 45) return "close";
  return "weak";
}

function sameWords(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

function TrendLine({ points }: { points: number[] }) {
  const W = 280;
  const H = 64;
  const pad = 8;
  if (points.length === 0) return null;
  const span = points.length > 1 ? points.length - 1 : 1;
  const coords = points.map((v, i) => {
    const x = pad + (i / span) * (W - pad * 2);
    const y = H - pad - (Math.max(0, Math.min(100, v)) / 100) * (H - pad * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg
      className="slp-trend"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Accuracy over sessions"
    >
      <line
        x1={pad}
        y1={H - pad - 0.7 * (H - pad * 2)}
        x2={W - pad}
        y2={H - pad - 0.7 * (H - pad * 2)}
        className="slp-trend-grid"
      />
      {points.length > 1 && <path d={path} className="slp-trend-path" fill="none" />}
      {coords.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === coords.length - 1 ? 3.5 : 2}
          className="slp-trend-dot"
        />
      ))}
      {last && (
        <text
          x={last[0]}
          y={Math.max(12, last[1] - 8)}
          textAnchor="end"
          className="slp-trend-label"
        >
          {points[points.length - 1]}
        </text>
      )}
    </svg>
  );
}

function PhonemeBars({ stats }: { stats: PhonemeStats[] }) {
  if (stats.length === 0) return null;
  return (
    <ul className="slp-bars" aria-label="Accuracy by sound">
      {stats.map((s) => (
        <li key={s.phoneme} className="slp-bar-row">
          <span className="slp-bar-name">{s.phoneme}</span>
          <span className="slp-bar-track">
            <span
              className={`slp-bar-fill is-${scoreTone(s.avgScore)}`}
              style={{ width: `${Math.max(4, s.avgScore)}%` }}
            />
          </span>
          <span className="slp-bar-val">{s.avgScore}</span>
          <span className="slp-bar-count">{s.attempts}×</span>
        </li>
      ))}
    </ul>
  );
}

function Curriculum({ onPractice }: { onPractice: (word: string) => void }) {
  return (
    <div className="slp-curriculum">
      {CURRICULUM.map((cat) => (
        <div key={cat.id} className="slp-curr-cat">
          <h3 className="slp-curr-cat-title">{cat.title}</h3>
          <ul className="slp-curr-items">
            {cat.items.map((item) => (
              <li
                key={item.label}
                className={`slp-curr-item ${
                  item.status === "practice" ? "is-practice" : "is-roadmap"
                }`}
              >
                <span className="slp-curr-item-label">{item.label}</span>
                {item.status === "practice" ? (
                  <span className="slp-curr-item-words">
                    {item.words?.map((w) => (
                      <button
                        key={w}
                        type="button"
                        className="slp-curr-word"
                        onClick={() => onPractice(w)}
                      >
                        {w}
                      </button>
                    ))}
                  </span>
                ) : (
                  <span className="slp-curr-roadmap-tag">later</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SpeechAlphabet({
  selected,
  phonemeScore,
  onToggleSound,
}: {
  selected: string[];
  phonemeScore: (phoneme: string) => number | undefined;
  onToggleSound: (cell: SpeechSoundCell) => void;
}) {
  return (
    <div className="slp-alphabet" role="group" aria-label="Speech alphabet">
      {SPEECH_ALPHABET.map((cell) => {
        const practice = cell.status === "practice";
        const words = wordsForSound(cell);
        const on = practice && soundFullySelected(cell, selected);
        const score = cell.phonemes
          .map((p) => phonemeScore(p))
          .find((s) => s != null);
        return (
          <button
            key={cell.id}
            type="button"
            className={`slp-alpha-cell ${practice ? "is-practice" : "is-roadmap"} ${
              on ? "is-on" : ""
            }`}
            disabled={!practice}
            aria-pressed={practice ? on : undefined}
            title={
              practice
                ? `${cell.label} · ${words.join(", ")}`
                : `${cell.label} · later`
            }
            onClick={() => practice && onToggleSound(cell)}
          >
            <span className="slp-alpha-ipa">/{cell.ipa}/</span>
            <span className="slp-alpha-label">{cell.label}</span>
            <span className="slp-alpha-meta">
              {practice
                ? score != null
                  ? `${score}`
                  : `${words.length}w`
                : "later"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const VOCAB_KEYS: TherapyVocabKey[] = [
  "core",
  "basicConcepts",
  "describing",
  "tier2",
  "other",
];

function PlanWorksheet({
  plan,
  onChange,
  generating,
  generateError,
  onGenerate,
}: {
  plan: TherapyPlan;
  onChange: (next: TherapyPlan) => void;
  generating: boolean;
  generateError: string | null;
  onGenerate: () => void;
}) {
  const update = (patch: Partial<TherapyPlan>) =>
    onChange({ ...plan, ...patch, updatedAt: Date.now() });

  const toggle = (key: "targets" | "schedule", value: string) => {
    const set = plan[key];
    update({
      [key]: set.includes(value)
        ? set.filter((v) => v !== value)
        : [...set, value],
    } as Partial<TherapyPlan>);
  };

  const toggleVocab = (bucket: TherapyVocabKey, word: string) => {
    const set = plan.vocab[bucket];
    update({
      vocab: {
        ...plan.vocab,
        [bucket]: set.includes(word)
          ? set.filter((v) => v !== word)
          : [...set, word],
      },
    });
  };

  return (
    <div className="slp-worksheet">
      <div className="slp-worksheet-actions">
        <button
          type="button"
          className="btn btn-accent"
          disabled={generating}
          onClick={onGenerate}
        >
          {generating ? "Generating…" : "Generate plan"}
        </button>
        <p className="slp-note">
          Gemma expands activities + vocab from your chips. Targets and schedule
          stay yours.
        </p>
      </div>

      {generating && (
        <GeneratingSplat
          label="Building your SIMPLE plan…"
          detail="Theme, materials, and vocabulary buckets — usually under half a minute."
        />
      )}

      {generateError && !generating && (
        <p className="slp-gen-error">{generateError}</p>
      )}

      {plan.generatedNote && !generating && (
        <p className="slp-gen-note">{plan.generatedNote}</p>
      )}

      <ol className="slp-simple-steps">
        <li className="slp-simple-step">
          <div className="slp-simple-head">
            <span className="slp-simple-num">1</span>
            <div>
              <h3>Therapy topic / theme / book</h3>
              <p className="slp-note">Foundation for the session.</p>
            </div>
          </div>
          <input
            className="slp-plan-input"
            type="text"
            placeholder="e.g. Outer space"
            value={plan.topic}
            disabled={generating}
            onChange={(e) => update({ topic: e.target.value })}
          />
        </li>

        <li className="slp-simple-step">
          <div className="slp-simple-head">
            <span className="slp-simple-num">2</span>
            <div>
              <h3>Lesson plan targets</h3>
              <p className="slp-note">Goals to cover this week.</p>
            </div>
          </div>
          <div className="slp-plan-chips">
            {PLAN_TARGET_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={plan.targets.includes(t)}
                className={`slp-plan-chip ${plan.targets.includes(t) ? "is-on" : ""}`}
                disabled={generating}
                onClick={() => toggle("targets", t)}
              >
                {t}
              </button>
            ))}
          </div>
        </li>

        <li className="slp-simple-step">
          <div className="slp-simple-head">
            <span className="slp-simple-num">3</span>
            <div>
              <h3>Schedule</h3>
              <p className="slp-note">Routine students can expect.</p>
            </div>
          </div>
          <div className="slp-plan-chips">
            {PLAN_SCHEDULE_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={plan.schedule.includes(s)}
                className={`slp-plan-chip ${plan.schedule.includes(s) ? "is-on" : ""}`}
                disabled={generating}
                onClick={() => toggle("schedule", s)}
              >
                {s}
              </button>
            ))}
          </div>
        </li>

        <li className="slp-simple-step">
          <div className="slp-simple-head">
            <span className="slp-simple-num">4</span>
            <div>
              <h3>Activities & materials</h3>
              <p className="slp-note">Goal-centric first — then the fun.</p>
            </div>
          </div>
          <div className="slp-plan-pair">
            <label className="slp-plan-field">
              <span className="slp-plan-label">Already have</span>
              <textarea
                className="slp-plan-textarea"
                rows={3}
                placeholder="Materials on hand…"
                value={plan.activitiesHave}
                disabled={generating}
                onChange={(e) => update({ activitiesHave: e.target.value })}
              />
            </label>
            <label className="slp-plan-field">
              <span className="slp-plan-label">Still need</span>
              <textarea
                className="slp-plan-textarea"
                rows={3}
                placeholder="Gaps to fill…"
                value={plan.activitiesNeed}
                disabled={generating}
                onChange={(e) => update({ activitiesNeed: e.target.value })}
              />
            </label>
          </div>
        </li>

        <li className="slp-simple-step">
          <div className="slp-simple-head">
            <span className="slp-simple-num">5</span>
            <div>
              <h3>Target vocabulary</h3>
              <p className="slp-note">
                Core, concepts, describing, tier 2, and other targets.
              </p>
            </div>
          </div>
          <div className="slp-vocab-grid">
            {VOCAB_KEYS.map((key) => (
              <div key={key} className="slp-vocab-bucket">
                <span className="slp-plan-label">{PLAN_VOCAB_LABELS[key]}</span>
                <div className="slp-plan-chips">
                  {PLAN_VOCAB_CHIPS[key].map((word) => {
                    const on = plan.vocab[key].includes(word);
                    return (
                      <button
                        key={word}
                        type="button"
                        aria-pressed={on}
                        className={`slp-plan-chip ${on ? "is-on" : ""}`}
                        disabled={generating}
                        onClick={() => toggleVocab(key, word)}
                      >
                        {word}
                      </button>
                    );
                  })}
                  {plan.vocab[key]
                    .filter((w) => !PLAN_VOCAB_CHIPS[key].includes(w))
                    .map((word) => (
                      <button
                        key={word}
                        type="button"
                        aria-pressed
                        className="slp-plan-chip is-on"
                        disabled={generating}
                        onClick={() => toggleVocab(key, word)}
                      >
                        {word}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </li>
      </ol>
    </div>
  );
}

export function SlpDashboard() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("learner");
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(SLP_EVENT, bump);
    window.addEventListener("focus", bump);
    return () => {
      window.removeEventListener(SLP_EVENT, bump);
      window.removeEventListener("focus", bump);
    };
  }, []);

  const sessions = useMemo(() => getSessions(), [tick]);
  const stats = useMemo(
    () => computePhonemeStats(sessions).sort((a, b) => a.avgScore - b.avgScore),
    [sessions],
  );
  const trend = useMemo(() => sessionTrend(sessions), [sessions]);

  const stored = useMemo(() => getAssignedSet(), [tick]);
  const effective = useMemo(
    () => (stored?.assignedBy === "SLP" ? stored : autoAssign(sessions)),
    [stored, sessions],
  );

  const [plan, setPlanState] = useState<TherapyPlan>(
    () => getPlan() ?? EMPTY_PLAN,
  );
  const updatePlan = useCallback((next: TherapyPlan) => {
    const normalized: TherapyPlan = {
      ...EMPTY_PLAN,
      ...next,
      vocab: { ...EMPTY_VOCAB, ...(next.vocab ?? {}) },
    };
    setPlanState(normalized);
    setPlan(normalized);
  }, []);

  useEffect(() => {
    if (stored?.assignedBy === "SLP") return;
    const auto = autoAssign(getSessions());
    if (
      stored?.assignedBy === "algorithm" &&
      sameWords(stored.words, auto.words)
    ) {
      return;
    }
    setAssignedSet(auto);
  }, [tick, stored]);

  const totals = useMemo(() => {
    const attempts = sessions.reduce((n, s) => n + s.attempts.length, 0);
    const overall = attempts
      ? Math.round(
          sessions.reduce(
            (n, s) => n + s.attempts.reduce((m, a) => m + a.score, 0),
            0,
          ) / attempts,
        )
      : 0;
    return { sessionCount: sessions.length, attempts, overall };
  }, [sessions]);

  const practice = useCallback(
    (word: string) => navigate("/guide/trainer", { state: { word } }),
    [navigate],
  );

  const contrasts = useMemo(() => {
    const groups = new Map<string, { text: string; targetPhoneme: string }[]>();
    for (const w of assignableWords()) {
      const arr = groups.get(w.contrast) ?? [];
      arr.push({ text: w.text, targetPhoneme: w.targetPhoneme });
      groups.set(w.contrast, arr);
    }
    return [...groups.entries()];
  }, []);

  const phonemeScore = useMemo(() => {
    const map = new Map(stats.map((s) => [s.phoneme, s.avgScore]));
    return (phoneme: string) => map.get(phoneme);
  }, [stats]);

  const selected = draft ?? effective.words;
  const toggleWord = (word: string) => {
    const base = draft ?? effective.words;
    setDraft(
      base.includes(word) ? base.filter((w) => w !== word) : [...base, word],
    );
  };

  const onToggleSound = (cell: SpeechSoundCell) => {
    const base = draft ?? effective.words;
    setDraft(toggleSoundWords(cell, base));
  };

  const assignAsSlp = () => {
    setAssignedSet({ words: selected, assignedBy: "SLP" });
    setDraft(null);
  };
  const handBackToAlgorithm = () => {
    setAssignedSet(autoAssign(sessions));
    setDraft(null);
  };

  const onGeneratePlan = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generateTherapyPlan({
        topic: plan.topic,
        targets: plan.targets,
        schedule: plan.schedule,
        weakPhonemes: stats.slice(0, 4).map((s) => s.phoneme),
        assignedWords: selected,
        activitiesHave: plan.activitiesHave,
        activitiesNeed: plan.activitiesNeed,
        vocab: plan.vocab,
      });
      updatePlan(applyGeneratedPlan(plan, result));
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Could not generate the plan",
      );
    } finally {
      setGenerating(false);
    }
  }, [generating, plan, selected, stats, updatePlan]);

  const hasData = totals.attempts > 0;
  const weakest = stats.slice(0, 3);

  return (
    <main className={`slp ${view === "slp" ? "is-slp" : "is-learner"}`}>
      <header className="slp-top">
        <Link className="back" to="/">
          ← Speak &amp; See
        </Link>
        <div
          className="slp-viewswitch"
          role="tablist"
          aria-label="Who's using this"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "learner"}
            className={`slp-view-chip ${view === "learner" ? "is-active" : ""}`}
            onClick={() => {
              setView("learner");
              setDraft(null);
            }}
          >
            Practicing
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "slp"}
            className={`slp-view-chip ${view === "slp" ? "is-active" : ""}`}
            onClick={() => setView("slp")}
          >
            SLP
          </button>
        </div>
      </header>

      <header className="slp-hero">
        <p className="brand brand-sm">Speak &amp; See</p>
        <h1>
          {view === "learner" ? "Your next sounds" : "Guide this learner"}
        </h1>
        <p className="lede">
          {view === "learner"
            ? effective.assignedBy === "SLP"
              ? "Your SLP picked these — tap one to practice."
              : weakest.length
                ? `Suggested for your trickier sounds${
                    weakest[0] ? `, starting with “${weakest[0].phoneme}”.` : "."
                  }`
                : "A short starter set. Tap a word and practice with the camera."
            : "Pick sounds and words, then fill a SIMPLE session plan — or let Gemma expand it."}
        </p>
      </header>

      {view === "learner" ? (
        <section className="slp-panel slp-primary" aria-label="Practice next">
          <div className="slp-panel-head">
            <h2>Practice next</h2>
            <p className="slp-note">
              {effective.assignedBy === "SLP"
                ? "From your SLP — tap a word to open the trainer."
                : "Chosen for you — tap a word to open the trainer."}
            </p>
          </div>
          <div className="slp-word-grid">
            {effective.words.map((word) => (
              <button
                key={word}
                type="button"
                className="slp-word-btn"
                onClick={() => practice(word)}
              >
                <span className="slp-word-text">{word}</span>
                <span className="slp-word-go">Practice →</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="slp-panel slp-primary" aria-label="Assign words">
            <div className="slp-panel-head">
              <h2>Assign words</h2>
              <p className="slp-note">
                Tap words to build this learner’s next set. Numbers show current
                accuracy when available.
              </p>
            </div>
            <div className="slp-contrasts">
              {contrasts.map(([contrast, words]) => (
                <div key={contrast} className="slp-contrast">
                  <p className="slp-contrast-label">{contrast}</p>
                  <div className="slp-picks">
                    {words.map((w) => {
                      const sc = phonemeScore(w.targetPhoneme);
                      const on = selected.includes(w.text);
                      return (
                        <button
                          key={w.text}
                          type="button"
                          aria-pressed={on}
                          className={`slp-pick ${on ? "is-on" : ""}`}
                          onClick={() => toggleWord(w.text)}
                        >
                          <span>{w.text}</span>
                          {sc != null && (
                            <span
                              className={`slp-pick-score is-${scoreTone(sc)}`}
                            >
                              {sc}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="slp-assign-actions">
              <button
                type="button"
                className="btn btn-accent"
                disabled={selected.length === 0}
                onClick={assignAsSlp}
              >
                Assign {selected.length}{" "}
                {selected.length === 1 ? "word" : "words"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handBackToAlgorithm}
              >
                Let the app choose
              </button>
            </div>
          </section>

          <section
            className="slp-panel slp-alphabet-panel"
            aria-label="Speech alphabet"
          >
            <div className="slp-panel-head">
              <h2>Speech alphabet</h2>
              <p className="slp-note">
                Therapy sounds with IPA-ish labels. Tap a live cell to add its
                practice words to the assign set. Grey = roadmap.
              </p>
            </div>
            <SpeechAlphabet
              selected={selected}
              phonemeScore={phonemeScore}
              onToggleSound={onToggleSound}
            />
          </section>
        </>
      )}

      <section className="slp-panel slp-progress" aria-label="Progress">
        <div className="slp-panel-head">
          <h2>Progress</h2>
          <p className="slp-progress-line">
            {hasData ? (
              <>
                <strong className={`is-${scoreTone(totals.overall)}`}>
                  {totals.overall}%
                </strong>{" "}
                avg · {totals.attempts} sounds · {totals.sessionCount} day
                {totals.sessionCount === 1 ? "" : "s"}
              </>
            ) : (
              <span className="slp-note">
                No practice logged yet — start a word above.
              </span>
            )}
          </p>
        </div>

        {hasData && (
          <div className="slp-progress-body">
            <div className="slp-progress-col">
              <h2>Over time</h2>
              <TrendLine points={trend.map((t) => t.avg)} />
            </div>
            <div className="slp-progress-col">
              <h2>By sound</h2>
              <PhonemeBars stats={stats} />
            </div>
          </div>
        )}
      </section>

      {view === "slp" && (
        <>
          <section
            className="slp-panel slp-worksheet-panel"
            aria-label="SIMPLE session plan"
          >
            <div className="slp-panel-head">
              <h2>SIMPLE session plan</h2>
              <p className="slp-note">
                Topic → targets → schedule → activities → vocabulary. Autosaved
                on this device.
              </p>
            </div>
            <PlanWorksheet
              plan={plan}
              onChange={updatePlan}
              generating={generating}
              generateError={generateError}
              onGenerate={onGeneratePlan}
            />
          </section>

          <section className="slp-panel slp-tool" aria-label="Curriculum">
            <div className="slp-panel-head">
              <h2>Curriculum</h2>
              <p className="slp-note">
                Launch practice words. Grey items are roadmap goals not in the
                app yet.
              </p>
            </div>
            <Curriculum onPractice={practice} />
          </section>
        </>
      )}

      <footer className="slp-foot">
        <p className="slp-foot-note">
          Stored on this device only — nothing leaves your browser.
        </p>
        {hasData && (
          <button
            type="button"
            className="slp-reset"
            onClick={() => {
              if (
                window.confirm("Clear all practice progress on this device?")
              ) {
                resetSlp();
                setDraft(null);
                updatePlan(EMPTY_PLAN);
              }
            }}
          >
            Reset progress
          </button>
        )}
      </footer>
    </main>
  );
}
