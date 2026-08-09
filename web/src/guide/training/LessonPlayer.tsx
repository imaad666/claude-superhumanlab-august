import { GeneratingSplat } from "../components/GeneratingSplat";
import type {
  LessonAttemptFeedback,
  LessonAttemptResult,
  LessonMemory,
  LessonPhase,
  StepMetrics,
} from "./types";

type LessonPlayerProps = {
  lesson: LessonMemory;
  phase: LessonPhase;
  stepIndex: number;
  liveCue?: string | null;
  liveMatch?: "good" | "close" | "try_again" | null;
  /** A slower, image-aware cue from the local vision model. */
  visionCue?: string | null;
  shapeMatch?: "good" | "close" | "try_again" | null;
  voiceOk?: boolean;
  needsVoice?: boolean;
  goodMs?: number;
  goodHoldMs?: number;
  trackingReady?: boolean;
  volume?: number;
  voiceActive?: boolean;
  result: LessonAttemptResult | null;
  feedback: LessonAttemptFeedback | null;
  feedbackBusy?: boolean;
  sentenceProgress?: {
    wordIndex: number;
    totalWords: number;
    nextWord: string | null;
    nextReady: boolean;
  } | null;
  nextWordLoading?: boolean;
  onRetry: () => void;
  onBackToPick: () => void;
  onSkip?: () => void;
  onContinueSentence?: () => void;
};

function pct(n: number) {
  return Math.round(Math.min(1, Math.max(0, n)) * 100);
}

function SoundMapMeters({ metrics }: { metrics: StepMetrics }) {
  const rows: Array<{
    key: string;
    label: string;
    you: number;
    target?: number;
  }> = [
    { key: "open", label: "open", you: metrics.observed.open, target: metrics.target.open },
    { key: "wide", label: "wide", you: metrics.observed.wide, target: metrics.target.wide },
    { key: "round", label: "round", you: metrics.observed.round, target: metrics.target.round },
    { key: "vol", label: "vol", you: metrics.observed.vol, target: metrics.target.vol },
    { key: "pitch", label: "pitch", you: metrics.observed.pitch },
    { key: "smile", label: "smile", you: metrics.observed.smile },
    { key: "jaw", label: "jaw", you: metrics.observed.jaw },
    { key: "funnel", label: "funnel", you: metrics.observed.funnel },
  ];

  return (
    <div className="sound-map-meters" aria-label="Brain-style metrics">
      {rows.map((row) => {
        const youPct = pct(row.you);
        const targetPct = row.target != null ? pct(row.target) : null;
        const delta =
          targetPct != null ? Math.abs(youPct - targetPct) : null;
        const tone =
          delta == null ? "" : delta <= 12 ? "is-good" : delta <= 28 ? "is-close" : "is-weak";
        return (
          <div key={row.key} className={`sound-map-meter ${tone}`}>
            <span className="sound-map-meter-label">{row.label}</span>
            <div className="sound-map-meter-track">
              {targetPct != null && (
                <span
                  className="sound-map-meter-target"
                  style={{ left: `${targetPct}%` }}
                  title={`Target ${targetPct}`}
                />
              )}
              <div
                className="sound-map-meter-fill"
                style={{ width: `${Math.max(3, youPct)}%` }}
              />
            </div>
            <span className="sound-map-meter-vals">
              {youPct}
              {targetPct != null ? ` / ${targetPct}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function LessonPlayer({
  lesson,
  phase,
  stepIndex,
  liveCue,
  liveMatch,
  visionCue,
  shapeMatch = null,
  voiceOk = false,
  needsVoice = true,
  goodMs = 0,
  goodHoldMs = 520,
  trackingReady = false,
  volume = 0,
  voiceActive = false,
  result,
  feedback,
  feedbackBusy = false,
  sentenceProgress = null,
  nextWordLoading = false,
  onRetry,
  onBackToPick,
  onSkip,
  onContinueSentence,
}: LessonPlayerProps) {
  const step = lesson.steps[stepIndex] ?? lesson.steps[0];
  const progress = Math.min(1, goodMs / goodHoldMs);
  const volPct = Math.min(100, Math.round(volume * 100));
  const scoreCounts = result
    ? result.scores.reduce(
        (counts, score) => {
          counts[score.match] += 1;
          return counts;
        },
        { good: 0, close: 0, try_again: 0 },
      )
    : null;

  return (
    <section className="guide-panel lesson-player">
      <header className="guide-panel-head">
        <div>
          <h2>{lesson.text}</h2>
          <p className="guide-sub">
            {sentenceProgress
              ? `Sentence · word ${sentenceProgress.wordIndex + 1} of ${sentenceProgress.totalWords}`
              : phase === "guide"
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
        {phase !== "result" && (
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
        )}

        {phase === "guide" && step && (
          <div className="lesson-step-card">
            <p className="lesson-step-label">
              <strong>{step.label}</strong>
              <span className="lesson-step-speak">“{step.speakAs}”</span>
            </p>
            <p className="insight-cue">{liveCue ?? step.cue}</p>
            {visionCue && (
              <p className="lesson-vision-cue">
                Gemma vision · {visionCue}
              </p>
            )}

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
            {sentenceProgress?.nextWord && (
              <p className="lesson-next-word" aria-live="polite">
                Next: “{sentenceProgress.nextWord}”{" "}
                {sentenceProgress.nextReady ? "is ready" : "is preparing"}
              </p>
            )}
          </div>
        )}

        {phase === "result" && result && (
          <div className="lesson-result">
            <div className="lesson-result-hero">
              <div>
                <p className="lesson-result-kicker">Practice recap</p>
                <p className="insight-summary">
                  {feedback?.summary ?? result.summary}
                </p>
              </div>
              <span className={`lesson-result-grade match-${result.overall}`}>
                {result.overall.replace("_", " ")}
              </span>
            </div>

            {scoreCounts && (
              <p className="lesson-result-counts" aria-label="Attempt scores">
                <span>{scoreCounts.good} matched</span>
                <span>{scoreCounts.close} close</span>
                <span>{scoreCounts.try_again} to revisit</span>
              </p>
            )}

            {feedbackBusy && !feedback ? (
              <GeneratingSplat
                label="Brain is writing your recap…"
                detail="Mouth, voice, and next-try tips — usually under half a minute."
              />
            ) : feedback ? (
              <>
                <div className="lesson-next-action">
                  <span>Next try</span>
                  <p>{feedback.nextAction}</p>
                </div>
                <div className="lesson-feedback-observations">
                  <p className="lesson-feedback-observations-label">
                    What we noticed
                  </p>
                  <div
                    className={`lesson-feedback-row ${
                      feedback.focus === "maneuver" ? "is-focus" : ""
                    }`}
                  >
                    <span>Mouth</span>
                    <p>{feedback.maneuver}</p>
                  </div>
                  <div
                    className={`lesson-feedback-row ${
                      feedback.focus === "sound" ? "is-focus" : ""
                    }`}
                  >
                    <span>Voice</span>
                    <p>{feedback.sound}</p>
                  </div>
                  {feedback.stressStatus !== "unavailable" && (
                    <div
                      className={`lesson-feedback-row ${
                      feedback.focus === "stress" ? "is-focus" : ""
                      }`}
                    >
                      <span>Pace</span>
                      <p>{feedback.stress}</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="lesson-next-action is-local">
                <span>Next try</span>
                <p>{result.summary}</p>
              </div>
            )}

            <details className="lesson-sound-map" open>
              <summary>
                Sound map · {result.scores.length} checks · full metrics
              </summary>
              <ul className="lesson-score-list">
                {result.scores.map((sc, i) => {
                  const stepMeta = lesson.steps[i];
                  return (
                    <li key={sc.stepId} className="lesson-score-row">
                      <div className="lesson-score-head">
                        <div className="lesson-score-main">
                          <span className="lesson-score-syll">
                            {stepMeta?.speakAs ?? "?"}
                          </span>
                          <span className="lesson-score-label">
                            {stepMeta?.label ?? ""}
                            {stepMeta?.viseme ? ` · ${stepMeta.viseme}` : ""}
                          </span>
                          <span className={`lesson-score-grade match-${sc.match}`}>
                            {sc.match.replace("_", " ")}
                          </span>
                        </div>
                        <div className="lesson-score-chips">
                          <span
                            className={`lesson-score-evidence match-${sc.shapeMatch}`}
                          >
                            {sc.shapeMatch === "good"
                              ? "Lips matched"
                              : sc.shapeMatch === "close"
                                ? "Lips close"
                                : "Lips revisit"}
                          </span>
                          <span
                            className={`lesson-score-evidence ${
                              !sc.needsVoice || sc.voiceOk
                                ? "match-good"
                                : "match-try_again"
                            }`}
                          >
                            {!sc.needsVoice
                              ? "Voice optional"
                              : sc.voiceOk
                                ? "Voice heard"
                                : "Voice revisit"}
                          </span>
                        </div>
                      </div>
                      <p className="lesson-score-cue">{sc.cue}</p>
                      {sc.metrics && <SoundMapMeters metrics={sc.metrics} />}
                      {sc.metrics && (
                        <p className="lesson-score-delta">
                          Shape error · open {pct(sc.opennessErr)} · wide{" "}
                          {pct(sc.widthErr)} · round {pct(sc.roundnessErr)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
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
            <>
              {sentenceProgress?.nextWord && onContinueSentence && (
                <button
                  type="button"
                  className="btn btn-accent btn-compact"
                  onClick={onContinueSentence}
                >
                  {nextWordLoading && !sentenceProgress.nextReady
                    ? `Continue to “${sentenceProgress.nextWord}”`
                    : `Next word · “${sentenceProgress.nextWord}”`}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={onRetry}
              >
                Try this word again
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
      </div>
    </section>
  );
}
