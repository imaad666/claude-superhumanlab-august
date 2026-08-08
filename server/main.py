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


@app.post("/lesson", response_model=LessonResponse)
async def lesson(req: LessonRequest) -> LessonResponse:
    """Build a watch-and-learn mouth-step lesson for a word or sentence."""
    clean = " ".join((req.text or "").strip().split())
    if not clean:
        return _heuristic_lesson("ah", req.kind)
    refined = await _ollama_lesson(clean, req.kind)
    return refined or _heuristic_lesson(clean, req.kind)
