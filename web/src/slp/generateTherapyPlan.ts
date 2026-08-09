import type { TherapyPlan, TherapyVocab } from "./types";
import { EMPTY_VOCAB } from "./types";

export type TherapyPlanGenerateInput = {
  topic: string;
  targets: string[];
  schedule: string[];
  weakPhonemes: string[];
  assignedWords: string[];
  activitiesHave: string;
  activitiesNeed: string;
  vocab: TherapyVocab;
};

export type TherapyPlanGenerateResult = {
  activitiesHave: string;
  activitiesNeed: string;
  vocab: TherapyVocab;
  generatedNote: string;
  source: "ollama" | "heuristic";
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function mergeVocab(
  base: TherapyVocab,
  incoming: Partial<TherapyVocab> | undefined,
): TherapyVocab {
  return {
    core: incoming?.core?.length ? asStringList(incoming.core) : base.core,
    basicConcepts: incoming?.basicConcepts?.length
      ? asStringList(incoming.basicConcepts)
      : base.basicConcepts,
    describing: incoming?.describing?.length
      ? asStringList(incoming.describing)
      : base.describing,
    tier2: incoming?.tier2?.length ? asStringList(incoming.tier2) : base.tier2,
    other: incoming?.other?.length ? asStringList(incoming.other) : base.other,
  };
}

/** Local fallback when the brain is cold — still fills the SIMPLE worksheet. */
export function heuristicTherapyPlan(
  input: TherapyPlanGenerateInput,
): TherapyPlanGenerateResult {
  const theme = input.topic.trim() || "this week’s theme";
  const targets =
    input.targets.length > 0
      ? input.targets.join(", ")
      : "articulation + language goals";
  const weak =
    input.weakPhonemes.length > 0
      ? input.weakPhonemes.slice(0, 3).join(", ")
      : "target sounds";
  const assigned =
    input.assignedWords.length > 0
      ? input.assignedWords.slice(0, 6).join(", ")
      : "practice words";

  const activitiesHave =
    input.activitiesHave.trim() ||
    `Picture cards for ${theme}; mirror for mouth shapes; assigned words: ${assigned}.`;
  const activitiesNeed =
    input.activitiesNeed.trim() ||
    `One book or short video on ${theme}; sticky notes for ${weak}; timer for drill + fun wrap.`;

  const vocab: TherapyVocab = {
    core:
      input.vocab.core.length > 0
        ? input.vocab.core
        : ["want", "more", "look", "help"],
    basicConcepts:
      input.vocab.basicConcepts.length > 0
        ? input.vocab.basicConcepts
        : ["big", "little", "same", "different"],
    describing:
      input.vocab.describing.length > 0
        ? input.vocab.describing
        : [theme.split(/\s+/)[0] || "theme", "color", "size", "feel"],
    tier2:
      input.vocab.tier2.length > 0
        ? input.vocab.tier2
        : ["observe", "compare", "explain"],
    other:
      input.vocab.other.length > 0
        ? input.vocab.other
        : ["and", "because", "then"],
  };

  return {
    activitiesHave,
    activitiesNeed,
    vocab,
    generatedNote: `Quick plan for ${theme}: keep ${targets} front and center; warm up, teach, practice ${weak}, then fun.`,
    source: "heuristic",
  };
}

export async function generateTherapyPlan(
  input: TherapyPlanGenerateInput,
): Promise<TherapyPlanGenerateResult> {
  const fallback = heuristicTherapyPlan(input);
  try {
    try {
      await fetch("/api/wake", { method: "POST" });
    } catch {
      /* heuristic still works */
    }

    const res = await fetch("/api/therapy-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: input.topic,
        targets: input.targets,
        schedule: input.schedule,
        weak_phonemes: input.weakPhonemes,
        assigned_words: input.assignedWords,
        activities_have: input.activitiesHave,
        activities_need: input.activitiesNeed,
        vocab: {
          core: input.vocab.core,
          basic_concepts: input.vocab.basicConcepts,
          describing: input.vocab.describing,
          tier_2: input.vocab.tier2,
          other: input.vocab.other,
        },
      }),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as Record<string, unknown>;
    const vocabRaw = (data.vocab ?? {}) as Partial<TherapyVocab>;
    return {
      activitiesHave:
        typeof data.activities_have === "string" && data.activities_have.trim()
          ? data.activities_have
          : typeof data.activitiesHave === "string" &&
              data.activitiesHave.trim()
            ? data.activitiesHave
            : fallback.activitiesHave,
      activitiesNeed:
        typeof data.activities_need === "string" && data.activities_need.trim()
          ? data.activities_need
          : typeof data.activitiesNeed === "string" &&
              data.activitiesNeed.trim()
            ? data.activitiesNeed
            : fallback.activitiesNeed,
      vocab: mergeVocab(fallback.vocab, {
        core: asStringList(vocabRaw.core),
        basicConcepts: asStringList(
          vocabRaw.basicConcepts ??
            (data as { basic_concepts?: unknown }).basic_concepts,
        ),
        describing: asStringList(vocabRaw.describing),
        tier2: asStringList(vocabRaw.tier2 ?? (data as { tier_2?: unknown }).tier_2),
        other: asStringList(vocabRaw.other),
      }),
      generatedNote:
        typeof data.generated_note === "string" && data.generated_note.trim()
          ? data.generated_note.trim()
          : typeof data.generatedNote === "string" && data.generatedNote.trim()
            ? data.generatedNote.trim()
            : fallback.generatedNote,
      source: data.source === "ollama" ? "ollama" : "heuristic",
    };
  } catch {
    return fallback;
  }
}

/** Apply generate result onto a plan without wiping SLP target/schedule chips. */
export function applyGeneratedPlan(
  plan: TherapyPlan,
  result: TherapyPlanGenerateResult,
): TherapyPlan {
  return {
    ...plan,
    activitiesHave: result.activitiesHave,
    activitiesNeed: result.activitiesNeed,
    vocab: result.vocab,
    generatedNote: result.generatedNote,
    updatedAt: Date.now(),
  };
}
