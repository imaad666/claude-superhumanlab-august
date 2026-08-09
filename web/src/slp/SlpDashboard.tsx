import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { assignableWords } from "../guide/training/bank";
import {
  CURRICULUM,
  PLAN_SCHEDULE_OPTIONS,
  PLAN_TARGET_OPTIONS,
} from "./lessonPlans";
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
import type { PhonemeStats, TherapyPlan } from "./types";
import "./SlpDashboard.css";

const EMPTY_PLAN: TherapyPlan = {
  topic: "",
  targets: [],
  schedule: [],
  activitiesHave: "",
  activitiesNeed: "",
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

/** Tiny inline trend line — overall accuracy per session, oldest → newest. */
function TrendLine({ points }: { points: number[] }) {
  const W = 220;
  const H = 56;
  const pad = 6;
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
    <svg className="slp-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Accuracy over sessions">
      <line x1={pad} y1={H - pad - (0.7 * (H - pad * 2))} x2={W - pad} y2={H - pad - (0.7 * (H - pad * 2))} className="slp-trend-grid" />
      {points.length > 1 && <path d={path} className="slp-trend-path" fill="none" />}
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 3.5 : 2} className="slp-trend-dot" />
      ))}
      {last && (
        <text x={last[0]} y={Math.max(12, last[1] - 8)} textAnchor="end" className="slp-trend-label">
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

/** Year-long-style curriculum overview — practice items launch a lesson. */
function Curriculum({ onPractice }: { onPractice: (word: string) => void }) {
  return (
    <div className="slp-curriculum">
      {CURRICULUM.map((cat) => (
        <div key={cat.id} className="slp-curr-cat">
          <p className="slp-curr-cat-title">{cat.title}</p>
          <div className="slp-curr-items">
            {cat.items.map((item) =>
              item.status === "practice" ? (
                <div key={item.label} className="slp-curr-item is-practice">
                  <span className="slp-curr-item-label">{item.label}</span>
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
                </div>
              ) : (
                <span key={item.label} className="slp-curr-item is-roadmap">
                  {item.label}
                  <span className="slp-curr-roadmap-tag">roadmap</span>
                </span>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** SLP's single-plan session worksheet — autosaves to localStorage. */
function PlanForm({
  plan,
  onChange,
}: {
  plan: TherapyPlan;
  onChange: (next: TherapyPlan) => void;
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

  return (
    <div className="slp-plan-form">
      <label className="slp-plan-field">
        <span className="slp-plan-label">Topic / theme</span>
        <input
          className="slp-plan-input"
          type="text"
          placeholder="e.g. Outer space — planets, stars, astronauts"
          value={plan.topic}
          onChange={(e) => update({ topic: e.target.value })}
        />
      </label>

      <div className="slp-plan-field">
        <span className="slp-plan-label">Targets</span>
        <div className="slp-plan-chips">
          {PLAN_TARGET_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={plan.targets.includes(t)}
              className={`slp-plan-chip ${plan.targets.includes(t) ? "is-on" : ""}`}
              onClick={() => toggle("targets", t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="slp-plan-field">
        <span className="slp-plan-label">Schedule</span>
        <div className="slp-plan-chips">
          {PLAN_SCHEDULE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={plan.schedule.includes(s)}
              className={`slp-plan-chip ${plan.schedule.includes(s) ? "is-on" : ""}`}
              onClick={() => toggle("schedule", s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <label className="slp-plan-field">
        <span className="slp-plan-label">Activities you already have</span>
        <textarea
          className="slp-plan-textarea"
          rows={2}
          placeholder="What do you already own that pairs with this theme?"
          value={plan.activitiesHave}
          onChange={(e) => update({ activitiesHave: e.target.value })}
        />
      </label>

      <label className="slp-plan-field">
        <span className="slp-plan-label">Activities you still need</span>
        <textarea
          className="slp-plan-textarea"
          rows={2}
          placeholder="What gaps do you need to fill?"
          value={plan.activitiesNeed}
          onChange={(e) => update({ activitiesNeed: e.target.value })}
        />
      </label>
    </div>
  );
}

export function SlpDashboard() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("learner");
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState<string[] | null>(null);

  // Refresh when progress changes (e.g. returning from a practice session).
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

  const [plan, setPlanState] = useState<TherapyPlan>(() => getPlan() ?? EMPTY_PLAN);
  const updatePlan = useCallback((next: TherapyPlan) => {
    setPlanState(next);
    setPlan(next);
  }, []);

  // Persist the algorithm's pick so the trainer/picker see it — unless a human
  // SLP has taken the wheel, in which case auto-assignment stays quiet.
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

  const assignAsSlp = () => {
    setAssignedSet({ words: selected, assignedBy: "SLP" });
    setDraft(null);
  };
  const handBackToAlgorithm = () => {
    setAssignedSet(autoAssign(sessions));
    setDraft(null);
  };

  const hasData = totals.attempts > 0;
  const weakest = stats.slice(0, 3);

  return (
    <main className="slp">
      <header className="slp-top">
        <Link className="back" to="/">
          ← Speak &amp; See
        </Link>
        <div className="slp-viewswitch" role="tablist" aria-label="Who's using this">
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
            I’m practising
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "slp"}
            className={`slp-view-chip ${view === "slp" ? "is-active" : ""}`}
            onClick={() => setView("slp")}
          >
            I’m the SLP
          </button>
        </div>
      </header>

      <section className="slp-hero">
        <p className="eyebrow">
          {view === "learner" ? "Your speaking progress" : "Therapist view"}
        </p>
        <h1 className="brand brand-sm">
          {view === "learner" ? "Keep going — you’re getting clearer" : "Guide the next steps"}
        </h1>
        <p className="lede">
          {view === "learner"
            ? "Practise a little each day. The app watches which sounds are still tricky and picks what to try next — until your SLP wants to."
            : "Review how each sound is going, then choose the words to focus on next. Your picks replace the app’s automatic suggestions."}
        </p>
      </section>

      <div className="slp-stats">
        <div className="slp-stat">
          <span className="slp-stat-num">{totals.sessionCount}</span>
          <span className="slp-stat-label">day{totals.sessionCount === 1 ? "" : "s"} practised</span>
        </div>
        <div className="slp-stat">
          <span className="slp-stat-num">{totals.attempts}</span>
          <span className="slp-stat-label">sounds tried</span>
        </div>
        <div className="slp-stat">
          <span className={`slp-stat-num is-${scoreTone(totals.overall)}`}>
            {hasData ? totals.overall : "—"}
          </span>
          <span className="slp-stat-label">avg accuracy</span>
        </div>
      </div>

      <div className="slp-grid">
        <section className="slp-card">
          <header className="slp-card-head">
            <h2>Accuracy over time</h2>
            <span className="slp-pill">{trend.length} session{trend.length === 1 ? "" : "s"}</span>
          </header>
          {hasData ? (
            <>
              <TrendLine points={trend.map((t) => t.avg)} />
              <h3 className="slp-subhead">Sounds by accuracy</h3>
              <PhonemeBars stats={stats} />
            </>
          ) : (
            <p className="slp-empty">
              No practice yet. Try a word below — each attempt lights up here,
              sound by sound.
            </p>
          )}
        </section>

        {view === "learner" ? (
          <section className="slp-card">
            <header className="slp-card-head">
              <h2>Practise next</h2>
              <span className="slp-pill">
                {effective.assignedBy === "SLP" ? "From your SLP" : "Chosen for you"}
              </span>
            </header>
            <p className="slp-note">
              {effective.assignedBy === "SLP"
                ? "Your SLP picked these for you."
                : weakest.length
                  ? `Focused on your trickiest sounds${
                      weakest[0] ? ` — starting with “${weakest[0].phoneme}”.` : "."
                    }`
                  : "A gentle starter set to warm up."}
            </p>
            <div className="slp-words">
              {effective.words.map((word) => (
                <button
                  key={word}
                  type="button"
                  className="slp-word-btn"
                  onClick={() => practice(word)}
                >
                  <span className="slp-word-text">{word}</span>
                  <span className="slp-word-go">Practise →</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="slp-card">
            <header className="slp-card-head">
              <h2>Assign words</h2>
              <span className="slp-pill">
                {stored?.assignedBy === "SLP" ? "You’re steering" : "App is steering"}
              </span>
            </header>
            <p className="slp-note">
              Tap words to build this learner’s next set. Numbers show current
              accuracy for that sound.
            </p>
            <div className="slp-contrasts">
              {contrasts.map(([contrast, words]) => (
                <div key={contrast} className="slp-contrast">
                  <p className="slp-contrast-label">{contrast}</p>
                  <div className="slp-words slp-words-compact">
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
                            <span className={`slp-pick-score is-${scoreTone(sc)}`}>
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
                className="btn btn-accent btn-compact"
                disabled={selected.length === 0}
                onClick={assignAsSlp}
              >
                Assign {selected.length} to learner
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={handBackToAlgorithm}
              >
                Let the app choose
              </button>
            </div>
          </section>
        )}
      </div>

      {view === "slp" && (
        <div className="slp-grid slp-grid-plan">
          <section className="slp-card">
            <header className="slp-card-head">
              <h2>Lesson plan library</h2>
              <span className="slp-pill">Year-long overview</span>
            </header>
            <p className="slp-note">
              Tap a word to launch it in practice. Roadmap goals aren’t built
              into the app yet — shown honestly, not faked.
            </p>
            <Curriculum onPractice={practice} />
          </section>

          <section className="slp-card">
            <header className="slp-card-head">
              <h2>Therapy planning</h2>
              <span className="slp-pill">Autosaved</span>
            </header>
            <p className="slp-note">
              Sketch a session around a theme — targets, schedule, and what
              you already have on hand.
            </p>
            <PlanForm plan={plan} onChange={updatePlan} />
          </section>
        </div>
      )}

      <footer className="slp-foot">
        <p className="slp-foot-note">
          Progress is stored on this device only — no account, nothing leaves
          your browser.
        </p>
        {hasData && (
          <button
            type="button"
            className="slp-reset"
            onClick={() => {
              if (window.confirm("Clear all practice progress on this device?")) {
                resetSlp();
                setDraft(null);
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
