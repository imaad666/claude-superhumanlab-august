import { findBankLesson } from "./bank";
import { heuristicLesson } from "./heuristicLesson";
import { loadCachedLesson, saveCachedLesson } from "./lessonCache";
import { targetsFor } from "./targets";
import type { LessonKind, LessonMemory, LessonStep } from "./types";
import type { VisemeId } from "../visemes";
import { VISEMES } from "../visemes";

const VISEME_SET = new Set(VISEMES.map((v) => v.id));

function normViseme(raw: unknown, fallback: VisemeId = "A"): VisemeId {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  const aliases: Record<string, VisemeId> = {
    AH: "A",
    AA: "A",
    EH: "E",
    EE: "I",
    IH: "I",
    OH: "O",
    OO: "U",
    UH: "A",
    MM: "M",
    B: "M",
    P: "M",
    FF: "F",
    V: "F",
    LL: "L",
    N: "L",
    D: "L",
    T: "L",
    REST: "rest",
  };
  if (VISEME_SET.has(s as VisemeId)) return s as VisemeId;
  if (aliases[s]) return aliases[s];
  if (s[0] && VISEME_SET.has(s[0] as VisemeId)) return s[0] as VisemeId;
  return fallback;
}

type ApiStep = {
  label?: string;
  speak_as?: string;
  speakAs?: string;
  viseme?: string;
  cue?: string;
  hold_ms?: number;
  holdMs?: number;
};

type ApiLesson = {
  text?: string;
  tip?: string;
  steps?: ApiStep[];
  source?: string;
};

function normalizeSteps(raw: ApiStep[]): LessonStep[] {
  return raw.slice(0, 16).map((s, i) => {
    const viseme = normViseme(s.viseme);
    const guide = VISEMES.find((v) => v.id === viseme);
    return {
      id: `s-${i + 1}`,
      label: (s.label || guide?.label || `S${i + 1}`).toString().slice(0, 12),
      speakAs: (s.speak_as || s.speakAs || guide?.label || "?").toString().slice(0, 16),
      viseme,
      cue: (s.cue || guide?.cue || "Match the coach mouth").toString().slice(0, 120),
      targets: targetsFor(viseme),
      holdMs: Math.min(1600, Math.max(400, Number(s.hold_ms ?? s.holdMs ?? 650) || 650)),
    };
  });
}

/**
 * Resolve a lesson: bank → cache → /api/lesson → heuristic.
 */
export async function fetchLesson(
  text: string,
  kind: LessonKind,
): Promise<LessonMemory> {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Type a word or sentence first");

  const bank = findBankLesson(clean, kind);
  if (bank) return bank;

  const cached = loadCachedLesson(clean, kind);
  if (cached) return cached;

  try {
    const res = await fetch("/api/lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, kind }),
    });
    if (res.ok) {
      const data = (await res.json()) as ApiLesson;
      if (data.steps?.length) {
        const lesson: LessonMemory = {
          text: data.text || clean,
          kind,
          tip: data.tip || "Watch each shape, then recreate it.",
          steps: normalizeSteps(data.steps),
          source: data.source === "heuristic" ? "heuristic" : "ollama",
        };
        saveCachedLesson(lesson);
        return lesson;
      }
    }
  } catch {
    /* fall through */
  }

  const fallback = heuristicLesson(clean, kind);
  saveCachedLesson(fallback);
  return fallback;
}
