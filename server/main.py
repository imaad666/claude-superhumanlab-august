"""
Local speech-companion brain.

Fast path: MediaPipe + audio metrics → heuristic (always instant)
Vision path: lip-crop JPEG + same metrics → Gemma 3 4B (Ollama)

No cloud. No Claude.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Literal

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
# Multimodal ~3.3GB — metrics + lip-crop vision
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")

app = FastAPI(title="Speak & See Brain", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


Tone = Literal["calm", "warm", "bright", "soft"]
Mood = Literal["encouraging", "curious", "serious", "playful", "tired", "neutral"]
Intention = Literal["greeting", "asking", "explaining", "practicing", "emphasizing", "unknown"]
Match = Literal["good", "close", "try_again"]


class LipFeatures(BaseModel):
    openness: float = 0.0
    width: float = 0.0
    roundness: float = 0.0
    viseme_guess: str = "rest"


class AudioFeatures(BaseModel):
    volume: float = 0.0
    pitch_hint: float = 0.0


class ExpressionFeatures(BaseModel):
    smile: float = 0.0
    brow_up: float = 0.0
    brow_down: float = 0.0
    jaw_open: float = 0.0
    mouth_funnel: float = 0.0


class AnalyzeRequest(BaseModel):
    mode: Literal["trainer", "live"] = "trainer"
    transcript: str = ""
    recent_words: list[str] = Field(default_factory=list)
    lips: LipFeatures = Field(default_factory=LipFeatures)
    audio: AudioFeatures = Field(default_factory=AudioFeatures)
    expression: ExpressionFeatures = Field(default_factory=ExpressionFeatures)
    coach_target: str | None = None
    # Optional JPEG/PNG base64 (raw or data-URL) of mouth crop
    lip_image: str | None = None


class WordInsight(BaseModel):
    text: str
    tone: Tone
    tip: str | None = None


class AnalyzeResponse(BaseModel):
    tone: Tone
    mood: Mood
    intention: Intention
    summary: str
    lip_match: Match
    lip_cue: str
    words: list[WordInsight] = Field(default_factory=list)
    source: Literal["ollama", "heuristic"]
    model: str | None = None
    used_vision: bool = False


FeedbackFocus = Literal["maneuver", "sound", "stress"]


class AttemptTarget(BaseModel):
    openness: float = 0.0
    width: float = 0.0
    roundness: float = 0.0
    volume: float = 0.1


class AttemptObservation(BaseModel):
    openness: float = 0.0
    width: float = 0.0
    roundness: float = 0.0
    volume: float = 0.0
    pitch_hint: float = 0.0
    voiced_ms: int = 0
    sample_count: int = 0
    # Expression / Brain-panel signals recorded during the step.
    smile: float = 0.0
    jaw_open: float = 0.0
    mouth_funnel: float = 0.0
    brow_up: float = 0.0
    brow_down: float = 0.0
    # Shape error vs target (0–1), for coaching priority.
    openness_err: float = 0.0
    width_err: float = 0.0
    roundness_err: float = 0.0


class AttemptStepIn(BaseModel):
    label: str = ""
    speak_as: str = ""
    viseme: str = "A"
    target: AttemptTarget = Field(default_factory=AttemptTarget)
    observed: AttemptObservation | None = None
    local_match: Match = "try_again"
    shape_match: Match = "try_again"
    needs_voice: bool = True
    voice_ok: bool = False
    # One or two representative mouth crops are enough for post-attempt review.
    lip_image: str | None = None


class LessonFeedbackRequest(BaseModel):
    text: str = ""
    kind: Literal["word", "sentence"] = "word"
    transcript: str = ""
    transcript_available: bool = False
    overall: Match = "close"
    steps: list[AttemptStepIn] = Field(default_factory=list)


class LessonFeedbackResponse(BaseModel):
    summary: str
    maneuver: str
    sound: str
    stress: str
    stress_status: Literal["on_target", "needs_work", "unavailable"] = "unavailable"
    next_action: str
    focus: FeedbackFocus
    source: Literal["ollama", "heuristic"]
    model: str | None = None
    used_vision: bool = False


def _strip_b64(image: str | None) -> str | None:
    if not image:
        return None
    raw = image.strip()
    if "," in raw and raw.lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    raw = raw.strip()
    return raw or None


def _heuristic(req: AnalyzeRequest) -> AnalyzeResponse:
    vol = req.audio.volume
    pitch = req.audio.pitch_hint
    smile = req.expression.smile
    brow_down = req.expression.brow_down
    brow_up = req.expression.brow_up
    funnel = req.expression.mouth_funnel
    jaw = max(req.expression.jaw_open, req.lips.openness)
    speaking = vol > 0.04 or req.lips.openness > 0.12 or jaw > 0.15

    if not speaking:
        tone: Tone = "soft"
    elif pitch > 0.42 and vol > 0.08:
        tone = "bright"
    elif smile > 0.28 or (vol > 0.06 and pitch > 0.28):
        tone = "warm"
    elif vol < 0.06:
        tone = "soft"
    else:
        tone = "calm"

    if not speaking:
        mood: Mood = "tired"
    elif smile > 0.35 and vol > 0.05:
        mood = "playful" if pitch > 0.38 else "encouraging"
    elif brow_down > 0.28:
        mood = "serious"
    elif brow_up > 0.22 and pitch > 0.3:
        mood = "curious"
    elif vol > 0.05:
        mood = "encouraging"
    else:
        mood = "neutral"

    text = (req.transcript or " ".join(req.recent_words)).strip().lower()
    intention: Intention = "practicing" if req.mode == "trainer" else "unknown"
    if "?" in text or text.startswith(
        ("what", "why", "how", "when", "where", "who", "can", "do ", "is ", "are ")
    ):
        intention = "asking"
    elif any(g in text for g in ("hi", "hello", "hey", "good morning", "namaste")):
        intention = "greeting"
    elif tone == "bright":
        intention = "emphasizing"
    elif len(text.split()) > 5:
        intention = "explaining"

    target = (req.coach_target or req.lips.viseme_guess or "rest").upper()
    lip_match, lip_cue = _lip_coaching(target, req.lips, funnel, jaw)

    if req.mode == "trainer":
        summary = (
            f"Voice feels {tone}, mood reads {mood}. {lip_cue}"
            if speaking
            else f"Waiting for your voice — try the {'Ah' if target == 'REST' else target} shape."
        )
    else:
        summary = (
            f"They sound {tone} and {mood}, likely {intention}."
            if speaking
            else "Listening for speech…"
        )

    words = [
        WordInsight(text=w, tone=tone, tip=lip_cue if i == len(req.recent_words) - 1 else None)
        for i, w in enumerate(req.recent_words[-12:])
    ]

    return AnalyzeResponse(
        tone=tone,
        mood=mood,
        intention=intention,
        summary=summary,
        lip_match=lip_match,
        lip_cue=lip_cue,
        words=words,
        source="heuristic",
        model=None,
        used_vision=False,
    )


def _lip_coaching(
    target: str,
    lips: LipFeatures,
    funnel: float,
    jaw: float,
) -> tuple[Match, str]:
    t = target.upper()
    if t in {"O", "OH"}:
        if funnel > 0.2 or lips.roundness > 0.4:
            return "good", "Nice round lips — keep that circle."
        if lips.roundness > 0.22:
            return "close", "Almost — purse lips a bit more into a soft O."
        return "try_again", "Round your lips like saying “oh.”"
    if t in {"U", "OO"}:
        if funnel > 0.22 or (lips.roundness > 0.42 and lips.openness < 0.4):
            return "good", "Tight round “oo” — looking good."
        return "close", "Smaller round opening — push lips forward a little."
    if t in {"A", "AH"}:
        if jaw > 0.28 or lips.openness > 0.32:
            return "good", "Jaw open — clear “ah.”"
        return "close", "Drop your jaw a bit more for “ah.”"
    if t in {"E", "EH", "I", "EE"}:
        if lips.width > 0.38:
            return "good", "Wide smile shape — nice."
        return "close", "Pull lips wider to the sides."
    if t in {"M", "MM", "B", "P"}:
        if lips.openness < 0.14:
            return "good", "Lips together — perfect for “mm.”"
        return "try_again", "Press lips gently closed."
    if t in {"F", "V"}:
        if 0.08 < lips.openness < 0.35:
            return "close", "Upper teeth lightly on lower lip."
        return "try_again", "Bite gently on the lower lip for “f.”"
    if lips.openness > 0.12 or lips.width > 0.28:
        return "close", "Keep going — match the coach mouth."
    return "close", "Relax, then copy the coach shape."


async def _ollama_tags() -> tuple[bool, list[str]]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(f"{OLLAMA_URL}/api/tags")
            if res.status_code != 200:
                return False, []
            models = [m.get("name", "") for m in res.json().get("models", [])]
            return True, models
    except Exception:
        return False, []


def _model_present(models: list[str], name: str) -> bool:
    target = name.lower()
    base = target.split(":")[0]
    for m in models:
        ml = m.lower()
        if ml == target or ml.startswith(f"{target}-") or ml.startswith(f"{target}:"):
            return True
        if ":" in target and ml.startswith(base + ":"):
            # gemma3:4b matches gemma3:4b-it-q4_k_m etc.
            tag = target.split(":", 1)[1]
            if tag and tag in ml:
                return True
    return any(base == m.lower().split(":")[0] and target in m.lower() for m in models)


async def _ollama_pull(model: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=900.0) as client:
        res = await client.post(f"{OLLAMA_URL}/api/pull", json={"name": model, "stream": False})
        res.raise_for_status()
        return res.json() if res.content else {"status": "ok"}


async def _ollama_warmup(model: str) -> bool:
    payload = {
        "model": model,
        "stream": False,
        "format": "json",
        "keep_alive": "30m",
        "options": {"temperature": 0.1, "num_predict": 24},
        "messages": [
            {"role": "system", "content": 'Return JSON only: {"ok":true}'},
            {"role": "user", "content": "ping"},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            res = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            res.raise_for_status()
            return True
    except Exception:
        return False


def _extract_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def _norm_tone(value: Any, fallback: Tone) -> Tone:
    raw = str(value or "").strip().lower()
    aliases = {
        "calm": "calm",
        "steady": "calm",
        "neutral": "calm",
        "warm": "warm",
        "friendly": "warm",
        "bright": "bright",
        "emphasis": "bright",
        "emphatic": "bright",
        "excited": "bright",
        "soft": "soft",
        "gentle": "soft",
        "quiet": "soft",
    }
    return aliases.get(raw, fallback)  # type: ignore[return-value]


def _norm_mood(value: Any, fallback: Mood) -> Mood:
    raw = str(value or "").strip().lower()
    allowed = {
        "encouraging",
        "curious",
        "serious",
        "playful",
        "tired",
        "neutral",
        "calm",
    }
    if raw == "calm":
        return "neutral"
    return raw if raw in allowed else fallback  # type: ignore[return-value]


def _norm_intention(value: Any, fallback: Intention) -> Intention:
    raw = str(value or "").strip().lower()
    # model sometimes returns a sentence
    if "ask" in raw or "?" in raw:
        return "asking"
    if "greet" in raw or "hello" in raw:
        return "greeting"
    if "emphas" in raw:
        return "emphasizing"
    if "explain" in raw:
        return "explaining"
    if "practic" in raw:
        return "practicing"
    allowed = {
        "greeting",
        "asking",
        "explaining",
        "practicing",
        "emphasizing",
        "unknown",
    }
    return raw if raw in allowed else fallback  # type: ignore[return-value]


def _norm_match(value: Any, fallback: Match) -> Match:
    if isinstance(value, (int, float)):
        if value >= 0.7:
            return "good"
        if value >= 0.4:
            return "close"
        return "try_again"
    raw = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
    if raw in {"good", "close", "try_again"}:
        return raw  # type: ignore[return-value]
    if "good" in raw or "great" in raw or "perfect" in raw:
        return "good"
    if "close" in raw or "almost" in raw:
        return "close"
    if "try" in raw or "again" in raw or "need" in raw:
        return "try_again"
    return fallback


def _norm_cue(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    # collapse to one short line
    text = re.sub(r"\s+", " ", text)
    return text[:160] or fallback


def _norm_summary(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    text = re.sub(r"\s+", " ", text)
    return text[:220] or fallback


async def _ollama_refine(req: AnalyzeRequest, base: AnalyzeResponse) -> AnalyzeResponse | None:
    image = _strip_b64(req.lip_image)
    has_vision = bool(image)

    prompt = f"""You are Speak & See — a local coach for Deaf/hard-of-hearing speech practice.
Be encouraging, never harsh. Use BOTH the metrics AND the mouth photo (if present).
Return ONLY valid JSON with EXACT enum strings:
tone: calm|warm|bright|soft
mood: encouraging|curious|serious|playful|tired|neutral
intention: greeting|asking|explaining|practicing|emphasizing|unknown
lip_match: good|close|try_again
summary: one short sentence
lip_cue: one short tip about mouth shape

mode={req.mode}
target_shape={req.coach_target or req.lips.viseme_guess}
transcript={req.transcript!r}
recent_words={req.recent_words[-8:]}
lips={req.lips.model_dump()}
audio={req.audio.model_dump()}
expression={req.expression.model_dump()}
heuristic_guess={base.model_dump(exclude={"words", "source", "model", "used_vision"})}
has_mouth_photo={has_vision}
"""

    user_msg: dict[str, Any] = {"role": "user", "content": prompt}
    if image:
        user_msg["images"] = [image]

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "keep_alive": "30m",
        "options": {
            "temperature": 0.1,
            "num_predict": 140,
        },
        "messages": [
            {
                "role": "system",
                "content": "Speak & See vision brain. Output JSON only with exact enums. Prefer mouth photo when it conflicts with metrics.",
            },
            user_msg,
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=18.0) as client:
            res = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            res.raise_for_status()
            data = res.json()
            content = data.get("message", {}).get("content", "")
            parsed = _extract_json(content)
            if not parsed:
                return None
            return AnalyzeResponse(
                tone=_norm_tone(parsed.get("tone"), base.tone),
                mood=_norm_mood(parsed.get("mood"), base.mood),
                intention=_norm_intention(parsed.get("intention"), base.intention),
                summary=_norm_summary(parsed.get("summary"), base.summary),
                lip_match=_norm_match(parsed.get("lip_match"), base.lip_match),
                lip_cue=_norm_cue(parsed.get("lip_cue"), base.lip_cue),
                words=base.words,
                source="ollama",
                model=OLLAMA_MODEL,
                used_vision=has_vision,
            )
    except Exception:
        return None



def _attempt_priority_step(req: LessonFeedbackRequest) -> AttemptStepIn | None:
    if not req.steps:
        return None

    rank = {"try_again": 3, "close": 2, "good": 1}

    def priority(step: AttemptStepIn) -> tuple[int, float]:
        if not step.observed:
            return (4, 1.0)
        target = step.target
        observed = step.observed
        delta = max(
            abs(target.openness - observed.openness),
            abs(target.width - observed.width),
            abs(target.roundness - observed.roundness),
        )
        return (rank.get(step.shape_match, 3), delta)

    return max(req.steps, key=priority)


def _attempt_maneuver(step: AttemptStepIn | None) -> str:
    if not step or not step.observed:
        return "Keep your face in view, then match the target mouth shape one sound at a time."

    target = step.target
    observed = step.observed
    deltas = {
        "open": target.openness - observed.openness,
        "wide": target.width - observed.width,
        "round": target.roundness - observed.roundness,
    }
    # Prefer the recorded error magnitudes when present.
    if max(observed.openness_err, observed.width_err, observed.roundness_err) > 0.01:
        err_map = {
            "open": observed.openness_err * (1 if deltas["open"] >= 0 else -1),
            "wide": observed.width_err * (1 if deltas["wide"] >= 0 else -1),
            "round": observed.roundness_err * (1 if deltas["round"] >= 0 else -1),
        }
        dimension, signed = max(err_map.items(), key=lambda pair: abs(pair[1]))
        delta = signed
    else:
        dimension, delta = max(deltas.items(), key=lambda pair: abs(pair[1]))

    sound = step.speak_as or step.label or "this sound"

    # Jaw / funnel can override when they dominate the miss.
    if observed.jaw_open + 0.12 < target.openness and abs(delta) < 0.18:
        return f"Drop your jaw a touch more for “{sound}” — keep the lips matching the green guide."
    if observed.mouth_funnel + 0.15 < target.roundness and dimension == "round" and delta > 0:
        return f"Purse and funnel the lips forward for “{sound}” — think a soft whistle shape."
    if observed.smile + 0.2 < target.width and dimension == "wide" and delta > 0:
        return f"Lift into a wider smile for “{sound}” — corners out, teeth lightly showing."

    if abs(delta) < 0.06:
        return f"Keep the mouth shape steady through “{sound}” — it is close to the target."
    if dimension == "open":
        return (
            f"Open your jaw a little more for “{sound}”."
            if delta > 0
            else f"Close your jaw slightly sooner for “{sound}”."
        )
    if dimension == "wide":
        return (
            f"Pull the corners of your lips wider for “{sound}”."
            if delta > 0
            else f"Relax the corners slightly for “{sound}”."
        )
    return (
        f"Round your lips forward a little more for “{sound}”."
        if delta > 0
        else f"Soften the lip roundness for “{sound}”."
    )


def _attempt_sound(req: LessonFeedbackRequest) -> str:
    voiced_steps = [step for step in req.steps if step.needs_voice and step.voice_ok]
    missing_steps = [step for step in req.steps if step.needs_voice and not step.voice_ok]
    if not req.steps:
        return "Say the word aloud so the microphone can confirm your voice."
    if not missing_steps:
        pitches = [
            step.observed.pitch_hint
            for step in voiced_steps
            if step.observed and step.observed.pitch_hint > 0.05
        ]
        if pitches and sum(pitches) / len(pitches) < 0.18:
            return "Voice was heard — try a slightly brighter pitch so the ending stays clear."
        return (
            "Your voice was present through the practice sounds — keep the ending audible."
            if voiced_steps
            else "This mouth shape does not need an audible voice check."
        )
    step = missing_steps[0]
    sound = step.speak_as or step.label or "that sound"
    vol = step.observed.volume if step.observed else 0.0
    if vol > 0.03:
        return f"“{sound}” was quiet — speak a little louder and hold it through the shape."
    return f"Give “{sound}” a clear, steady voice so the microphone can hear it."


def _attempt_stress(req: LessonFeedbackRequest) -> str:
    sounds = [step.speak_as or step.label for step in req.steps if step.speak_as or step.label]
    first = sounds[0] if sounds else "the first sound"
    pitches = [
        (step.speak_as or step.label or "sound", step.observed.pitch_hint)
        for step in req.steps
        if step.observed
    ]
    if len(pitches) >= 2:
        lead = max(pitches, key=lambda pair: pair[1])
        if lead[1] >= 0.28:
            return (
                f"Nice lift on “{lead[0]}” — keep that gentle lead, then let the rest settle."
            )
    if req.kind == "sentence":
        return "Practice an even rhythm, then give the key word a little more time instead of more force."
    return f"Practice the rhythm in beats: let “{first}” lead gently, then let the rest flow together."


def _heuristic_lesson_feedback(req: LessonFeedbackRequest) -> LessonFeedbackResponse:
    priority = _attempt_priority_step(req)
    maneuver = _attempt_maneuver(priority)
    sound = _attempt_sound(req)
    stress = _attempt_stress(req)
    if req.overall == "good":
        summary = f"Strong work on “{req.text or 'that practice'}” — the local checks found a solid attempt."
    elif req.overall == "close":
        summary = f"You are close on “{req.text or 'that practice'}”. One focused adjustment will make the next try clearer."
    else:
        summary = f"Good effort on “{req.text or 'that practice'}”. Slow it down and focus on one sound at a time."

    focus: FeedbackFocus
    if priority and priority.needs_voice and not priority.voice_ok:
        focus = "sound"
    elif priority and priority.shape_match != "good":
        focus = "maneuver"
    else:
        focus = "stress"
    return LessonFeedbackResponse(
        summary=summary,
        maneuver=maneuver,
        sound=sound,
        stress=stress,
        stress_status="unavailable",
        next_action=maneuver,
        focus=focus,
        source="heuristic",
        model=None,
        used_vision=False,
    )


def _norm_focus(value: Any, fallback: FeedbackFocus) -> FeedbackFocus:
    raw = str(value or "").strip().lower()
    if "sound" in raw or "voice" in raw:
        return "sound"
    if "stress" in raw or "rhythm" in raw or "pace" in raw:
        return "stress"
    if "maneuver" in raw or "mouth" in raw or "lip" in raw or "shape" in raw:
        return "maneuver"
    return fallback


async def _ollama_lesson_feedback(
    req: LessonFeedbackRequest,
    base: LessonFeedbackResponse,
) -> LessonFeedbackResponse | None:
    step_lines: list[str] = []
    images: list[str] = []
    for step in req.steps[:16]:
        observed = step.observed.model_dump() if step.observed else None
        step_lines.append(
            f"{step.label or step.viseme} /{step.speak_as or step.viseme}/ "
            f"target={step.target.model_dump()} observed={observed} "
            f"local_match={step.local_match} shape_match={step.shape_match} "
            f"needs_voice={step.needs_voice} voice_ok={step.voice_ok}"
        )
        image = _strip_b64(step.lip_image)
        # Lip frames are normally tiny; ignore malformed/oversized payloads.
        if image and len(image) <= 350_000 and not images:
            images.append(image)

    prompt = f"""You are Speak & See's local post-practice coach for a Deaf/HoH learner.
Use ALL measured signals: target-versus-observed mouth geometry (open/wide/round),
volume, pitch, smile, jaw, funnel, shape errors, voice evidence, transcript, and mouth photo when supplied.
Return ONLY JSON:
{{
  "summary": "one encouraging sentence",
  "maneuver": "one specific lip, jaw, smile, or funnel adjustment",
  "sound": "one honest voice/sound cue based only on evidence",
  "stress": "one practice cue for rhythm/emphasis/pitch lift",
  "next_action": "one short next try instruction",
  "focus": "maneuver|sound|stress"
}}
Rules:
- The local scores and metrics are measurements; do not contradict them without a clear visual reason.
- Prefer the largest openness/width/roundness error, then jaw/funnel/smile, then volume/pitch.
- Do not claim to detect phoneme correctness or true vocal stress from these metrics alone.
- Treat stress as a practice rhythm/emphasis cue grounded in pitch/volume patterns when present.
- Name at most one priority adjustment and be encouraging, concrete, and brief.

text={req.text!r}
kind={req.kind}
transcript_available={req.transcript_available}
transcript={req.transcript!r}
overall_local_score={req.overall}
steps:
{chr(10).join(step_lines) if step_lines else "(no sampled steps)"}
has_mouth_photo={bool(images)}
"""
    user_msg: dict[str, Any] = {"role": "user", "content": prompt}
    if images:
        user_msg["images"] = images
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "keep_alive": "30m",
        "options": {"temperature": 0.15, "num_predict": 240},
        "messages": [
            {
                "role": "system",
                "content": "Speech-practice recap. JSON only. Ground every claim in supplied evidence.",
            },
            user_msg,
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=32.0) as client:
            res = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            res.raise_for_status()
            parsed = _extract_json(res.json().get("message", {}).get("content", ""))
            if not parsed:
                return None
            # Keep the observable facts deterministic. The model is best used
            # for warm, concise wording and visual refinement—not for claiming
            # a sound-quality or stress measurement we did not collect.
            maneuver = (
                _norm_cue(parsed.get("maneuver"), base.maneuver)
                if images and base.focus == "maneuver"
                else base.maneuver
            )
            return LessonFeedbackResponse(
                summary=_norm_summary(parsed.get("summary"), base.summary),
                maneuver=maneuver,
                sound=base.sound,
                stress=_norm_cue(parsed.get("stress"), base.stress),
                # There is no reliable stress metric yet; retain the server's
                # authoritative status even when the model improves wording.
                stress_status=base.stress_status,
                next_action=maneuver,
                focus=base.focus,
                source="ollama",
                model=OLLAMA_MODEL,
                used_vision=bool(images),
            )
    except Exception:
        return None


class LessonRequest(BaseModel):
    text: str = ""
    kind: Literal["word", "sentence"] = "word"


class LessonStepOut(BaseModel):
    label: str
    speak_as: str
    viseme: str
    cue: str
    hold_ms: int = 650


class LessonResponse(BaseModel):
    text: str
    kind: Literal["word", "sentence"]
    tip: str
    steps: list[LessonStepOut]
    source: Literal["ollama", "heuristic"]
    model: str | None = None


_VISEME_OK = {"rest", "A", "E", "I", "O", "U", "M", "F", "L"}


def _norm_viseme(value: Any, fallback: str = "A") -> str:
    raw = str(value or "").strip().upper().replace(" ", "")
    aliases = {
        "AH": "A", "AA": "A", "EH": "E", "EE": "I", "IH": "I",
        "OH": "O", "OO": "U", "UH": "A", "MM": "M", "B": "M", "P": "M",
        "FF": "F", "V": "F", "LL": "L", "N": "L", "D": "L", "T": "L",
    }
    if raw in _VISEME_OK:
        return raw
    if raw in aliases:
        return aliases[raw]
    if raw[:1] in _VISEME_OK:
        return raw[:1]
    return fallback


def _heuristic_lesson(text: str, kind: Literal["word", "sentence"]) -> LessonResponse:
    clean = " ".join(text.strip().split())
    steps: list[LessonStepOut] = []
    digraphs = [
        ("oo", "oo", "U"), ("ee", "ee", "I"), ("th", "th", "F"),
        ("ch", "ch", "I"), ("sh", "sh", "U"), ("ow", "oww", "O"),
        ("ou", "ow", "O"), ("ay", "ay", "E"), ("ai", "ay", "E"),
        ("oa", "oh", "O"), ("ph", "ff", "F"), ("ng", "ng", "A"),
    ]
    letter_map = {
        "a": ("ah", "A"), "e": ("eh", "E"), "i": ("ee", "I"),
        "o": ("oh", "O"), "u": ("oo", "U"), "y": ("ee", "I"),
        "m": ("mm", "M"), "b": ("b", "M"), "p": ("p", "M"),
        "f": ("ff", "F"), "v": ("vv", "F"), "l": ("ll", "L"),
        "n": ("nn", "L"), "d": ("dh", "L"), "t": ("t", "L"),
        "w": ("w", "U"), "r": ("rr", "E"), "s": ("ss", "I"),
        "z": ("zz", "I"), "g": ("ghh", "A"), "k": ("k", "A"),
        "h": ("h", "A"), "c": ("k", "A"), "j": ("j", "A"),
        "q": ("k", "A"), "x": ("ks", "I"),
    }
    cues = {
        "A": "Open jaw", "E": "Wide smile", "I": "Wide + flat",
        "O": "Round lips", "U": "Tight round", "M": "Lips together",
        "F": "Teeth on lip", "L": "Tongue tip up", "rest": "Soft closed",
    }
    for word in clean.lower().split():
        w = "".join(ch for ch in word if ch.isalpha())
        i = 0
        while i < len(w):
            matched = False
            for dig, speak, vis in digraphs:
                if w[i:i + len(dig)] == dig:
                    steps.append(LessonStepOut(
                        label=dig.upper(), speak_as=speak, viseme=vis,
                        cue=cues.get(vis, "Match the coach"), hold_ms=600 if kind == "sentence" else 650,
                    ))
                    i += len(dig)
                    matched = True
                    break
            if matched:
                continue
            ch = w[i]
            speak, vis = letter_map.get(ch, (ch, "A"))
            steps.append(LessonStepOut(
                label=ch.upper(), speak_as=speak, viseme=vis,
                cue=cues.get(vis, "Match the coach"), hold_ms=600 if kind == "sentence" else 650,
            ))
            i += 1
    if not steps:
        steps = [LessonStepOut(label="AH", speak_as="ah", viseme="A", cue="Open jaw", hold_ms=700)]
    return LessonResponse(
        text=clean,
        kind=kind,
        tip="Watch each mouth shape, then copy it — slow is okay.",
        steps=steps[:16],
        source="heuristic",
        model=None,
    )


async def _ollama_lesson(text: str, kind: Literal["word", "sentence"]) -> LessonResponse | None:
    prompt = f"""You build a Deaf/HoH speech practice lesson.
Break the {kind} into mouth-shape steps a learner can WATCH then RECREATE.
Return ONLY JSON:
{{
  "tip": "one short encouraging tip",
  "steps": [
    {{"label":"D","speak_as":"dh","viseme":"L","cue":"Tongue tip up","hold_ms":650}}
  ]
}}
Rules:
- viseme MUST be one of: A,E,I,O,U,M,F,L,rest
- speak_as is how to mouth it (e.g. oww, ghh) — max 8 chars
- 2 to 10 steps for a word, up to 14 for a sentence
- Be encouraging; no harsh language
text={text!r}
kind={kind}
"""
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "keep_alive": "30m",
        "options": {"temperature": 0.2, "num_predict": 280},
        "messages": [
            {"role": "system", "content": "Speech lesson builder. JSON only. Exact viseme enums."},
            {"role": "user", "content": prompt},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            res = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            res.raise_for_status()
            content = res.json().get("message", {}).get("content", "")
            parsed = _extract_json(content)
            if not parsed or not isinstance(parsed.get("steps"), list):
                return None
            steps_out: list[LessonStepOut] = []
            for raw in parsed["steps"][:16]:
                if not isinstance(raw, dict):
                    continue
                vis = _norm_viseme(raw.get("viseme"))
                steps_out.append(
                    LessonStepOut(
                        label=str(raw.get("label") or vis)[:12],
                        speak_as=str(raw.get("speak_as") or raw.get("speakAs") or vis).lower()[:16],
                        viseme=vis,
                        cue=str(raw.get("cue") or "Match the coach mouth")[:120],
                        hold_ms=max(400, min(1600, int(raw.get("hold_ms") or raw.get("holdMs") or 650))),
                    )
                )
            if not steps_out:
                return None
            clean = " ".join(text.strip().split())
            return LessonResponse(
                text=clean,
                kind=kind,
                tip=_norm_summary(parsed.get("tip"), "Watch each shape, then recreate it."),
                steps=steps_out,
                source="ollama",
                model=OLLAMA_MODEL,
            )
    except Exception:
        return None


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "name": "Speak & See Brain",
        "ok": True,
        "docs": "/docs",
        "health": "/health",
        "wake": "/wake",
        "analyze": "POST /analyze",
        "lesson": "POST /lesson",
        "lesson_feedback": "POST /lesson-feedback",
        "session_lessons": "POST /session-lessons",
        "therapy_plan": "POST /therapy-plan",
        "model": OLLAMA_MODEL,
        "vision": True,
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    ollama_ok, models = await _ollama_tags()
    has_model = _model_present(models, OLLAMA_MODEL) if ollama_ok else False
    return {
        "ok": True,
        "ollama": ollama_ok,
        "model": OLLAMA_MODEL,
        "model_ready": has_model,
        "vision": True,
        "models": models,
        "fallback": "heuristic",
    }


@app.post("/wake")
async def wake() -> dict[str, Any]:
    """Ensure Ollama is up, vision model is pulled, and weights are warm."""
    ollama_ok, models = await _ollama_tags()
    if not ollama_ok:
        return {
            "ok": False,
            "ollama": False,
            "model": OLLAMA_MODEL,
            "model_ready": False,
            "warm": False,
            "vision": True,
            "error": "Ollama not running. Open the Ollama app.",
            "fallback": "heuristic",
        }

    pulled = False
    if not _model_present(models, OLLAMA_MODEL):
        try:
            await _ollama_pull(OLLAMA_MODEL)
            pulled = True
        except Exception as exc:
            return {
                "ok": False,
                "ollama": True,
                "model": OLLAMA_MODEL,
                "model_ready": False,
                "warm": False,
                "vision": True,
                "error": f"Pull failed: {exc}",
                "fallback": "heuristic",
            }

    warm = await _ollama_warmup(OLLAMA_MODEL)
    return {
        "ok": warm,
        "ollama": True,
        "model": OLLAMA_MODEL,
        "model_ready": True,
        "pulled": pulled,
        "warm": warm,
        "vision": True,
        "fallback": "heuristic",
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    base = _heuristic(req)
    refined = await _ollama_refine(req, base)
    return refined or base


@app.post("/lesson-feedback", response_model=LessonFeedbackResponse)
async def lesson_feedback(req: LessonFeedbackRequest) -> LessonFeedbackResponse:
    """Turn a completed local lesson score into one clear, grounded recap."""
    base = _heuristic_lesson_feedback(req)
    refined = await _ollama_lesson_feedback(req, base)
    return refined or base


@app.post("/lesson", response_model=LessonResponse)
async def lesson(req: LessonRequest) -> LessonResponse:
    """Build a watch-and-learn mouth-step lesson for a word or sentence."""
    clean = " ".join((req.text or "").strip().split())
    if not clean:
        return _heuristic_lesson("ah", req.kind)
    refined = await _ollama_lesson(clean, req.kind)
    return refined or _heuristic_lesson(clean, req.kind)


# ── Live Guide → word lessons (model brains + MediaPipe sample indexes) ──


class SessionSampleIn(BaseModel):
    index: int = 0
    t_ms: float = 0
    openness: float = 0
    width: float = 0
    roundness: float = 0
    volume: float = 0
    viseme: str = "rest"
    recent_words: list[str] = Field(default_factory=list)
    has_landmarks: bool = False
    has_lip_image: bool = False


class SessionKeyframeIn(BaseModel):
    sample_index: int = 0
    lip_image: str | None = None
    recent_words: list[str] = Field(default_factory=list)


class SessionLessonsRequest(BaseModel):
    transcript: str = ""
    words: list[str] = Field(default_factory=list)
    samples: list[SessionSampleIn] = Field(default_factory=list)
    keyframes: list[SessionKeyframeIn] = Field(default_factory=list)


class LessonStepOutExt(LessonStepOut):
    sample_index: int | None = None


class SessionWordLessonOutExt(BaseModel):
    text: str
    tip: str
    sample_index: int = 0
    steps: list[LessonStepOutExt]


class SessionLessonsResponseExt(BaseModel):
    tip: str
    words: list[SessionWordLessonOutExt]
    source: Literal["ollama", "heuristic"]
    model: str | None = None
    used_vision: bool = False


def _best_sample_index(req: SessionLessonsRequest, word: str) -> int:
    best_idx = 0
    best_score = -1.0
    for s in req.samples:
        hit = any(word in rw.lower() for rw in s.recent_words)
        score = (2.0 if hit else 0.0) + (1.0 if s.has_landmarks else 0.0) + s.volume
        if score > best_score:
            best_score = score
            best_idx = s.index
    return best_idx


def _heuristic_session_lessons(req: SessionLessonsRequest) -> SessionLessonsResponseExt:
    words = [w for w in req.words if w.strip()] or [
        p for p in re.findall(r"[A-Za-z']+", req.transcript.lower()) if p
    ]
    words = list(dict.fromkeys(words))[:12]
    out: list[SessionWordLessonOutExt] = []
    for word in words:
        lesson = _heuristic_lesson(word, "word")
        best_idx = _best_sample_index(req, word)
        steps: list[LessonStepOutExt] = []
        for i, st in enumerate(lesson.steps):
            nearby = best_idx
            if req.samples:
                offset = i - len(lesson.steps) // 2
                pos = max(0, min(len(req.samples) - 1, best_idx + offset))
                nearby = req.samples[pos].index
            steps.append(
                LessonStepOutExt(
                    label=st.label,
                    speak_as=st.speak_as,
                    viseme=st.viseme,
                    cue=st.cue,
                    hold_ms=st.hold_ms,
                    sample_index=nearby,
                )
            )
        out.append(
            SessionWordLessonOutExt(
                text=word,
                tip=lesson.tip,
                sample_index=best_idx,
                steps=steps,
            )
        )
    return SessionLessonsResponseExt(
        tip=f"Built {len(out)} word lesson(s) from this clip.",
        words=out,
        source="heuristic",
        model=None,
        used_vision=False,
    )


async def _ollama_session_lessons(req: SessionLessonsRequest) -> SessionLessonsResponseExt | None:
    words = [w for w in req.words if w.strip()][:12]
    if not words:
        words = list(dict.fromkeys(re.findall(r"[A-Za-z']+", req.transcript.lower())))[:12]
    if not words:
        return None

    sample_lines = []
    for s in req.samples[:40]:
        sample_lines.append(
            f"[{s.index}] t={int(s.t_ms)}ms open={s.openness:.2f} wide={s.width:.2f} "
            f"round={s.roundness:.2f} vol={s.volume:.2f} viseme={s.viseme} "
            f"words={s.recent_words[-4:]} landmarks={s.has_landmarks}"
        )

    prompt = f"""You are Speak & See. Turn a Live Guide recording of a TEACHER into
word-by-word lip practice lessons for a Deaf/HoH learner.

Return ONLY JSON:
{{
  "tip": "one short tip for practicing from this clip",
  "words": [
    {{
      "text": "hello",
      "tip": "short tip",
      "sample_index": 3,
      "steps": [
        {{"label":"H","speak_as":"heh","viseme":"E","cue":"Wide smile","hold_ms":600,"sample_index":2}}
      ]
    }}
  ]
}}

Rules:
- One lesson object per word in words={words}
- viseme MUST be one of: A,E,I,O,U,M,F,L,rest
- speak_as is how to mouth it (max 8 chars)
- 2-8 steps per word
- sample_index MUST be a real sample index (prefer landmarks=True)
- Use mouth photos if present to refine cues
- Encouraging, never harsh

transcript={req.transcript!r}
samples:
{chr(10).join(sample_lines) if sample_lines else "(none)"}
"""

    images: list[str] = []
    for kf in req.keyframes[:3]:
        img = _strip_b64(kf.lip_image)
        if img:
            images.append(img)

    user_msg: dict[str, Any] = {"role": "user", "content": prompt}
    if images:
        user_msg["images"] = images

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "keep_alive": "30m",
        "options": {"temperature": 0.2, "num_predict": 700},
        "messages": [
            {
                "role": "system",
                "content": "Speech lesson builder from teacher video. JSON only. Exact viseme enums.",
            },
            user_msg,
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=55.0) as client:
            res = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            res.raise_for_status()
            content = res.json().get("message", {}).get("content", "")
            parsed = _extract_json(content)
            if not parsed or not isinstance(parsed.get("words"), list):
                return None

            max_idx = max((s.index for s in req.samples), default=0)
            out_words: list[SessionWordLessonOutExt] = []
            for raw in parsed["words"][:12]:
                if not isinstance(raw, dict):
                    continue
                text = re.sub(r"[^a-z']", "", str(raw.get("text") or "").strip().lower())
                if not text:
                    continue
                steps_raw = raw.get("steps")
                if not isinstance(steps_raw, list) or not steps_raw:
                    continue
                word_si = max(0, min(max_idx, int(raw.get("sample_index") or raw.get("sampleIndex") or 0)))
                steps_out: list[LessonStepOutExt] = []
                for st in steps_raw[:12]:
                    if not isinstance(st, dict):
                        continue
                    vis = _norm_viseme(st.get("viseme"))
                    si = int(st.get("sample_index") or st.get("sampleIndex") or word_si)
                    steps_out.append(
                        LessonStepOutExt(
                            label=str(st.get("label") or vis)[:12],
                            speak_as=str(
                                st.get("speak_as") or st.get("speakAs") or vis
                            ).lower()[:16],
                            viseme=vis,
                            cue=str(st.get("cue") or "Match the teacher mouth")[:120],
                            hold_ms=max(
                                400,
                                min(1600, int(st.get("hold_ms") or st.get("holdMs") or 650)),
                            ),
                            sample_index=max(0, min(max_idx, si)),
                        )
                    )
                if not steps_out:
                    continue
                out_words.append(
                    SessionWordLessonOutExt(
                        text=text,
                        tip=_norm_summary(raw.get("tip"), f'Practice "{text}" like the teacher.'),
                        sample_index=word_si,
                        steps=steps_out,
                    )
                )
            if not out_words:
                return None
            return SessionLessonsResponseExt(
                tip=_norm_summary(
                    parsed.get("tip"),
                    f"Built {len(out_words)} word lesson(s) from this clip.",
                ),
                words=out_words,
                source="ollama",
                model=OLLAMA_MODEL,
                used_vision=bool(images),
            )
    except Exception:
        return None


@app.post("/session-lessons", response_model=SessionLessonsResponseExt)
async def session_lessons(req: SessionLessonsRequest) -> SessionLessonsResponseExt:
    """Build word-by-word practice lessons from a Live Guide recording (Gemma)."""
    refined = await _ollama_session_lessons(req)
    return refined or _heuristic_session_lessons(req)


# ── SLP SIMPLE therapy plan (Speechy Musings–style worksheet fill) ──


class TherapyVocabIn(BaseModel):
    core: list[str] = Field(default_factory=list)
    basic_concepts: list[str] = Field(default_factory=list)
    describing: list[str] = Field(default_factory=list)
    tier_2: list[str] = Field(default_factory=list)
    other: list[str] = Field(default_factory=list)


class TherapyPlanRequest(BaseModel):
    topic: str = ""
    targets: list[str] = Field(default_factory=list)
    schedule: list[str] = Field(default_factory=list)
    weak_phonemes: list[str] = Field(default_factory=list)
    assigned_words: list[str] = Field(default_factory=list)
    activities_have: str = ""
    activities_need: str = ""
    vocab: TherapyVocabIn = Field(default_factory=TherapyVocabIn)


class TherapyVocabOut(BaseModel):
    core: list[str] = Field(default_factory=list)
    basicConcepts: list[str] = Field(default_factory=list)
    describing: list[str] = Field(default_factory=list)
    tier2: list[str] = Field(default_factory=list)
    other: list[str] = Field(default_factory=list)


class TherapyPlanResponse(BaseModel):
    activities_have: str
    activities_need: str
    vocab: TherapyVocabOut
    generated_note: str
    source: Literal["ollama", "heuristic"]
    model: str | None = None


def _str_list(value: Any, limit: int = 10) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item or "").strip()
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _heuristic_therapy_plan(req: TherapyPlanRequest) -> TherapyPlanResponse:
    theme = (req.topic or "").strip() or "this week's theme"
    targets = ", ".join(req.targets) if req.targets else "articulation + language goals"
    weak = ", ".join(req.weak_phonemes[:3]) if req.weak_phonemes else "target sounds"
    assigned = ", ".join(req.assigned_words[:6]) if req.assigned_words else "practice words"
    first = theme.split()[0] if theme.split() else "theme"

    have = (req.activities_have or "").strip() or (
        f"Picture cards for {theme}; mirror for mouth shapes; assigned words: {assigned}."
    )
    need = (req.activities_need or "").strip() or (
        f"One book or short video on {theme}; sticky notes for {weak}; timer for drill + fun wrap."
    )

    v = req.vocab
    vocab = TherapyVocabOut(
        core=_str_list(v.core) or ["want", "more", "look", "help"],
        basicConcepts=_str_list(v.basic_concepts) or ["big", "little", "same", "different"],
        describing=_str_list(v.describing) or [first, "color", "size", "feel"],
        tier2=_str_list(v.tier_2) or ["observe", "compare", "explain"],
        other=_str_list(v.other) or ["and", "because", "then"],
    )

    return TherapyPlanResponse(
        activities_have=have,
        activities_need=need,
        vocab=vocab,
        generated_note=(
            f"Quick plan for {theme}: keep {targets} front and center; "
            f"warm up, teach, practice {weak}, then fun."
        ),
        source="heuristic",
        model=None,
    )


async def _ollama_therapy_plan(
    req: TherapyPlanRequest, base: TherapyPlanResponse
) -> TherapyPlanResponse | None:
    prompt = f"""You are Speak & See — helping a speech-language pathologist fill a SIMPLE session worksheet.
Return ONLY valid JSON with these keys:
activities_have: one short paragraph of materials already on hand
activities_need: one short paragraph of gaps / materials still needed
vocab: object with arrays core, basic_concepts, describing, tier_2, other (3–6 short words each)
generated_note: 1–2 encouraging sentences summarizing the session rhythm

Respect the SLP's chips — expand activities and vocab around them. Do not invent medical claims.
Keep language warm, concrete, and classroom-ready.

topic={req.topic!r}
targets={req.targets}
schedule={req.schedule}
weak_phonemes={req.weak_phonemes}
assigned_words={req.assigned_words}
activities_have_draft={req.activities_have!r}
activities_need_draft={req.activities_need!r}
vocab_draft={req.vocab.model_dump()}
heuristic_guess={base.model_dump(exclude={{"source", "model"}})}
"""

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "keep_alive": "30m",
        "options": {
            "temperature": 0.25,
            "num_predict": 280,
        },
        "messages": [
            {
                "role": "system",
                "content": "Speak & See SLP planner. Output JSON only. Be brief and practical.",
            },
            {"role": "user", "content": prompt},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            res = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            res.raise_for_status()
            data = res.json()
            content = data.get("message", {}).get("content", "")
            parsed = _extract_json(content)
            if not parsed:
                return None

            vocab_raw = parsed.get("vocab") if isinstance(parsed.get("vocab"), dict) else {}
            core = _str_list(vocab_raw.get("core") or vocab_raw.get("coreVocabulary"))
            basic = _str_list(
                vocab_raw.get("basic_concepts")
                or vocab_raw.get("basicConcepts")
                or vocab_raw.get("basic")
            )
            describing = _str_list(vocab_raw.get("describing") or vocab_raw.get("describe"))
            tier2 = _str_list(
                vocab_raw.get("tier_2") or vocab_raw.get("tier2") or vocab_raw.get("tierTwo")
            )
            other = _str_list(vocab_raw.get("other") or vocab_raw.get("other_targets"))

            have = _norm_summary(parsed.get("activities_have") or parsed.get("activitiesHave"), base.activities_have)
            need = _norm_summary(parsed.get("activities_need") or parsed.get("activitiesNeed"), base.activities_need)
            note = _norm_summary(
                parsed.get("generated_note") or parsed.get("generatedNote"),
                base.generated_note,
            )

            return TherapyPlanResponse(
                activities_have=have,
                activities_need=need,
                vocab=TherapyVocabOut(
                    core=core or base.vocab.core,
                    basicConcepts=basic or base.vocab.basicConcepts,
                    describing=describing or base.vocab.describing,
                    tier2=tier2 or base.vocab.tier2,
                    other=other or base.vocab.other,
                ),
                generated_note=note,
                source="ollama",
                model=OLLAMA_MODEL,
            )
    except Exception:
        return None


@app.post("/therapy-plan", response_model=TherapyPlanResponse)
async def therapy_plan(req: TherapyPlanRequest) -> TherapyPlanResponse:
    """Fill a Speechy Musings–style SIMPLE worksheet from SLP chips + weak sounds."""
    base = _heuristic_therapy_plan(req)
    refined = await _ollama_therapy_plan(req, base)
    return refined or base
