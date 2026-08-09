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
  samples: SessionSample[];
  words: TranscriptWord[];
  /** Object URL for recorded A/V (optional playback). */
  mediaUrl: string | null;
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
