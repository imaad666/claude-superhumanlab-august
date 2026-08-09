import { formatDuration } from "../hooks/useSessionRecorder";
import type { SessionAnalysis } from "../sessionTypes";
import type { GuideSession } from "../sessionTypes";
import type { LessonMemory } from "../training/types";
import { TONE_LABELS } from "../types";

type SessionReviewPanelProps = {
  session: GuideSession | null;
  analysis: SessionAnalysis | null;
  analyzing: boolean;
  buildingLessons?: boolean;
  builtLessons?: LessonMemory[] | null;
  recording?: boolean;
  elapsedMs?: number;
  sampleCount?: number;
  progress: { done: number; total: number } | null;
  error: string | null;
  onAnalyze: () => void;
  onBuildLessons: () => void;
  onDiscard: () => void;
};

export function SessionReviewPanel({
  session,
  analysis,
  analyzing,
  buildingLessons = false,
  builtLessons = null,
  recording = false,
  elapsedMs = 0,
  sampleCount = 0,
  progress,
  error,
  onAnalyze,
  onBuildLessons,
  onDiscard,
}: SessionReviewPanelProps) {
  const busy = analyzing || buildingLessons;

  if (recording) {
    return (
      <section className="guide-panel session-panel">
        <header className="guide-panel-head">
          <h2>Session</h2>
          <span className="guide-pill">Recording</span>
        </header>
        <div className="session-body">
          <p className="insight-summary">
            Capturing MediaPipe lip vectors, voice, and transcript —{" "}
            {formatDuration(elapsedMs)} · {sampleCount} samples.
          </p>
          <p className="insight-summary muted">
            Stop when they finish. Gemma turns the clip into word lessons with
            real teacher mouth shapes.
          </p>
        </div>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="guide-panel session-panel">
        <header className="guide-panel-head">
          <h2>Session</h2>
          <span className="guide-pill">Idle</span>
        </header>
        <div className="session-body">
          <p className="insight-summary muted">
            Record a teacher or friend speaking. After you stop, the model builds
            practice lessons word-by-word from their real lip vectors.
          </p>
        </div>
      </section>
    );
  }

  const overall = analysis?.overall;

  return (
    <section className="guide-panel session-panel">
      <header className="guide-panel-head">
        <h2>Session</h2>
        <span className="guide-pill">
          {buildingLessons
            ? "Building lessons…"
            : analyzing
              ? progress
                ? `Analyzing ${progress.done}/${progress.total}`
                : "Analyzing…"
              : builtLessons?.length
                ? `${builtLessons.length} lessons`
                : analysis
                  ? "Reviewed"
                  : "Ready"}
        </span>
      </header>

      <div className="session-body">
        <div className="session-meta">
          <span>{formatDuration(session.durationMs)}</span>
          <span>·</span>
          <span>{session.samples.length} samples</span>
          <span>·</span>
          <span>{session.words.length} words</span>
          <span>·</span>
          <span>
            {session.samples.filter((s) => s.landmarks).length} lip tracks
          </span>
        </div>

        {session.mediaUrl && (
          <video
            className="session-playback"
            src={session.mediaUrl}
            controls
            playsInline
          />
        )}

        {builtLessons && builtLessons.length > 0 && (
          <div className="session-lessons-built">
            <p className="insight-summary">
              Saved to Personal Trainer → Learn a word:{" "}
              {builtLessons.map((l) => l.text).join(", ")}
            </p>
            <p className="insight-summary muted">
              Each lesson carries the teacher’s MediaPipe mouth shapes.
            </p>
          </div>
        )}

        {overall ? (
          <>
            <div className="insight-chips" aria-label="Session readout">
              <span className={`insight-chip tone-${overall.tone}`}>
                {TONE_LABELS[overall.tone] ?? overall.tone}
              </span>
              <span className="insight-chip">{overall.mood}</span>
              <span className="insight-chip insight-chip-hot">
                {overall.intention}
              </span>
              {overall.usedVision && (
                <span className="insight-chip insight-chip-vision">vision</span>
              )}
              <span className="insight-chip">
                {analysis?.analyzedCount ?? 0} moments
              </span>
            </div>
            <p className="insight-summary">{overall.summary}</p>
            {overall.lipCue && <p className="insight-cue">{overall.lipCue}</p>}
          </>
        ) : (
          !builtLessons?.length && (
            <p className="insight-summary muted">
              {error ??
                "Build lessons with Gemma — attaches real teacher lip vectors for practice."}
            </p>
          )
        )}

        <div className="session-actions">
          {!builtLessons?.length && (
            <button
              type="button"
              className="btn btn-accent btn-compact"
              disabled={busy || session.samples.length === 0}
              onClick={onBuildLessons}
            >
              {buildingLessons ? "Building…" : "Build word lessons"}
            </button>
          )}
          {!analysis && (
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              disabled={busy || session.samples.length === 0}
              onClick={onAnalyze}
            >
              {analyzing ? "Analyzing…" : "Analyze tone"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            disabled={busy}
            onClick={onDiscard}
          >
            Discard
          </button>
        </div>
      </div>
    </section>
  );
}
