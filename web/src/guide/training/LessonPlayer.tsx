import type { LessonAttemptResult, LessonMemory, LessonPhase } from "./types";

type LessonPlayerProps = {
  lesson: LessonMemory;
  phase: LessonPhase;
  stepIndex: number;
  liveCue?: string | null;
  liveMatch?: "good" | "close" | "try_again" | null;
  shapeMatch?: "good" | "close" | "try_again" | null;
  voiceOk?: boolean;
  needsVoice?: boolean;
  goodMs?: number;
  goodHoldMs?: number;
  trackingReady?: boolean;
  volume?: number;
  voiceActive?: boolean;
  result: LessonAttemptResult | null;
  onRetry: () => void;
  onBackToPick: () => void;
  onSkip?: () => void;
};

export function LessonPlayer({
  lesson,
  phase,
  stepIndex,
  liveCue,
  liveMatch,
  shapeMatch = null,
  voiceOk = false,
  needsVoice = true,
  goodMs = 0,
  goodHoldMs = 520,
  trackingReady = false,
  volume = 0,
  voiceActive = false,
  result,
  onRetry,
  onBackToPick,
  onSkip,
}: LessonPlayerProps) {
  const step = lesson.steps[stepIndex] ?? lesson.steps[0];
  const progress = Math.min(1, goodMs / goodHoldMs);
  const volPct = Math.min(100, Math.round(volume * 100));

  return (
    <section className="guide-panel lesson-player">
      <header className="guide-panel-head">
        <div>
          <h2>{lesson.text}</h2>
          <p className="guide-sub">
            {phase === "guide"
              ? "Match the ghost lips · say the sound"
              : phase === "result"
                ? "Result"
                : "Lesson"}
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
              className={`lesson-syll ${i === stepIndex && phase === "guide" ? "is-active" : ""} ${
                result?.scores[i] ? `match-${result.scores[i].match}` : ""
              }`}
            >
              {s.speakAs}
              {i < lesson.steps.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>

        {phase === "guide" && step && (
          <div className="lesson-step-card">
            <p className="lesson-step-label">
              <strong>{step.label}</strong>
              <span className="lesson-step-speak">“{step.speakAs}”</span>
            </p>
            <p className="insight-cue">{liveCue ?? step.cue}</p>

            <div className="lesson-check-row" aria-label="Lips and voice checks">
              <span
                className={`lesson-check match-${shapeMatch ?? "try_again"}`}
              >
                Lips · {(shapeMatch ?? "try_again").replace("_", " ")}
              </span>
              <span
                className={`lesson-check ${
                  !needsVoice
                    ? "match-good"
                    : voiceOk
                      ? "match-good"
                      : "match-try_again"
                }`}
              >
                {!needsVoice
                  ? "Voice · optional"
                  : voiceOk
                    ? "Voice · heard"
                    : "Voice · speak"}
              </span>
            </div>

            <div className="lesson-voice" aria-label="Microphone level">
              <span
                className={`lesson-voice-dot ${voiceActive ? "is-hot" : ""}`}
                aria-hidden
              />
              <span className="lesson-voice-label">
                {voiceActive ? "Hearing you" : "Speak out loud"}
              </span>
              <div className="lesson-voice-track">
                <div
                  className={`lesson-voice-fill ${voiceActive ? "is-hot" : ""}`}
                  style={{ width: `${volPct}%` }}
                />
              </div>
              <span className="lesson-voice-val">{volPct}</span>
            </div>

            {!trackingReady && (
              <p className="insight-summary muted">
                Looking for your face — face the camera.
              </p>
            )}
            {trackingReady && liveMatch && (
              <p className={`coach-match match-${liveMatch}`}>
                Combined · {liveMatch.replace("_", " ")}
              </p>
            )}
            {trackingReady && (
              <div
                className="lesson-good-bar"
                aria-label="Hold the match"
                title="Hold lips + voice to continue"
              >
                <div
                  className="lesson-good-fill"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
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
                  <span className="lesson-score-checks">
                    <span className={`insight-chip match-${sc.shapeMatch}`}>
                      lips
                    </span>
                    <span
                      className={`insight-chip ${
                        !sc.needsVoice || sc.voiceOk
                          ? "match-good"
                          : "match-try_again"
                      }`}
                    >
                      voice
                    </span>
                  </span>
                  <span className="lesson-score-cue">{sc.cue}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="session-actions">
          {phase === "guide" && onSkip && (
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={onSkip}
            >
              Skip sound
            </button>
          )}
          {phase === "result" && (
            <button
              type="button"
              className="btn btn-accent btn-compact"
              onClick={onRetry}
            >
              Try again
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={onBackToPick}
          >
            Pick another
          </button>
        </div>
      </div>
    </section>
  );
}
