/**
 * SLP Guide data model — the logging + dashboard + assignment loop built on
 * top of the existing Personal Trainer scoring output. No new pipeline.
 *
 * Same data model powers both cases: a learner practising alone (algorithm
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
