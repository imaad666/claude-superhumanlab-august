/**
 * SLP Guide data model — the logging + dashboard + assignment loop built on
 * top of the existing Personal Trainer scoring output. No new pipeline.
 *
 * Same data model powers both cases: a learner practicing alone (algorithm
 * picks the next targets) and a learner with a real SLP (a human picks them).
 * Only who fills the "pick next targets" slot changes.
 */

/** One scored phoneme attempt — produced from a lesson step's match. */
export type Attempt = {
  word: string;
  phoneme: string;
  /** 0–100, derived from the encouraging good/close/try_again match. */
  score: number;
  timestamp: number;
};

/** All attempts made on a given calendar day. */
export type Session = {
  /** YYYY-MM-DD */
  date: string;
  attempts: Attempt[];
};

/** Derived on read from Session[] — never persisted. */
export type PhonemeStats = {
  phoneme: string;
  attempts: number;
  avgScore: number;
  /** Average score per session, oldest → newest. */
  trend: number[];
};

/** The current "practice these next" set. */
export type AssignedSet = {
  words: string[];
  assignedBy: "algorithm" | "SLP";
  dueBy?: string;
};

/**
 * A curriculum item inside a lesson-plan category. "practice" items map to
 * real content in the word/sentence bank and are launchable; "roadmap" items
 * are goals the app doesn't have practice content for yet — shown honestly,
 * not faked (same pattern as the on-device-inference note in the pitch doc).
 */
export type CurriculumItem = {
  label: string;
  status: "practice" | "roadmap";
  /** Bank words/sentences that exercise this goal, when status is "practice". */
  words?: string[];
};

export type CurriculumCategory = {
  id: string;
  title: string;
  items: CurriculumItem[];
};

/** Speechy Musings–style vocabulary buckets for a themed unit. */
export type TherapyVocab = {
  core: string[];
  basicConcepts: string[];
  describing: string[];
  tier2: string[];
  other: string[];
};

export type TherapyVocabKey = keyof TherapyVocab;

/** SLP's free-form session plan for a theme — one active plan, stored locally. */
export type TherapyPlan = {
  topic: string;
  targets: string[];
  schedule: string[];
  activitiesHave: string;
  activitiesNeed: string;
  vocab: TherapyVocab;
  /** Short Gemma blurb after Generate plan. */
  generatedNote?: string;
  updatedAt: number;
};

export const EMPTY_VOCAB: TherapyVocab = {
  core: [],
  basicConcepts: [],
  describing: [],
  tier2: [],
  other: [],
};
