import type { ToneKind } from "../types";
import type { VisemeId } from "../visemes";

export type LessonKind = "word" | "sentence";

export type TrainerMode = "free" | "word" | "sentence";

export type LessonPhase = "pick" | "watch" | "recreate" | "result";

export type StepTargets = {
  openness: number;
  width: number;
  roundness: number;
  volume?: number;
  tone?: ToneKind;
};

export type LessonStep = {
  id: string;
  label: string;
  /** How to say it out loud for a Deaf learner, e.g. "oww" */
  speakAs: string;
  viseme: VisemeId;
  cue: string;
  targets: StepTargets;
  holdMs: number;
  /** Readable phoneme tag for SLP progress logging, e.g. "SH", "TH", "IH". */
  phoneme?: string;
};

export type LessonMemory = {
  text: string;
  kind: LessonKind;
  steps: LessonStep[];
  tip: string;
  source?: "bank" | "ollama" | "heuristic";
  /** The consonant contrast this word trains, e.g. "SH" (for SH vs CH). */
  targetPhoneme?: string;
  /** Human label for the minimal-pair contrast, e.g. "SH vs CH". */
  contrast?: string;
};

export type StepScore = {
  stepId: string;
  match: "good" | "close" | "try_again";
  cue: string;
  opennessErr: number;
  widthErr: number;
  roundnessErr: number;
};

export type LessonAttemptResult = {
  overall: "good" | "close" | "try_again";
  scores: StepScore[];
  summary: string;
};
