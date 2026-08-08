import { VISEMES, visemeFromText, type VisemeId } from "../visemes";
import { targetsFor } from "./targets";
import type { LessonKind, LessonMemory, LessonStep } from "./types";

const DIGRAPHS: Array<[string, string, VisemeId]> = [
  ["oo", "oo", "U"],
  ["ee", "ee", "I"],
  ["th", "th", "F"],
  ["ch", "ch", "I"],
  ["sh", "sh", "U"],
  ["wh", "wh", "U"],
  ["ph", "ff", "F"],
  ["ng", "ng", "A"],
  ["ow", "oww", "O"],
  ["ou", "ow", "O"],
  ["oy", "oy", "O"],
  ["oi", "oy", "O"],
  ["ay", "ay", "E"],
  ["ai", "ay", "E"],
  ["ea", "ee", "I"],
  ["oa", "oh", "O"],
];

function chunkWord(word: string): Array<{ speakAs: string; viseme: VisemeId; label: string }> {
  const w = word.toLowerCase().replace(/[^a-z']/g, "");
  const out: Array<{ speakAs: string; viseme: VisemeId; label: string }> = [];
  let i = 0;
  while (i < w.length) {
    let matched = false;
    for (const [dig, speakAs, viseme] of DIGRAPHS) {
      if (w.slice(i, i + dig.length) === dig) {
        out.push({ speakAs, viseme, label: dig.toUpperCase() });
        i += dig.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const ch = w[i];
    const viseme = visemeFromText(ch);
    const guide = VISEMES.find((v) => v.id === viseme);
    out.push({
      speakAs: guide?.label.toLowerCase() ?? ch,
      viseme,
      label: ch.toUpperCase(),
    });
    i += 1;
  }
  return out.length ? out : [{ speakAs: word, viseme: "A", label: word.toUpperCase() }];
}

/** Offline grapheme → lesson memory when Ollama is unavailable. */
export function heuristicLesson(text: string, kind: LessonKind): LessonMemory {
  const clean = text.trim().replace(/\s+/g, " ");
  const words = clean.split(" ").filter(Boolean);
  const steps: LessonStep[] = [];
  let n = 0;
  for (const word of words) {
    for (const part of chunkWord(word)) {
      n += 1;
      const guide = VISEMES.find((v) => v.id === part.viseme);
      steps.push({
        id: `h-${n}`,
        label: part.label,
        speakAs: part.speakAs,
        viseme: part.viseme,
        cue: guide?.cue ?? "Match the coach mouth",
        targets: targetsFor(part.viseme),
        holdMs: kind === "sentence" ? 550 : 650,
      });
    }
  }
  return {
    text: clean,
    kind,
    tip: "Watch each mouth shape, then copy it — slow is okay.",
    steps: steps.slice(0, 16),
    source: "heuristic",
  };
}
