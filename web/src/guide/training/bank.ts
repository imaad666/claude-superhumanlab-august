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
  phoneme?: string,
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
    phoneme,
  };
}

function lesson(
  text: string,
  kind: LessonKind,
  tip: string,
  steps: LessonStep[],
  extra?: Partial<Pick<LessonMemory, "targetPhoneme" | "contrast">>,
): LessonMemory {
  return { text, kind, tip, steps, source: "bank", ...extra };
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

  // --- SLP minimal pairs — real clinical contrasts, one target phoneme each.
  // Contrast 1 · SH vs CH
  lesson(
    "ship",
    "word",
    "Push lips forward for a soft, long “shh”.",
    [
      step("ship-1", "SH", "shh", "U", 600, "Lips forward, soft steady air", "SH"),
      step("ship-2", "IP", "ip", "I", 550, undefined, "IH"),
    ],
    { targetPhoneme: "SH", contrast: "SH vs CH" },
  ),
  lesson(
    "chip",
    "word",
    "Tongue tip first, then a quick “ch” burst.",
    [
      step("chip-1", "CH", "chh", "L", 520, "Tongue tip up, then release", "CH"),
      step("chip-2", "IP", "ip", "I", 550, undefined, "IH"),
    ],
    { targetPhoneme: "CH", contrast: "SH vs CH" },
  ),
  lesson(
    "wash",
    "word",
    "Round “wah”, open, then a long “shh”.",
    [
      step("wash-1", "W", "wah", "U", 500, "Tight round start", "W"),
      step("wash-2", "AH", "ah", "A", 500, undefined, "AH"),
      step("wash-3", "SH", "shh", "U", 600, "Lips forward, soft air", "SH"),
    ],
    { targetPhoneme: "SH", contrast: "SH vs CH" },
  ),
  lesson(
    "watch",
    "word",
    "Round “wah”, open, then a quick “ch”.",
    [
      step("watch-1", "W", "wah", "U", 500, "Tight round start", "W"),
      step("watch-2", "AH", "ah", "A", 500, undefined, "AH"),
      step("watch-3", "CH", "chh", "L", 520, "Tongue tip, then release", "CH"),
    ],
    { targetPhoneme: "CH", contrast: "SH vs CH" },
  ),

  // Contrast 2 · P vs B
  lesson(
    "pat",
    "word",
    "Lips together, quiet pop, then tongue tap.",
    [
      step("pat-1", "P", "p", "M", 450, "Lips together — quiet pop", "P"),
      step("pat-2", "A", "aa", "A", 550, undefined, "AE"),
      step("pat-3", "T", "t", "L", 400, "Tongue tip tap", "T"),
    ],
    { targetPhoneme: "P", contrast: "P vs B" },
  ),
  lesson(
    "bat",
    "word",
    "Lips together with voice, then tongue tap.",
    [
      step("bat-1", "B", "b", "M", 450, "Lips together — add voice", "B"),
      step("bat-2", "A", "aa", "A", 550, undefined, "AE"),
      step("bat-3", "T", "t", "L", 400, "Tongue tip tap", "T"),
    ],
    { targetPhoneme: "B", contrast: "P vs B" },
  ),
  lesson(
    "pig",
    "word",
    "Quiet pop, short “ih”, soft back close.",
    [
      step("pig-1", "P", "p", "M", 450, "Lips together — quiet pop", "P"),
      step("pig-2", "I", "ih", "I", 500, undefined, "IH"),
      step("pig-3", "G", "g", "A", 450, "Soft back close", "G"),
    ],
    { targetPhoneme: "P", contrast: "P vs B" },
  ),
  lesson(
    "big",
    "word",
    "Voiced start, short “ih”, soft back close.",
    [
      step("big-1", "B", "b", "M", 450, "Lips together — add voice", "B"),
      step("big-2", "I", "ih", "I", 500, undefined, "IH"),
      step("big-3", "G", "g", "A", 450, "Soft back close", "G"),
    ],
    { targetPhoneme: "B", contrast: "P vs B" },
  ),

  // Contrast 3 · TH vs F
  lesson(
    "thin",
    "word",
    "Tongue near your teeth, soft air for “th”.",
    [
      step("thin-1", "TH", "th", "F", 550, "Tongue near teeth, soft air", "TH"),
      step("thin-2", "IN", "in", "I", 550, undefined, "IH"),
    ],
    { targetPhoneme: "TH", contrast: "TH vs F" },
  ),
  lesson(
    "fin",
    "word",
    "Upper teeth on lower lip for “f”.",
    [
      step("fin-1", "F", "ff", "F", 500, "Teeth lightly on lip", "F"),
      step("fin-2", "IN", "in", "I", 550, undefined, "IH"),
    ],
    { targetPhoneme: "F", contrast: "TH vs F" },
  ),
  lesson(
    "three",
    "word",
    "Soft “th”, small round “r”, wide “ee”.",
    [
      step("three-1", "TH", "th", "F", 550, "Tongue near teeth, soft air", "TH"),
      step("three-2", "R", "r", "U", 450, "Round the lips a little", "R"),
      step("three-3", "EE", "ee", "I", 600, "Wide flat smile", "EE"),
    ],
    { targetPhoneme: "TH", contrast: "TH vs F" },
  ),
  lesson(
    "free",
    "word",
    "Teeth on lip, small round “r”, wide “ee”.",
    [
      step("free-1", "F", "ff", "F", 500, "Teeth lightly on lip", "F"),
      step("free-2", "R", "r", "U", 450, "Round the lips a little", "R"),
      step("free-3", "EE", "ee", "I", 600, "Wide flat smile", "EE"),
    ],
    { targetPhoneme: "F", contrast: "TH vs F" },
  ),

  // Contrast 4 · S vs SH
  lesson(
    "sock",
    "word",
    "Wide thin “sss”, open “ah”, soft close.",
    [
      step("sock-1", "S", "sss", "I", 550, "Lips wide, thin stream of air", "S"),
      step("sock-2", "O", "ah", "A", 500, undefined, "AH"),
      step("sock-3", "CK", "k", "A", 400, "Soft back close", "K"),
    ],
    { targetPhoneme: "S", contrast: "S vs SH" },
  ),
  lesson(
    "shock",
    "word",
    "Lips forward “shh”, open “ah”, soft close.",
    [
      step("shock-1", "SH", "shh", "U", 600, "Lips forward, soft air", "SH"),
      step("shock-2", "O", "ah", "A", 500, undefined, "AH"),
      step("shock-3", "CK", "k", "A", 400, "Soft back close", "K"),
    ],
    { targetPhoneme: "SH", contrast: "S vs SH" },
  ),
  lesson(
    "sue",
    "word",
    "Wide thin “sss” into a tight round “oo”.",
    [
      step("sue-1", "S", "sss", "I", 550, "Lips wide, thin stream of air", "S"),
      step("sue-2", "OO", "oo", "U", 700, "Tight round, push forward", "OO"),
    ],
    { targetPhoneme: "S", contrast: "S vs SH" },
  ),
  lesson(
    "shoe",
    "word",
    "Lips forward “shh” into a tight round “oo”.",
    [
      step("shoe-1", "SH", "shh", "U", 600, "Lips forward, soft air", "SH"),
      step("shoe-2", "OO", "oo", "U", 700, "Tight round, push forward", "OO"),
    ],
    { targetPhoneme: "SH", contrast: "S vs SH" },
  ),
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

/**
 * Words the SLP loop can assign — the minimal-pair set, each tagged with the
 * single consonant contrast it trains. Drives algorithm auto-assignment and
 * the SLP's manual picker.
 */
export function assignableWords(): {
  text: string;
  targetPhoneme: string;
  contrast: string;
}[] {
  return WORD_BANK.filter((l) => l.targetPhoneme).map((l) => ({
    text: l.text,
    targetPhoneme: l.targetPhoneme as string,
    contrast: l.contrast ?? "",
  }));
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
