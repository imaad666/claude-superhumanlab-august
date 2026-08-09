import { assignableWords } from "../guide/training/bank";
import type { AssignedSet, PhonemeStats, Session } from "./types";

/**
 * All derived analytics for the dashboard. Computed on read from Session[] —
 * PhonemeStats are never persisted.
 */

function byDate(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date));
}

/** Per-phoneme accuracy + a per-session trend, oldest → newest. */
export function computePhonemeStats(sessions: Session[]): PhonemeStats[] {
  const stats = new Map<
    string,
    { total: number; count: number; trend: number[] }
  >();

  for (const session of byDate(sessions)) {
    const perPhoneme = new Map<string, number[]>();
    for (const attempt of session.attempts) {
      const arr = perPhoneme.get(attempt.phoneme) ?? [];
      arr.push(attempt.score);
      perPhoneme.set(attempt.phoneme, arr);
    }
    for (const [phoneme, scores] of perPhoneme) {
      const entry = stats.get(phoneme) ?? { total: 0, count: 0, trend: [] };
      const sum = scores.reduce((s, n) => s + n, 0);
      entry.total += sum;
      entry.count += scores.length;
      entry.trend.push(Math.round(sum / scores.length));
      stats.set(phoneme, entry);
    }
  }

  return [...stats.entries()].map(([phoneme, e]) => ({
    phoneme,
    attempts: e.count,
    avgScore: e.count ? Math.round(e.total / e.count) : 0,
    trend: e.trend,
  }));
}

/** Overall accuracy per session (all phonemes), oldest → newest. */
export function sessionTrend(
  sessions: Session[],
): { date: string; avg: number; attempts: number }[] {
  return byDate(sessions).map((s) => {
    const avg = s.attempts.length
      ? Math.round(
          s.attempts.reduce((x, a) => x + a.score, 0) / s.attempts.length,
        )
      : 0;
    return { date: s.date, avg, attempts: s.attempts.length };
  });
}

function dedupe(words: string[]): string[] {
  return [...new Set(words)];
}

/**
 * The "no SLP attached" branch: pick the 1–2 lowest-avgScore phonemes we have
 * practice words for, and pull matching words from the bank. Simple rule, no ML.
 * With too little data yet, seed a couple of starter contrasts instead.
 */
export function autoAssign(sessions: Session[], maxPhonemes = 2): AssignedSet {
  const pool = assignableWords();
  const assignable = new Set(pool.map((w) => w.targetPhoneme));
  const stats = computePhonemeStats(sessions);

  const ranked = stats
    .filter((s) => assignable.has(s.phoneme) && s.attempts > 0)
    .sort((a, b) => a.avgScore - b.avgScore);

  let words: string[] = [];
  if (ranked.length === 0) {
    // Cold start — offer the first two contrasts as a gentle on-ramp.
    words = pool.slice(0, 4).map((w) => w.text);
  } else {
    for (const stat of ranked.slice(0, maxPhonemes)) {
      const matches = pool
        .filter((w) => w.targetPhoneme === stat.phoneme)
        .map((w) => w.text)
        .slice(0, 2);
      words.push(...matches);
    }
  }

  return { words: dedupe(words), assignedBy: "algorithm" };
}
