import type { LessonAttemptResult, LessonMemory, LessonPhase } from "./types";

type LessonPlayerProps = {
  lesson: LessonMemory;
  phase: LessonPhase;
  stepIndex: number;
  liveCue?: string | null;
  liveMatch?: "good" | "close" | "try_again" | null;
  result: LessonAttemptResult | null;
  onWatchAgain: () => void;
  onReady: () => void;
  onBackToPick: () => void;
  onRetry: () => void;
};

export function LessonPlayer({
  lesson,
  phase,
  stepIndex,
  liveCue,
  liveMatch,
  result,
  onWatchAgain,
  onReady,
  onBackToPick,
  onRetry,
}: LessonPlayerProps) {
  const step = lesson.steps[stepIndex] ?? lesson.steps[0];
  const speakLine = lesson.steps.map((s) => s.speakAs).join(" · ");

  return (
    <section className="guide-panel lesson-player">
      <header className="guide-panel-head">
        <div>
          <h2>{lesson.text}</h2>
          <p className="guide-sub">
            {phase === "watch"
              ? "Watch"
              : phase === "recreate"
                ? "Your turn"
                : phase === "result"
                  ? "Result"
                  : "Lesson"}
            {lesson.source ? ` · ${lesson.source}` : ""}
          </p>
        </div>
        <span className="guide-pill">
          {phase === "result"
            ? result?.overall.replace("_", " ") ?? "Done"
            : `${stepIndex + 1}/${lesson.steps.length}`}
        </span>
      </header>

      <div className="lesson-player-body">
        <p className="lesson-speak" aria-label="How to say it">
          {lesson.steps.map((s, i) => (
            <span
              key={s.id}
              className={`lesson-syll ${i === stepIndex && phase !== "result" ? "is-active" : ""} ${
                result?.scores[i]
                  ? `match-${result.scores[i].match}`
                  : ""
              }`}
            >
              {s.speakAs}
              {i < lesson.steps.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>

        {phase !== "result" && step && (
          <div className="lesson-step-card">
            <p className="lesson-step-label">
              <strong>{step.label}</strong>
              <span className="lesson-step-speak">“{step.speakAs}”</span>
            </p>
            <p className="insight-cue">
              {phase === "recreate" && liveCue ? liveCue : step.cue}
            </p>
            {phase === "recreate" && liveMatch && (
              <p className={`coach-match match-${liveMatch}`}>
                {liveMatch.replace("_", " ")}
              </p>
            )}
          </div>
        )}

        {phase === "result" && result && (
          <div className="lesson-result">
            <p className="insight-summary">{result.summary}</p>
            <ul className="lesson-score-list">
              {result.scores.map((sc, i) => (
                <li key={sc.stepId} className="lesson-score-row">
                  <span className="lesson-score-syll">
                    {lesson.steps[i]?.speakAs ?? "?"}
                  </span>
                  <span className={`insight-chip match-${sc.match}`}>
                    {sc.match.replace("_", " ")}
                  </span>
                  <span className="lesson-score-cue">{sc.cue}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {phase === "watch" && (
          <p className="insight-summary muted">{lesson.tip}</p>
        )}

        <div className="session-actions">
          {phase === "watch" && (
            <>
              <button
                type="button"
                className="btn btn-accent btn-compact"
                onClick={onReady}
              >
                I’m ready
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={onWatchAgain}
              >
                Watch again
              </button>
            </>
          )}
          {phase === "recreate" && (
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={onWatchAgain}
            >
              Watch again
            </button>
          )}
          {phase === "result" && (
            <>
              <button
                type="button"
                className="btn btn-accent btn-compact"
                onClick={onRetry}
              >
                Try again
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={onWatchAgain}
              >
                Watch again
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={onBackToPick}
          >
            Pick another
          </button>
        </div>

        <p className="guide-sub lesson-speak-line" title={speakLine}>
          {lesson.kind === "word" ? "Word" : "Sentence"} · {lesson.steps.length}{" "}
          shapes
        </p>
      </div>
    </section>
  );
}
