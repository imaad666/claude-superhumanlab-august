import type { LessonKind, LessonMemory } from "./types";

const PREFIX = "speaksee.lesson.v1:";

function key(text: string, kind: LessonKind) {
  return `${PREFIX}${kind}:${text.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export function loadCachedLesson(
  text: string,
  kind: LessonKind,
): LessonMemory | null {
  try {
    const raw = localStorage.getItem(key(text, kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LessonMemory;
    if (!parsed?.steps?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedLesson(lesson: LessonMemory) {
  try {
    localStorage.setItem(key(lesson.text, lesson.kind), JSON.stringify(lesson));
  } catch {
    /* quota / private mode */
  }
}
