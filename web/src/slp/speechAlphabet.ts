import { assignableWords } from "../guide/training/bank";

/**
 * Therapy-friendly Speech Alphabet cells — IPA-ish symbols + orthography,
 * tied to bank phonemes when we have practice words. Roadmap cells are shown
 * muted so the chart still reads like an SLP ABC wall without faking content.
 */

export type SpeechSoundCell = {
  id: string;
  /** IPA-ish display, e.g. ʃ */
  ipa: string;
  /** Orthography / clinical tag, e.g. SH */
  label: string;
  /** Manner row for the chart layout */
  manner: string;
  /** Place column hint */
  place: string;
  status: "practice" | "roadmap";
  /** Bank phoneme tags this cell covers (e.g. ["SH"]) */
  phonemes: string[];
};

/** Pulmonic consonant grid — English therapy subset + a few roadmap neighbors. */
export const SPEECH_ALPHABET: SpeechSoundCell[] = [
  {
    id: "p",
    ipa: "p",
    label: "P",
    manner: "Plosive",
    place: "Bilabial",
    status: "practice",
    phonemes: ["P"],
  },
  {
    id: "b",
    ipa: "b",
    label: "B",
    manner: "Plosive",
    place: "Bilabial",
    status: "practice",
    phonemes: ["B"],
  },
  {
    id: "t",
    ipa: "t",
    label: "T",
    manner: "Plosive",
    place: "Alveolar",
    status: "roadmap",
    phonemes: [],
  },
  {
    id: "d",
    ipa: "d",
    label: "D",
    manner: "Plosive",
    place: "Alveolar",
    status: "roadmap",
    phonemes: [],
  },
  {
    id: "k",
    ipa: "k",
    label: "K",
    manner: "Plosive",
    place: "Velar",
    status: "roadmap",
    phonemes: [],
  },
  {
    id: "g",
    ipa: "ɡ",
    label: "G",
    manner: "Plosive",
    place: "Velar",
    status: "roadmap",
    phonemes: [],
  },
  {
    id: "f",
    ipa: "f",
    label: "F",
    manner: "Fricative",
    place: "Labiodental",
    status: "practice",
    phonemes: ["F"],
  },
  {
    id: "th",
    ipa: "θ",
    label: "TH",
    manner: "Fricative",
    place: "Dental",
    status: "practice",
    phonemes: ["TH"],
  },
  {
    id: "s",
    ipa: "s",
    label: "S",
    manner: "Fricative",
    place: "Alveolar",
    status: "practice",
    phonemes: ["S"],
  },
  {
    id: "sh",
    ipa: "ʃ",
    label: "SH",
    manner: "Fricative",
    place: "Postalveolar",
    status: "practice",
    phonemes: ["SH"],
  },
  {
    id: "ch",
    ipa: "tʃ",
    label: "CH",
    manner: "Affricate",
    place: "Postalveolar",
    status: "practice",
    phonemes: ["CH"],
  },
  {
    id: "z",
    ipa: "z",
    label: "Z",
    manner: "Fricative",
    place: "Alveolar",
    status: "roadmap",
    phonemes: [],
  },
  {
    id: "r",
    ipa: "ɹ",
    label: "R",
    manner: "Approximant",
    place: "Alveolar",
    status: "roadmap",
    phonemes: [],
  },
  {
    id: "l",
    ipa: "l",
    label: "L",
    manner: "Lateral",
    place: "Alveolar",
    status: "roadmap",
    phonemes: [],
  },
  {
    id: "m",
    ipa: "m",
    label: "M",
    manner: "Nasal",
    place: "Bilabial",
    status: "roadmap",
    phonemes: [],
  },
  {
    id: "n",
    ipa: "n",
    label: "N",
    manner: "Nasal",
    place: "Alveolar",
    status: "roadmap",
    phonemes: [],
  },
  {
    id: "w",
    ipa: "w",
    label: "W",
    manner: "Approximant",
    place: "Labial-velar",
    status: "roadmap",
    phonemes: [],
  },
  {
    id: "h",
    ipa: "h",
    label: "H",
    manner: "Fricative",
    place: "Glottal",
    status: "roadmap",
    phonemes: [],
  },
];

export function wordsForSound(cell: SpeechSoundCell): string[] {
  if (cell.status !== "practice" || cell.phonemes.length === 0) return [];
  const set = new Set(cell.phonemes);
  return assignableWords()
    .filter((w) => set.has(w.targetPhoneme))
    .map((w) => w.text);
}

/** True when every bank word for this sound is already in the selected set. */
export function soundFullySelected(
  cell: SpeechSoundCell,
  selected: string[],
): boolean {
  const words = wordsForSound(cell);
  if (!words.length) return false;
  return words.every((w) => selected.includes(w));
}

/** Toggle all bank words for a sound into / out of the draft assign list. */
export function toggleSoundWords(
  cell: SpeechSoundCell,
  selected: string[],
): string[] {
  const words = wordsForSound(cell);
  if (!words.length) return selected;
  const allOn = words.every((w) => selected.includes(w));
  if (allOn) {
    const drop = new Set(words);
    return selected.filter((w) => !drop.has(w));
  }
  const next = [...selected];
  for (const w of words) {
    if (!next.includes(w)) next.push(w);
  }
  return next;
}
