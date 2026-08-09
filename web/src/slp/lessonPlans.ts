import type { CurriculumCategory } from "./types";

/**
 * SLP curriculum library — grouped goals for the "I'm the SLP" view, in the
 * spirit of a year-long lesson plan overview. Grounded honestly: "practice"
 * items point at real words/sentences already in the bank and are launchable
 * from the dashboard; "roadmap" items are goals we don't have practice
 * content for yet and are shown as such, not faked.
 */
export const CURRICULUM: CurriculumCategory[] = [
  {
    id: "language",
    title: "Language goals",
    items: [
      {
        label: "Greetings & social phrases",
        status: "practice",
        words: ["hello", "please", "thank you", "good morning", "how are you"],
      },
      {
        label: "Core vocabulary",
        status: "practice",
        words: ["dog", "water", "food", "mom", "friend", "love"],
      },
      {
        label: "Wants & feelings",
        status: "practice",
        words: ["happy", "please", "I am happy"],
      },
      { label: "Yes/No questions", status: "roadmap" },
      { label: "WH questions — who, what, when, where, why, how", status: "roadmap" },
      { label: "Pronouns", status: "roadmap" },
      { label: "Synonyms & antonyms", status: "roadmap" },
      { label: "Categories", status: "roadmap" },
      { label: "Regular & irregular past tense verbs", status: "roadmap" },
      { label: "Compare & contrast", status: "roadmap" },
      { label: "Describe / attributes", status: "roadmap" },
      { label: "Multiple meaning words", status: "roadmap" },
    ],
  },
  {
    id: "social",
    title: "Social skills",
    items: [
      { label: "Idioms", status: "roadmap" },
      { label: "Problem solving", status: "roadmap" },
    ],
  },
  {
    id: "articulation",
    title: "Articulation — minimal pairs",
    items: [
      {
        label: "SH vs CH",
        status: "practice",
        words: ["ship", "chip", "wash", "watch"],
      },
      {
        label: "P vs B",
        status: "practice",
        words: ["pat", "bat", "pig", "big"],
      },
      {
        label: "TH vs F",
        status: "practice",
        words: ["thin", "fin", "three", "free"],
      },
      {
        label: "S vs SH",
        status: "practice",
        words: ["sock", "shock", "sue", "shoe"],
      },
      { label: "R, L, Z — initial/medial/final positions", status: "roadmap" },
    ],
  },
];

/** Goal tags an SLP can pin to a session plan — mirrors the curriculum above. */
export const PLAN_TARGET_OPTIONS = [
  "Describing",
  "Sentence combining",
  "Requesting",
  "WH questions",
  "Story retell",
  "Word-finding",
  "Producing sentences",
  "Articulation — minimal pairs",
];

export const PLAN_SCHEDULE_OPTIONS = [
  "Warm-up activity",
  "Direct teaching",
  "Practice",
  "Fun",
];
