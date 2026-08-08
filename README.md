# Speak & See

Speech companion for Deaf/HoH users — Superhuman Lab hackathon.

## One command (recommended)

```bash
npm run dev
```

This wakes **Ollama + `qwen2.5:0.5b`** (~398MB quantized), the FastAPI brain on `:8000`, and Vite on `:5173`.

Open http://127.0.0.1:5173 — press **Start** and the UI also hits `/api/wake` so the model is warm.

## Model choice (space-tight)

| Model | Disk | Why |
|-------|------|-----|
| **`qwen2.5:0.5b`** (default) | ~398MB | Best tiny structured-JSON coach; Q4 quant |
| `qwen2.5:1.5b` | ~986MB | Clearer tips if you can spare ~1GB |
| `gemma2:2b` | ~1.6GB | Fine, but heavier for this task |

Override anytime:

```bash
OLLAMA_MODEL=qwen2.5:1.5b npm run dev
```

## Manual (two terminals)

```bash
# Brain
cd server && source .venv/bin/activate
OLLAMA_MODEL=qwen2.5:0.5b uvicorn main:app --port 8000

# Web
cd web && npm run dev
```

Health: http://127.0.0.1:8000/health · Wake: `npm run wake`

## Architecture

| Signal | Source | Job |
|--------|--------|-----|
| Lips | MediaPipe Face Landmarker | Shape match |
| Expression | MediaPipe blendshapes | Mood factor |
| Pitch / energy | Web Audio | Tone factor |
| Words | Web Speech API | Transcript |
| Brain | Heuristic (instant) → Qwen via Ollama | Tone, mood, intention, lip cues |

Heuristic is the snappy always-on layer. Qwen refines when Ollama is awake.
