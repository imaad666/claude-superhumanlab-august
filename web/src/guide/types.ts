export type GuideMode = "trainer" | "live";

export type ToneKind = "calm" | "warm" | "bright" | "soft";

export type TranscriptWord = {
  id: string;
  text: string;
  tone: ToneKind;
};

export const TONE_LABELS: Record<ToneKind, string> = {
  calm: "steady",
  warm: "warm",
  bright: "emphasis",
  soft: "gentle",
};
