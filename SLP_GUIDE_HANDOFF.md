# SLP Guide — Build Spec

## Context
This is an addition to an existing hackathon project (Speak & See) that already has a working "Personal Trainer" mode: camera + MediaPipe lip tracking + audio pitch/pacing + STT, producing word-by-word color-coded pronunciation scores in real time.

This spec adds the **SLP Guide** layer on top — no new pipeline, purely a data logging + dashboard + assignment loop built on data the app already generates.

## Core framing
Positioning: the app is a **crux for people who can't afford an SLP, and an assistant for people who can**. Both cases run through the exact same data model and UI — only who fills one specific "pick next targets" slot changes (algorithm vs. human).

## Data model
```ts
type Attempt = { word: string; phoneme: string; score: number; timestamp: number };
type Session = { date: string; attempts: Attempt[] };
type PhonemeStats = { phoneme: string; attempts: number; avgScore: number; trend: number[] }; // derived, not stored
type AssignedSet = { words: string[]; assignedBy: "algorithm" | "SLP"; dueBy?: string };
```
Store `Session[]` and `AssignedSet` in localStorage (no backend/auth needed for the demo). `PhonemeStats` is computed on read, never persisted.

## Flow
1. Personal Trainer mode appends an `Attempt` to the current `Session` after every word attempt (hook into existing scoring output — do not touch the MediaPipe/audio pipeline).
2. Dashboard aggregates all `Session[]` into `PhonemeStats` (avg score per phoneme, trend over time).
3. "Pick next targets" step writes a new `AssignedSet`:
   - **No SLP attached** → algorithm auto-assigns: pick the 1–2 lowest-`avgScore` phonemes, pull matching words from the word bank. Simple rule, not ML.
   - **SLP attached** → SLP dashboard shows `PhonemeStats`, lets a human manually pick words/phonemes into `AssignedSet` instead. When an SLP override exists, algorithm auto-assignment goes quiet.
4. Next Personal Trainer session pulls from `AssignedSet.words` first, falls back to general word bank after.

## Build order (in priority, ~4-5 hrs total)
1. **Session logging** — append `Attempt` to `Session[]` in localStorage from existing scoring output. (~30 min)
2. **Word bank** — hardcode 15–20 words across 4–5 real SLP minimal-pair phoneme contrasts (e.g. ship/chip, pat/bat, thin/fin). Use as both practice content and clinical-grounding proof for judges. (~30–45 min)
3. **Dashboard page** — new route/tab reading `Session[]`, renders: accuracy trend line, per-phoneme weak-spot bars, session count. Reuse existing green/yellow/warm color scheme, not harsh red/wrong. (~1–1.5 hrs)
4. **Assignment loop** — algorithm auto-assign function (lowest avgScore → AssignedSet) + toggle/UI for SLP manual override on the same dashboard. Personal Trainer mode reads `AssignedSet.words` first at session start. (~1 hr)
5. **assignedBy toggle** — single field flip (`"algorithm"` vs `"SLP"`); no separate systems, no auth. If no SLP override present, algorithm fills the gap automatically.

## Explicitly NOT building (state as roadmap in pitch, same honesty pattern as the on-device inference note)
- Real therapist accounts / multi-kid caseload views
- Auth or secure multi-device sync
- Real SLP marketplace/matching, insurance/cost integration
- Dynamic/generated word banks — keep it fixed and hand-picked

## UI note
SLP view can just be a toggle/tab on the same dashboard, not a separate login screen — zero auth needed, still tells the full story for the demo.

## Pitch line to use
"The app plays SLP when you don't have one, and hands the wheel to your real SLP when you do — same data, same loop, it just gets out of the way the moment a human is available."
