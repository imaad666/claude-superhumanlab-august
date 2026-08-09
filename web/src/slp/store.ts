import { scoreQuality } from "../guide/training/scoreStep";
import type { LessonAttemptResult, LessonMemory } from "../guide/training/types";
import type { AssignedSet, Attempt, Session, TherapyPlan, TherapyVocab } from "./types";
import { EMPTY_VOCAB } from "./types";

/**
 * localStorage-backed store for the SLP Guide. No backend / auth for the demo —
 * Session[] and AssignedSet live in the browser; PhonemeStats are computed on
 * read (see stats.ts) and never stored.
 */

const SESSIONS_KEY = "slp.sessions.v1";
const ASSIGNED_KEY = "slp.assigned.v1";
const PLAN_KEY_V1 = "slp.plan.v1";
const PLAN_KEY = "slp.plan.v2";

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

function normalizeVocab(raw: unknown): TherapyVocab {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<TherapyVocab>;
  return {
    core: Array.isArray(v.core) ? v.core.map(String) : [],
    basicConcepts: Array.isArray(v.basicConcepts) ? v.basicConcepts.map(String) : [],
    describing: Array.isArray(v.describing) ? v.describing.map(String) : [],
    tier2: Array.isArray(v.tier2) ? v.tier2.map(String) : [],
    other: Array.isArray(v.other) ? v.other.map(String) : [],
  };
}

/** Coerce any stored plan blob into the current TherapyPlan shape. */
export function normalizePlan(raw: unknown): TherapyPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  return {
    topic: typeof p.topic === "string" ? p.topic : "",
    targets: Array.isArray(p.targets) ? p.targets.map(String) : [],
    schedule: Array.isArray(p.schedule) ? p.schedule.map(String) : [],
    activitiesHave:
      typeof p.activitiesHave === "string" ? p.activitiesHave : "",
    activitiesNeed:
      typeof p.activitiesNeed === "string" ? p.activitiesNeed : "",
    vocab: normalizeVocab(p.vocab),
    generatedNote:
      typeof p.generatedNote === "string" ? p.generatedNote : undefined,
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
  };
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
  const v2 = normalizePlan(
    safeParse<unknown>(localStorage.getItem(PLAN_KEY), null),
  );
  if (v2) return v2;

  const v1 = normalizePlan(
    safeParse<unknown>(localStorage.getItem(PLAN_KEY_V1), null),
  );
  if (v1) {
    localStorage.setItem(PLAN_KEY, JSON.stringify(v1));
    localStorage.removeItem(PLAN_KEY_V1);
    return v1;
  }
  return null;
}

export function setPlan(plan: TherapyPlan | null) {
  if (!hasStorage()) return;
  if (plan) {
    const next = normalizePlan(plan) ?? {
      ...plan,
      vocab: plan.vocab ?? { ...EMPTY_VOCAB },
    };
    localStorage.setItem(PLAN_KEY, JSON.stringify(next));
    localStorage.removeItem(PLAN_KEY_V1);
  } else {
    localStorage.removeItem(PLAN_KEY);
    localStorage.removeItem(PLAN_KEY_V1);
  }
  emitUpdate();
}

/** Demo helper — wipe all progress and any SLP override. */
export function resetSlp() {
  if (!hasStorage()) return;
  localStorage.removeItem(SESSIONS_KEY);
  localStorage.removeItem(ASSIGNED_KEY);
  localStorage.removeItem(PLAN_KEY);
  localStorage.removeItem(PLAN_KEY_V1);
  emitUpdate();
}
