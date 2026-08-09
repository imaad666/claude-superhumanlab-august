export type GuideMode = "trainer" | "live";

export type ToneKind = "calm" | "warm" | "bright" | "soft";

export type TranscriptWord = {
  id: string;
  text: string;
  tone: ToneKind;
  /** ms since record start when available (Live Guide). */
  t?: number;
};

export const TONE_LABELS: Record<ToneKind, string> = {
  calm: "steady",
  warm: "warm",
  bright: "emphasis",
  soft: "gentle",
};
