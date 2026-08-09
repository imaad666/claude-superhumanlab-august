import { scoreQuality } from "../guide/training/scoreStep";
import type { LessonAttemptResult, LessonMemory } from "../guide/training/types";
import type { AssignedSet, Attempt, Session, TherapyPlan } from "./types";

/**
 * localStorage-backed store for the SLP Guide. No backend / auth for the demo —
 * Session[] and AssignedSet live in the browser; PhonemeStats are computed on
 * read (see stats.ts) and never stored.
 */

const SESSIONS_KEY = "slp.sessions.v1";
const ASSIGNED_KEY = "slp.assigned.v1";
const PLAN_KEY = "slp.plan.v1";

/** Fired whenever sessions or the assigned set change, so open views refresh. */
export const SLP_EVENT = "slp:updated";

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function emitUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SLP_EVENT));
  }
}

export function getSessions(): Session[] {
  if (!hasStorage()) return [];
  return safeParse<Session[]>(localStorage.getItem(SESSIONS_KEY), []);
}

function saveSessions(sessions: Session[]) {
  if (!hasStorage()) return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

/** Append attempts into today's session (creating it if needed). */
export function appendAttempts(attempts: Attempt[]) {
  if (!attempts.length || !hasStorage()) return;
  const sessions = getSessions();
  const date = todayKey();
  let session = sessions.find((s) => s.date === date);
  if (!session) {
    session = { date, attempts: [] };
    sessions.push(session);
  }
  session.attempts.push(...attempts);
  saveSessions(sessions);
  emitUpdate();
}

/**
 * Bridge from the existing scoring output to the SLP data model: one Attempt
 * per lesson step (each step ≈ one phoneme). This is the single hook point —
 * it reads what the trainer already produced and touches nothing upstream.
 */
export function logLessonAttempt(
  lesson: LessonMemory,
  result: LessonAttemptResult,
) {
  const now = Date.now();
  const attempts: Attempt[] = result.scores.map((score, i) => {
    const step = lesson.steps[i];
    const phoneme =
      step?.phoneme ?? (step?.label ? step.label.toUpperCase() : "?");
    return {
      word: lesson.text,
      phoneme,
      score: Math.round(scoreQuality(score.match) * 100),
      // +i keeps timestamps stable-ordered within a single attempt.
      timestamp: now + i,
    };
  });
  appendAttempts(attempts);
}

export function getAssignedSet(): AssignedSet | null {
  if (!hasStorage()) return null;
  return safeParse<AssignedSet | null>(
    localStorage.getItem(ASSIGNED_KEY),
    null,
  );
}

export function setAssignedSet(set: AssignedSet | null) {
  if (!hasStorage()) return;
  if (set) localStorage.setItem(ASSIGNED_KEY, JSON.stringify(set));
  else localStorage.removeItem(ASSIGNED_KEY);
  emitUpdate();
}

/** The SLP's current session plan — one active plan, no per-learner records yet. */
export function getPlan(): TherapyPlan | null {
  if (!hasStorage()) return null;
  return safeParse<TherapyPlan | null>(localStorage.getItem(PLAN_KEY), null);
}

export function setPlan(plan: TherapyPlan | null) {
  if (!hasStorage()) return;
  if (plan) localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  else localStorage.removeItem(PLAN_KEY);
  emitUpdate();
}

/** Demo helper — wipe all progress and any SLP override. */
export function resetSlp() {
  if (!hasStorage()) return;
  localStorage.removeItem(SESSIONS_KEY);
  localStorage.removeItem(ASSIGNED_KEY);
  localStorage.removeItem(PLAN_KEY);
  emitUpdate();
}
