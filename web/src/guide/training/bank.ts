import { VISEMES, type VisemeId } from "../visemes";
import { targetsFor } from "./targets";
import type { LessonKind, LessonMemory, LessonStep } from "./types";

function step(
  id: string,
  label: string,
  speakAs: string,
  viseme: VisemeId,
  holdMs = 700,
  cueOverride?: string,
): LessonStep {
  const guide = VISEMES.find((v) => v.id === viseme);
  return {
    id,
    label,
    speakAs,
    viseme,
    cue: cueOverride ?? guide?.cue ?? "Match the coach mouth",
    targets: targetsFor(viseme),
    holdMs,
  };
}

function lesson(
  text: string,
  kind: LessonKind,
  tip: string,
  steps: LessonStep[],
): LessonMemory {
  return { text, kind, tip, steps, source: "bank" };
}

export const WORD_BANK: LessonMemory[] = [
  lesson("dog", "word", "Three beats: tongue tip, round lips, then a soft stop.", [
    step("dog-1", "D", "dh", "L", 650, "Tongue tip up — start of “dog”"),
    step("dog-2", "O", "oww", "O", 800, "Round lips for “oww”"),
    step("dog-3", "G", "ghh", "A", 550, "Brief open, then gentle close"),
  ]),
  lesson("hello", "word", "Smile wide on “heh”, round a little on “loh”.", [
    step("hello-1", "H", "heh", "E", 600, "Soft breath, wide smile"),
    step("hello-2", "E", "eh", "E", 550),
    step("hello-3", "L", "ll", "L", 500),
    step("hello-4", "O", "oh", "O", 750, "Round for the ending"),
  ]),
  lesson("water", "word", "Round “wah”, tap tongue for “t”, soft “er”.", [
    step("water-1", "W", "wah", "U", 650, "Tight round start"),
    step("water-2", "A", "ah", "A", 550),
    step("water-3", "T", "t", "L", 450, "Tongue tip tap"),
    step("water-4", "ER", "er", "E", 700, "Relaxed wide finish"),
  ]),
  lesson("mom", "word", "Lips together — open — together again.", [
    step("mom-1", "M", "mm", "M", 600),
    step("mom-2", "O", "ah", "A", 700),
    step("mom-3", "M", "mm", "M", 650),
  ]),
  lesson("food", "word", "Teeth on lip, then tight round “oo”.", [
    step("food-1", "F", "ff", "F", 550),
    step("food-2", "OO", "oo", "U", 850, "Push lips forward"),
    step("food-3", "D", "d", "L", 500),
  ]),
  lesson("please", "word", "Lips together, wide “ee”, soft “z”.", [
    step("please-1", "P", "p", "M", 450),
    step("please-2", "L", "ll", "L", 500),
    step("please-3", "EE", "eez", "I", 800, "Wide flat smile"),
  ]),
  lesson("thank", "word", "Tongue between teeth feel, then open “ank”.", [
    step("thank-1", "TH", "th", "F", 550, "Soft air — tongue near teeth"),
    step("thank-2", "A", "aa", "A", 600),
    step("thank-3", "NK", "nk", "A", 550, "Gentle close at the end"),
  ]),
  lesson("yes", "word", "Wide smile into a soft “s”.", [
    step("yes-1", "Y", "yeh", "E", 550),
    step("yes-2", "E", "eh", "E", 500),
    step("yes-3", "S", "ss", "I", 650, "Keep lips wide, soft air"),
  ]),
  lesson("no", "word", "Tongue tip then round “oh”.", [
    step("no-1", "N", "nn", "L", 500),
    step("no-2", "O", "oh", "O", 800),
  ]),
  lesson("love", "word", "Tongue tip, round “uh”, teeth on lip.", [
    step("love-1", "L", "ll", "L", 550),
    step("love-2", "U", "uh", "A", 600),
    step("love-3", "V", "vv", "F", 650),
  ]),
  lesson("happy", "word", "Open “ha”, lips together, wide “ee”.", [
    step("happy-1", "H", "ha", "A", 550),
    step("happy-2", "P", "p", "M", 450),
    step("happy-3", "Y", "ee", "I", 700),
  ]),
  lesson("friend", "word", "Teeth on lip, then wide smile.", [
    step("friend-1", "F", "ff", "F", 500),
    step("friend-2", "R", "reh", "E", 550),
    step("friend-3", "E", "eh", "E", 500),
    step("friend-4", "ND", "nd", "L", 600),
  ]),
];

export const SENTENCE_BANK: LessonMemory[] = [
  lesson(
    "thank you",
    "sentence",
    "Two words: soft “th” then round “you”.",
    [
      step("ty-1", "TH", "th", "F", 500),
      step("ty-2", "ANK", "ank", "A", 550),
      step("ty-3", "Y", "y", "I", 450),
      step("ty-4", "OO", "oo", "U", 750),
    ],
  ),
  lesson(
    "good morning",
    "sentence",
    "Round “good”, then open “mor-ning”.",
    [
      step("gm-1", "G", "g", "A", 450),
      step("gm-2", "OO", "oo", "U", 550),
      step("gm-3", "D", "d", "L", 400),
      step("gm-4", "M", "mor", "M", 500),
      step("gm-5", "OR", "or", "O", 550),
      step("gm-6", "NING", "ning", "I", 700),
    ],
  ),
  lesson(
    "how are you",
    "sentence",
    "Round “how”, open “are”, round “you”.",
    [
      step("hay-1", "H", "h", "A", 400),
      step("hay-2", "OW", "ow", "O", 600),
      step("hay-3", "ARE", "are", "A", 550),
      step("hay-4", "Y", "y", "I", 400),
      step("hay-5", "OO", "oo", "U", 700),
    ],
  ),
  lesson(
    "I am happy",
    "sentence",
    "Wide “I”, lips for “am”, smile “happy”.",
    [
      step("iah-1", "I", "eye", "A", 550),
      step("iah-2", "AM", "am", "M", 500),
      step("iah-3", "HA", "ha", "A", 500),
      step("iah-4", "P", "p", "M", 400),
      step("iah-5", "Y", "ee", "I", 650),
    ],
  ),
];

export function bankFor(kind: LessonKind): LessonMemory[] {
  return kind === "word" ? WORD_BANK : SENTENCE_BANK;
}

export function findBankLesson(
  text: string,
  kind?: LessonKind,
): LessonMemory | null {
  const key = text.trim().toLowerCase().replace(/\s+/g, " ");
  const pools =
    kind === "word"
      ? WORD_BANK
      : kind === "sentence"
        ? SENTENCE_BANK
        : [...WORD_BANK, ...SENTENCE_BANK];
  return pools.find((l) => l.text.toLowerCase() === key) ?? null;
}
