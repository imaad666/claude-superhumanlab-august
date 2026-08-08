"""
Local speech-companion brain.

Pipeline:
  MediaPipe lips + blendshapes + spectrogram features + transcript
    → heuristic fusion (always-on, snappy)
    → optional Ollama Qwen refinement when model is awake

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
# ~398MB Q4 quant — strong at structured JSON, tiny on disk
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")

app = FastAPI(title="Speak & See Brain", version="0.2.0")
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
    base = name.split(":")[0]
    return any(m == name or m.startswith(f"{name}") or m.startswith(f"{base}:") for m in models)


async def _ollama_pull(model: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=600.0) as client:
        res = await client.post(f"{OLLAMA_URL}/api/pull", json={"name": model, "stream": False})
        res.raise_for_status()
        return res.json() if res.content else {"status": "ok"}


async def _ollama_warmup(model: str) -> bool:
    payload = {
        "model": model,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.1, "num_predict": 40},
        "messages": [
            {
                "role": "system",
                "content": "Return JSON only: {\"ok\":true}",
            },
            {"role": "user", "content": "ping"},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            res.raise_for_status()
            return True
    except Exception:
        return False


async def _ollama_refine(req: AnalyzeRequest, base: AnalyzeResponse) -> AnalyzeResponse | None:
    prompt = f"""You help Deaf/hard-of-hearing users understand speech tone and practice lip shapes.
Be encouraging, never harsh. Return ONLY valid JSON with keys:
tone (calm|warm|bright|soft), mood (encouraging|curious|serious|playful|tired|neutral),
intention (greeting|asking|explaining|practicing|emphasizing|unknown),
summary (one short sentence), lip_match (good|close|try_again), lip_cue (one short tip).

Signals:
mode={req.mode}
transcript={req.transcript!r}
recent_words={req.recent_words[-8:]}
lips={req.lips.model_dump()}
audio={req.audio.model_dump()}
expression={req.expression.model_dump()}
coach_target={req.coach_target}
heuristic={base.model_dump(exclude={"words", "source", "model"})}
"""

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2, "num_predict": 180},
        "messages": [
            {
                "role": "system",
                "content": "You are Speak & See local brain. Output JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            res = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            res.raise_for_status()
            data = res.json()
            content = data.get("message", {}).get("content", "")
            parsed = _extract_json(content)
            if not parsed:
                return None
            return AnalyzeResponse(
                tone=parsed.get("tone", base.tone),
                mood=parsed.get("mood", base.mood),
                intention=parsed.get("intention", base.intention),
                summary=parsed.get("summary", base.summary),
                lip_match=parsed.get("lip_match", base.lip_match),
                lip_cue=parsed.get("lip_cue", base.lip_cue),
                words=base.words,
                source="ollama",
                model=OLLAMA_MODEL,
            )
    except Exception:
        return None


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


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "name": "Speak & See Brain",
        "ok": True,
        "docs": "/docs",
        "health": "/health",
        "wake": "/wake",
        "analyze": "POST /analyze",
        "model": OLLAMA_MODEL,
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
        "models": models,
        "fallback": "heuristic",
    }


@app.post("/wake")
async def wake() -> dict[str, Any]:
    """Ensure Ollama is up, model is pulled, and weights are warm in memory."""
    ollama_ok, models = await _ollama_tags()
    if not ollama_ok:
        return {
            "ok": False,
            "ollama": False,
            "model": OLLAMA_MODEL,
            "model_ready": False,
            "warm": False,
            "error": "Ollama not running. Start with: ollama serve",
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
        "fallback": "heuristic",
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    base = _heuristic(req)
    refined = await _ollama_refine(req, base)
    return refined or base
