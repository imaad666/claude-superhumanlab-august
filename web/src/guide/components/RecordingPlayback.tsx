import { useEffect, useMemo, useRef, useState } from "react";
import { unpackLandmarks } from "../landmarksPack";
import type { GuideSession, SessionSample } from "../sessionTypes";
import { formatDuration } from "../hooks/useSessionRecorder";
import { LipMesh3D } from "./LipMesh3D";

type RecordingPlaybackProps = {
  session: GuideSession;
};

function sampleAt(
  samples: SessionSample[],
  sessionTimeMs: number,
): SessionSample | null {
  if (!samples.length) return null;
  let closest = samples[0];
  let distance = Math.abs(samples[0].t - sessionTimeMs);
  for (const sample of samples.slice(1)) {
    const nextDistance = Math.abs(sample.t - sessionTimeMs);
    if (nextDistance < distance) {
      closest = sample;
      distance = nextDistance;
    }
  }
  return closest;
}

/**
 * One timeline drives the recorded video, captured live transcript, and the
 * nearest MediaPipe lip frame. This is intentionally local-only: no upload is
 * needed to replay a take.
 */
export function RecordingPlayback({ session }: RecordingPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackMs, setPlaybackMs] = useState(0);

  useEffect(() => {
    setPlaybackMs(0);
  }, [session.id]);

  const sessionTimeMs = playbackMs + session.mediaStartOffsetMs;
  const sample = useMemo(
    () => sampleAt(session.samples, sessionTimeMs),
    [session.samples, sessionTimeMs],
  );
  const landmarks = useMemo(
    () => unpackLandmarks(sample?.landmarks),
    [sample?.landmarks],
  );
  const timedWords = session.words.filter(
    (word): word is typeof word & { t: number } => typeof word.t === "number",
  );
  const activeWordIndex = timedWords.reduce(
    (current, word, index) => (word.t <= sessionTimeMs ? index : current),
    -1,
  );

  const seekToSessionTime = (timeMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    const videoTimeMs = Math.max(0, timeMs - session.mediaStartOffsetMs);
    video.currentTime = videoTimeMs / 1000;
    setPlaybackMs(videoTimeMs);
  };

  return (
    <div className="recording-playback">
      <div className="recording-playback-grid">
        <div className="recording-video-wrap">
          {session.mediaUrl ? (
            <video
              ref={videoRef}
              className="session-playback"
              src={session.mediaUrl}
              controls
              playsInline
              onLoadedMetadata={(event) => {
                setPlaybackMs(event.currentTarget.currentTime * 1000);
              }}
              onTimeUpdate={(event) => {
                setPlaybackMs(event.currentTarget.currentTime * 1000);
              }}
            />
          ) : (
            <div className="recording-no-video">
              Video playback was not available for this take.
            </div>
          )}
          <span className="recording-playback-time" aria-live="polite">
            {formatDuration(playbackMs)}
          </span>
        </div>

        <section className="recording-lip-sync" aria-label="Recorded lip movement">
          <div className="recording-lip-sync-head">
            <span>Recorded lips</span>
            <span>{sample ? `${Math.round(sample.t / 100) / 10}s` : "—"}</span>
          </div>
          <LipMesh3D
            landmarks={landmarks}
            tracking={Boolean(landmarks?.length)}
            emptyHint="Move through the clip to see the recorded mouth track."
          />
          {sample ? (
            <p className="recording-lip-metrics">
              open {Math.round(sample.lips.openness * 100)}% · wide{" "}
              {Math.round(sample.lips.width * 100)}% · round{" "}
              {Math.round(sample.lips.roundness * 100)}%
            </p>
          ) : null}
        </section>
      </div>

      {timedWords.length > 0 && (
        <div className="recording-word-track" aria-label="Words captured during recording">
          <p>Words heard during the take</p>
          <div className="recording-word-list">
            {timedWords.map((word, index) => (
              <button
                key={word.id}
                type="button"
                className={`recording-word ${index === activeWordIndex ? "is-current" : ""}`}
                onClick={() => seekToSessionTime(word.t)}
              >
                {word.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
