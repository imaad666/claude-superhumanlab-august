import type { ExpressionFeatures, LipFeatures } from "./features";
import type { BrainInsight } from "./brainHeuristic";
import type { PackedLandmarks } from "./landmarksPack";
import type { TranscriptWord } from "./types";

/** One moment captured while Live Guide is recording. */
export type SessionSample = {
  t: number;
  lips: LipFeatures;
  volume: number;
  pitchHint: number;
  expression: ExpressionFeatures;
  lipImage: string | null;
  /** Compact MediaPipe lip vectors from the teacher. */
  landmarks: PackedLandmarks | null;
  transcript: string;
  recentWords: string[];
};

export type GuideSession = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  /** Offset between the session clock and the first frame in the WebM file. */
  mediaStartOffsetMs: number;
  samples: SessionSample[];
  words: TranscriptWord[];
  /** Text captured while the take was being recorded. */
  transcript: string;
  /** Browser live speech is useful, but not a post-recording ASR pass. */
  transcriptSource: "live-browser" | "none";
  /** Object URL for immediate in-session A/V playback. */
  mediaUrl: string | null;
  /** The real locally captured A/V data, retained for saving to the take library. */
  mediaBlob: Blob | null;
  mediaMimeType: string | null;
};

export type SessionSegment = {
  t: number;
  insight: BrainInsight;
};

export type SessionAnalysis = {
  overall: BrainInsight;
  segments: SessionSegment[];
  sampleCount: number;
  analyzedCount: number;
};
