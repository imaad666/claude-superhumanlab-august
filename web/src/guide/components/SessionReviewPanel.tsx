import { formatDuration } from "../hooks/useSessionRecorder";
import type { SessionAnalysis } from "../sessionTypes";
import type { GuideSession } from "../sessionTypes";
import type { LessonMemory } from "../training/types";
import { TONE_LABELS } from "../types";
import { GeneratingSplat } from "./GeneratingSplat";
import { RecordingPlayback } from "./RecordingPlayback";

type SessionReviewPanelProps = {
  session: GuideSession | null;
  analysis: SessionAnalysis | null;
  analyzing: boolean;
  saving?: boolean;
  saved?: boolean;
  saveError?: string | null;
  buildingLessons?: boolean;
  builtLessons?: LessonMemory[] | null;
  builtLessonsTip?: string | null;
  recording?: boolean;
  elapsedMs?: number;
  sampleCount?: number;
  progress: { done: number; total: number } | null;
  error: string | null;
  onAnalyze: () => void;
  onBuildLessons: () => void;
  onSave?: () => void;
  onDiscard: () => void;
};

export function SessionReviewPanel({
  session,
  analysis,
  analyzing,
  saving = false,
  saved = false,
  saveError = null,
  buildingLessons = false,
  builtLessons = null,
  builtLessonsTip = null,
  recording = false,
  elapsedMs = 0,
  sampleCount = 0,
  progress,
  error,
  onAnalyze,
  onBuildLessons,
  onSave,
  onDiscard,
}: SessionReviewPanelProps) {
  const busy = analyzing || buildingLessons || saving;

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
          <span>·</span>
          <span>
            {session.transcriptSource === "live-browser"
              ? "transcript captured live"
              : "no transcript"}
          </span>
        </div>

        {session.mediaUrl && (
          <RecordingPlayback session={session} />
        )}

        {session.transcript && (
          <div className="session-transcript-preview">
            <span>Transcript</span>
            <p>{session.transcript}</p>
          </div>
        )}

        {builtLessons && builtLessons.length > 0 && (
          <div className="session-lessons-built">
            <p className="insight-summary">
              Saved to Personal Trainer → Learn a word:{" "}
              {builtLessons.map((l) => l.text).join(", ")}
            </p>
            <p className="insight-summary muted">
              {builtLessonsTip ||
                "Each lesson carries the teacher’s MediaPipe mouth shapes."}
            </p>
          </div>
        )}

        {error && !analyzing && !buildingLessons && (
          <p className="guide-error">{error}</p>
        )}

        {analyzing || buildingLessons ? (
          <GeneratingSplat
            label={
              buildingLessons
                ? "Building word lessons…"
                : "Brain is reviewing this take…"
            }
            detail={
              buildingLessons
                ? "Gemma is attaching real teacher lip shapes to each word."
                : progress && progress.total > 0
                  ? `Moment ${progress.done} of ${progress.total} — hang tight.`
                  : "Vision + tone pass — usually under half a minute."
            }
          />
        ) : overall ? (
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
          {onSave && (
            <button
              type="button"
              className={saved ? "btn btn-ghost btn-compact" : "btn btn-accent btn-compact"}
              disabled={busy || saved || session.samples.length === 0}
              onClick={onSave}
            >
              {saved ? "Saved locally" : saving ? "Saving…" : "Save take"}
            </button>
          )}
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
        {saveError && <p className="guide-error session-save-error">{saveError}</p>}
      </div>
    </section>
  );
}
