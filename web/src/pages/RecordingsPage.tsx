import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RecordingPlayback } from "../guide/components/RecordingPlayback";
import { formatDuration } from "../guide/hooks/useSessionRecorder";
import {
  deleteRecording,
  getRecording,
  listRecordings,
  type RecordingSummary,
  type SavedRecording,
} from "../guide/recordings/recordingStore";
import type { GuideSession } from "../guide/sessionTypes";
import "../guide/GuideDashboard.css";

function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  return url;
}

function asSession(take: SavedRecording, mediaUrl: string | null): GuideSession {
  return {
    id: take.id,
    startedAt: take.createdAt - take.durationMs,
    endedAt: take.createdAt,
    durationMs: take.durationMs,
    mediaStartOffsetMs: take.mediaStartOffsetMs,
    samples: take.samples,
    words: take.words,
    transcript: take.transcript,
    transcriptSource: take.transcriptSource,
    mediaUrl,
    mediaBlob: take.mediaBlob,
    mediaMimeType: take.mediaMimeType,
  };
}

export function RecordingsPage() {
  const [takes, setTakes] = useState<RecordingSummary[]>([]);
  const [selected, setSelected] = useState<SavedRecording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTakes(await listRecordings());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not open the local library",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openTake = useCallback(async (id: string) => {
    setOpeningId(id);
    setError(null);
    try {
      const take = await getRecording(id);
      if (!take) throw new Error("That saved take could not be found");
      setSelected(take);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this take");
    } finally {
      setOpeningId(null);
    }
  }, []);

  const removeTake = useCallback(async () => {
    if (!selected) return;
    if (!window.confirm(`Delete “${selected.title}” from this device?`)) return;
    try {
      await deleteRecording(selected.id);
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this take");
    }
  }, [refresh, selected]);

  const mediaUrl = useObjectUrl(selected?.mediaBlob ?? null);
  const session = useMemo(
    () => (selected ? asSession(selected, mediaUrl) : null),
    [mediaUrl, selected],
  );

  return (
    <div className="guide-shell recording-library-shell">
      <header className="guide-topbar">
        <div className="guide-topbar-left">
          <Link className="back" to="/guide/live">
            ← Live Guide
          </Link>
          <h1 className="guide-title">Your takes</h1>
        </div>
        <div className="guide-topbar-actions">
          <Link className="btn btn-accent btn-compact" to="/guide/live">
            Record a take
          </Link>
        </div>
      </header>

      <main className="recording-library-grid">
        <section className="guide-panel recording-library-list">
          <header className="guide-panel-head">
            <div>
              <h2>Saved locally</h2>
              <p className="guide-sub">Video, audio, transcript, and lip tracks stay on this device.</p>
            </div>
            <span className="guide-pill">{takes.length}</span>
          </header>
          <div className="recording-library-body">
            {loading ? (
              <p className="insight-summary muted">Opening your local library…</p>
            ) : takes.length ? (
              <ul className="recording-take-list">
                {takes.map((take) => (
                  <li key={take.id}>
                    <button
                      type="button"
                      className={`recording-take ${selected?.id === take.id ? "is-selected" : ""}`}
                      onClick={() => void openTake(take.id)}
                      disabled={openingId === take.id}
                    >
                      <span className="recording-take-main">
                        <strong>{take.title}</strong>
                        <span>
                          {formatDuration(take.durationMs)} · {take.wordCount} words · {take.lipTrackCount} lip tracks
                        </span>
                      </span>
                      <span className="recording-take-state">
                        {openingId === take.id ? "Opening…" : "Open"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="recording-library-empty">
                <p>No saved takes yet.</p>
                <span>Record someone speaking in Live Guide, then choose Save take.</span>
              </div>
            )}
            {error && <p className="guide-error">{error}</p>}
          </div>
        </section>

        <section className="guide-panel recording-library-detail">
          <header className="guide-panel-head">
            <div>
              <h2>{selected?.title ?? "Review a take"}</h2>
              <p className="guide-sub">
                {selected
                  ? selected.transcriptSource === "live-browser"
                    ? "Transcript was captured while this take was recorded"
                    : "This take has no captured transcript"
                  : "Choose a saved take to replay its video and mouth track."}
              </p>
            </div>
            {selected && <span className="guide-pill">{formatDuration(selected.durationMs)}</span>}
          </header>
          <div className="recording-library-detail-body">
            {session && selected ? (
              <>
                <RecordingPlayback session={session} />
                {selected.transcript && (
                  <div className="session-transcript-preview">
                    <span>Transcript</span>
                    <p>{selected.transcript}</p>
                  </div>
                )}
                <div className="session-actions">
                  {mediaUrl && (
                    <a
                      className="btn btn-ghost btn-compact"
                      href={mediaUrl}
                      download={`${selected.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "take"}.webm`}
                    >
                      Download video
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => void removeTake()}
                  >
                    Delete from device
                  </button>
                </div>
              </>
            ) : (
              <div className="recording-library-empty is-detail">
                <p>Replay a saved recording here.</p>
                <span>The lip model follows the same timeline as the video.</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
