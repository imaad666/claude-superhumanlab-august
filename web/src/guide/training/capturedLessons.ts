import type { LessonMemory } from "./types";

const KEY = "speaksee.captured.v1";

export function listCapturedLessons(): LessonMemory[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LessonMemory[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l) => l?.text && l.steps?.length);
  } catch {
    return [];
  }
}

export function saveCapturedLessons(lessons: LessonMemory[]) {
  if (!lessons.length) return;
  try {
    const prev = listCapturedLessons();
    const byKey = new Map(
      prev.map((l) => [`${l.kind}:${l.text.toLowerCase()}`, l] as const),
    );
    for (const lesson of lessons) {
      byKey.set(`${lesson.kind}:${lesson.text.toLowerCase()}`, lesson);
    }
    const next = [...byKey.values()].slice(-40);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

export function capturedFor(kind: LessonMemory["kind"]): LessonMemory[] {
  return listCapturedLessons().filter((l) => l.kind === kind);
}
