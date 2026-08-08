# Speak & See — Speech Companion for Deaf/HoH Users
### Superhuman Lab: Impact Lab Hackathon (Bengaluru, Aug 8–9, 2026)
Theme: **Communication** — Deafness Enablement

---

## Problem Statement

Deaf individuals capable of speech often avoid speaking altogether — expensive, session-limited SLP (Speech-Language Pathology) therapy gives them no way to practice or self-correct in between sessions, so without ever hearing their own voice or knowing what they're doing right, low confidence wins and they stay silent.

This is especially true for **children** learning to speak, and for anyone trying to interact with hearing people (e.g. in a classroom) who can't sign.

---

## Core Insight

Many Deaf/HoH people are physically capable of producing speech. What they lack isn't the ability — it's the **feedback loop**. A hearing person self-corrects constantly by hearing their own voice; a Deaf person has no equivalent signal. SLP therapy provides this feedback, but only during costly, infrequent sessions with a therapist present. The gap is everything *between* those sessions.

This is not a novel technology problem — lip tracking, pitch analysis, and LLM reasoning all exist independently. The novelty is in combining them into an **accessible, private, always-available practice companion** that makes SLP-style feedback available any time, without a therapist in the room.

---

## Product Vision (full scope — for pitch/dashboard, not all built today)

A public-facing **dashboard** with two entry points:
1. **SLP path** — connects to/complements traditional therapist-led speech therapy (borrow/adapt visuals and content where possible, make it a beautiful, encouraging experience — especially for younger kids just starting out).
2. **Speech Guide path** — the AI-powered practice tool, itself split into two modes:
   - **Personal Trainer mode** — user faces the camera themselves, practices speaking, gets real-time feedback on their own pronunciation/tone/stress.
   - **Live Guide mode** — user points the camera at *someone else* speaking to them (e.g. a teacher), to help interpret that person's tone, emphasis, and speech patterns in real time.


---

## Why "Local" Matters (privacy + cost)

- Camera/audio data from a child's face and voice is sensitive — processing must happen **locally**, not sent to a heavy cloud model. This is also why a quantized local model (Qwen-VL or Gemma) is part of the architecture, not a nice-to-have.
- For the hackathon demo, if local inference is too slow/unreliable in the time available, it's acceptable to note "designed for on-device quantized inference (Qwen/Gemma) for classroom-safe privacy and offline use" as the production architecture, while demoing with a faster path — as long as this distinction is stated honestly if a judge asks.

---

## Technical Architecture (Personal Trainer mode — what to actually build)

```
Camera → MediaPipe Face Landmarker (runs locally, in-browser via JS)
       → precise lip landmark tracking, cropped mouth region, shot-by-shot movement segmentation

Mic → Web Audio API (local)
    → pitch, volume, pacing/rhythm extraction in real time

Speech → Speech-to-text (Whisper.cpp local, or fallback cloud STT if needed for time)
       → transcript

   [transcript] + [lip landmark movement data] + [pitch/volume/pacing features]
                              ↓
        Local quantized model (Qwen-VL / Gemma via Ollama) — or Claude API as fallback
                              ↓
   Reasoning task: does mouth shape match expected shape for this word?
   What's the word stress? What's the inferred tone?
   → word-by-word, color-coded feedback (not harsh pass/fail — encouraging, confidence-building)
                              ↓
        Hardware output layer (see below) — physical, tactile feedback
```

### Key implementation notes
- **Don't use the VLM (Qwen/Gemma) to do lip tracking itself** — that's the wrong tool and too slow/imprecise for real-time use. Use **MediaPipe Face Landmarker** for that (Google's, local, in-browser, real-time, well-documented, fast to implement).
- Use the local model for what LLMs are actually good at: **reasoning over structured signals** (landmark deltas, pitch/volume numbers, transcript) — not raw video interpretation.
- Feedback tone should be **encouraging, not corrective/clinical** — this is a confidence-building tool for a population that already avoids speaking due to low confidence. Avoid harsh red/wrong indicators; use gentle progression (e.g. green = good match, yellow = close, warm/gentle presentation for "needs work").

---

## Hardware (software x hardware build, via PCB Cupid kit)

Available components relevant to this build:
- **Condenser microphone** — voice capture input
- **16×2 LCD display** — short text feedback / word-by-word display
- **RGB LEDs** — color-coded confidence/accuracy signal, glanceable without reading
- **Servo motors (SG90-style)** — repurposed as haptic tap for positive reinforcement / "look up" style cues
- **Rotary encoder** — mode switch or sensitivity dial
- **Pushbuttons/toggle switches** — manual controls (e.g. "I have a question" signal in classroom-adjacent use case)
- **Breadboards, jumper wires, resistor kit** — prototyping
- **ESP32-class dev boards** (Glyph C3/C6 from PCB Cupid, or whatever's in the provided kit) — compute/bridge to the software pipeline

Hardware acts as the **physical feedback layer** for the Personal Trainer mode — LCD shows short encouraging text, RGB LED gives instant glanceable confidence signal, servo gives a gentle positive-reinforcement tap on a good attempt.

---

## Judging/Pitch Notes (Superhuman Lab framing)

- Event ethos: **"human ability as upgrade, not compensation"** — frame the product as building genuine new confidence/capability, not just "fixing" a limitation.
- Judges value **built-with-real-empathy** grounding. No Deaf participants were available at this specific event to consult directly — this should be **stated honestly** in the pitch, along with what was used instead (published research/interviews from Deaf educators and SLP literature, and/or team members simulating the constraint themselves) and the acknowledgment that real-user testing with Deaf participants is the clear next step.
- Structure the pitch as: **(1) the full dashboard vision** (SLP path + both Speech Guide modes, on-device model roadmap) as the ambition, **(2) a working, honest demo of the Personal Trainer slice only**, clearly distinguishing "what we built today" from "what we're pitching as the product."
- Open the demo with the person/moment it's for, not the tech stack.

---

## Team Execution Plan (if splitting work)
1. **MediaPipe + camera pipeline** — lip landmark tracking, cropped mouth region, movement segmentation
2. **Audio pipeline** — Web Audio API pitch/volume/pacing extraction + speech-to-text
3. **Model reasoning layer** — prompt design for Qwen/Gemma (or Claude fallback) to turn transcript + landmark deltas + audio features into color-coded, encouraging word-by-word feedback
4. **Hardware firmware** — LCD + RGB LED + servo trigger logic, driven by the feedback output from step 3
5. **Pitch/demo prep** — dashboard mockup slides for full vision, honest framing of what's built vs. roadmap, opening story
