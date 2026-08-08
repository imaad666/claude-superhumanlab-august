import { formatDuration } from "../hooks/useSessionRecorder";
import type { SessionAnalysis } from "../sessionTypes";
import type { GuideSession } from "../sessionTypes";
import { TONE_LABELS } from "../types";

type SessionReviewPanelProps = {
  session: GuideSession | null;
  analysis: SessionAnalysis | null;
  analyzing: boolean;
  recording?: boolean;
  elapsedMs?: number;
  sampleCount?: number;
  progress: { done: number; total: number } | null;
  error: string | null;
  onAnalyze: () => void;
  onDiscard: () => void;
};

export function SessionReviewPanel({
  session,
  analysis,
  analyzing,
  recording = false,
  elapsedMs = 0,
  sampleCount = 0,
  progress,
  error,
  onAnalyze,
  onDiscard,
}: SessionReviewPanelProps) {
  if (recording) {
    return (
      <section className="guide-panel session-panel">
        <header className="guide-panel-head">
          <h2>Session</h2>
          <span className="guide-pill">Recording</span>
        </header>
        <div className="session-body">
          <p className="insight-summary">
            Capturing lips, voice, and transcript —{" "}
            {formatDuration(elapsedMs)} · {sampleCount} samples.
          </p>
          <p className="insight-summary muted">
            Stop when they finish. Then Analyze runs the model on the clip.
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
            Record a clip of someone speaking. The vision model runs after you
            stop — not live.
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
          {analyzing
            ? progress
              ? `Analyzing ${progress.done}/${progress.total}`
              : "Analyzing…"
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
        </div>

        {session.mediaUrl && (
          <video
            className="session-playback"
            src={session.mediaUrl}
            controls
            playsInline
          />
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

            {analysis && analysis.segments.length > 1 && (
              <ul className="session-segments" aria-label="Timeline">
                {analysis.segments.map((seg) => (
                  <li key={seg.t} className="session-segment">
                    <span className="session-segment-t">
                      {formatDuration(seg.t)}
                    </span>
                    <span className={`insight-chip tone-${seg.insight.tone}`}>
                      {TONE_LABELS[seg.insight.tone] ?? seg.insight.tone}
                    </span>
                    <span className="session-segment-mood">
                      {seg.insight.mood} · {seg.insight.intention}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="insight-summary muted">
            {error ??
              "Press Analyze to run Gemma on this recording (lip crops + metrics)."}
          </p>
        )}

        <div className="session-actions">
          {!analysis && (
            <button
              type="button"
              className="btn btn-accent btn-compact"
              disabled={analyzing || session.samples.length === 0}
              onClick={onAnalyze}
            >
              {analyzing ? "Analyzing…" : "Analyze session"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            disabled={analyzing}
            onClick={onDiscard}
          >
            Discard
          </button>
        </div>
      </div>
    </section>
  );
}
