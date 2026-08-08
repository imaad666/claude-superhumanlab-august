"""
Local speech-companion brain.

Pipeline:
  MediaPipe lips + blendshapes + spectrogram features + transcript
    → heuristic fusion (always works)
    → optional Ollama Gemma/Qwen refinement (when installed)

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
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:2b")

app = FastAPI(title="Speak & See Brain", version="0.1.0")
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
    """From MediaPipe face blendshapes — lightweight 'mood from face' factor."""

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

    # Tone from voice
    if vol < 0.03:
        tone: Tone = "soft"
    elif pitch > 0.48 and vol > 0.08:
        tone = "bright"
    elif smile > 0.35 or (vol > 0.06 and pitch > 0.3):
        tone = "warm"
    else:
        tone = "calm"

    # Mood from face + voice
    if smile > 0.45 and vol > 0.04:
        mood: Mood = "playful" if pitch > 0.4 else "encouraging"
    elif brow_down > 0.35:
        mood = "serious"
    elif brow_up > 0.3 and pitch > 0.35:
        mood = "curious"
    elif vol < 0.025:
        mood = "tired"
    else:
        mood = "neutral"

    text = (req.transcript or " ".join(req.recent_words)).strip().lower()
    if "?" in text or text.startswith(("what", "why", "how", "when", "where", "who", "can", "do ", "is ")):
        intention: Intention = "asking"
    elif any(g in text for g in ("hi", "hello", "hey", "good morning", "namaste")):
        intention = "greeting"
    elif req.mode == "trainer":
        intention = "practicing"
    elif tone == "bright":
        intention = "emphasizing"
    elif len(text.split()) > 6:
        intention = "explaining"
    else:
        intention = "unknown"

    target = (req.coach_target or req.lips.viseme_guess or "rest").upper()
    lip_match, lip_cue = _lip_coaching(target, req.lips, funnel, jaw)

    summary = _summary(req.mode, tone, mood, intention, lip_cue)

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
        if funnel > 0.25 or lips.roundness > 0.45:
            return "good", "Nice round lips — keep that circle."
        if lips.roundness > 0.25:
            return "close", "Almost — purse lips a bit more into a soft O."
        return "try_again", "Round your lips like saying “oh.”"
    if t in {"U", "OO"}:
        if funnel > 0.3 or (lips.roundness > 0.5 and lips.openness < 0.35):
            return "good", "Tight round “oo” — looking good."
        return "close", "Smaller round opening — push lips forward a little."
    if t in {"A", "AH"}:
        if jaw > 0.35 or lips.openness > 0.4:
            return "good", "Jaw open — clear “ah.”"
        return "close", "Drop your jaw a bit more for “ah.”"
    if t in {"E", "EH", "I", "EE"}:
        if lips.width > 0.45:
            return "good", "Wide smile shape — nice."
        return "close", "Pull lips wider to the sides."
    if t in {"M", "MM", "B", "P"}:
        if lips.openness < 0.12:
            return "good", "Lips together — perfect for “mm.”"
        return "try_again", "Press lips gently closed."
    if lips.openness > 0.15 or lips.width > 0.3:
        return "close", "Keep practicing — watch the coach mouth."
    return "close", "Relax, then copy the coach shape."


def _summary(mode: str, tone: Tone, mood: Mood, intention: Intention, lip_cue: str) -> str:
    if mode == "trainer":
        return f"Your voice feels {tone}, mood reads {mood}. {lip_cue}"
    return f"They sound {tone} and {mood}, likely {intention}. {lip_cue}"


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
expression_blendshapes={req.expression.model_dump()}
coach_target={req.coach_target}
heuristic_guess={base.model_dump(exclude={'words','source','model'})}
"""

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2, "num_predict": 220},
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


@app.get("/health")
async def health() -> dict[str, Any]:
    ollama_ok = False
    models: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            res = await client.get(f"{OLLAMA_URL}/api/tags")
            if res.status_code == 200:
                ollama_ok = True
                models = [m.get("name", "") for m in res.json().get("models", [])]
    except Exception:
        ollama_ok = False
    return {
        "ok": True,
        "ollama": ollama_ok,
        "model": OLLAMA_MODEL,
        "models": models,
        "fallback": "heuristic",
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    base = _heuristic(req)
    refined = await _ollama_refine(req, base)
    return refined or base
