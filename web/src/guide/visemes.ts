export type VisemeId = "rest" | "A" | "E" | "I" | "O" | "U" | "M" | "F" | "L";

export type VisemeGuide = {
  id: VisemeId;
  label: string;
  sound: string;
  cue: string;
  tip: string;
  /** SVG path for outer lip silhouette */
  outer: string;
  /** SVG path for inner mouth opening */
  opening: string;
};

/**
 * Hand-tuned 2D visemes — readable lip coach for practice.
 * Roadmap: swap to a Three.js morph-target mouth when we want full 3D.
 */
export const VISEMES: VisemeGuide[] = [
  {
    id: "rest",
    label: "Rest",
    sound: "…",
    cue: "Soft closed lips",
    tip: "Relax jaw. Lips lightly together — ready position.",
    outer:
      "M 36 58 C 48 48, 72 48, 84 58 C 72 66, 48 66, 36 58 Z",
    opening: "M 48 58 C 54 56, 66 56, 72 58 C 66 60, 54 60, 48 58 Z",
  },
  {
    id: "A",
    label: "Ah",
    sound: "/ɑ/",
    cue: "Open wide",
    tip: "Drop your jaw. Mouth open like a big smile without stretching lips thin.",
    outer:
      "M 30 52 C 46 34, 74 34, 90 52 C 78 78, 42 78, 30 52 Z",
    opening: "M 42 54 C 52 46, 68 46, 78 54 C 68 70, 52 70, 42 54 Z",
  },
  {
    id: "E",
    label: "Eh",
    sound: "/ɛ/",
    cue: "Wide smile",
    tip: "Lips pull wide to the sides. Teeth may show a little.",
    outer:
      "M 24 56 C 44 42, 76 42, 96 56 C 80 68, 40 68, 24 56 Z",
    opening: "M 38 56 C 50 50, 70 50, 82 56 C 70 62, 50 62, 38 56 Z",
  },
  {
    id: "I",
    label: "Ee",
    sound: "/i/",
    cue: "Wide + flat",
    tip: "Smile wider. Lips flat, almost like saying “cheese.”",
    outer:
      "M 20 56 C 42 40, 78 40, 100 56 C 82 66, 38 66, 20 56 Z",
    opening: "M 36 56 C 50 52, 70 52, 84 56 C 70 58, 50 58, 36 56 Z",
  },
  {
    id: "O",
    label: "Oh",
    sound: "/o/",
    cue: "Round lips",
    tip: "Purse lips into a soft circle. Jaw slightly open.",
    outer:
      "M 40 44 C 52 36, 68 36, 80 44 C 88 56, 88 68, 80 76 C 68 84, 52 84, 40 76 C 32 68, 32 56, 40 44 Z",
    opening: "M 50 52 C 56 48, 64 48, 70 52 C 74 58, 74 66, 70 70 C 64 74, 56 74, 50 70 C 46 66, 46 58, 50 52 Z",
  },
  {
    id: "U",
    label: "Oo",
    sound: "/u/",
    cue: "Tight round",
    tip: "Smaller round opening than Oh. Push lips forward a bit.",
    outer:
      "M 44 46 C 54 38, 66 38, 76 46 C 82 56, 82 66, 76 74 C 66 80, 54 80, 44 74 C 38 66, 38 56, 44 46 Z",
    opening: "M 54 54 C 58 50, 62 50, 66 54 C 68 58, 68 64, 66 66 C 62 68, 58 68, 54 66 C 52 64, 52 58, 54 54 Z",
  },
  {
    id: "M",
    label: "Mm",
    sound: "/m/",
    cue: "Lips together",
    tip: "Press lips gently closed. Hum through the nose.",
    outer:
      "M 34 56 C 48 46, 72 46, 86 56 C 72 62, 48 62, 34 56 Z",
    opening: "M 52 57 C 56 56, 64 56, 68 57 C 64 58, 56 58, 52 57 Z",
  },
  {
    id: "F",
    label: "Ff",
    sound: "/f/",
    cue: "Teeth on lip",
    tip: "Upper teeth lightly touch lower lip. Soft air out.",
    outer:
      "M 32 54 C 48 44, 72 44, 88 54 C 74 66, 46 66, 32 54 Z",
    opening: "M 40 56 C 52 52, 68 52, 80 56 C 68 58, 52 58, 40 56 Z",
  },
  {
    id: "L",
    label: "Ll",
    sound: "/l/",
    cue: "Tongue tip up",
    tip: "Tongue tip to the ridge behind upper teeth. Lips relaxed open.",
    outer:
      "M 34 52 C 48 42, 72 42, 86 52 C 74 68, 46 68, 34 52 Z",
    opening: "M 44 54 C 54 48, 66 48, 76 54 C 66 64, 54 64, 44 54 Z",
  },
];

export function visemeFromText(text: string): VisemeId {
  const clean = text.trim().toLowerCase();
  if (!clean) return "rest";
  const ch = clean[0];
  if ("aáàâ".includes(ch)) return "A";
  if ("eéèê".includes(ch)) return "E";
  if ("iíìy".includes(ch)) return "I";
  if ("oóòô".includes(ch)) return "O";
  if ("uúùw".includes(ch)) return "U";
  if ("mbp".includes(ch)) return "M";
  if ("fv".includes(ch)) return "F";
  if ("l".includes(ch)) return "L";
  return "A";
}
