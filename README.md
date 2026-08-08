# Speak & See

Speech companion for Deaf/HoH users — Superhuman Lab hackathon.

## Run

```bash
# Terminal 1 — local brain
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Optional richer brain
# brew install ollama && ollama pull gemma2:2b
# export OLLAMA_MODEL=gemma2:2b

# Terminal 2 — web
cd web
npm install
npm run dev
```

Open http://127.0.0.1:5173

## Architecture

| Signal | Source | Job |
|--------|--------|-----|
| Lips | MediaPipe Face Landmarker | Lip training / shape match |
| Expression | MediaPipe blendshapes | Mood factor (smile, brows, jaw) |
| Pitch / energy | Web Audio spectrogram | Tone factor |
| Words | Web Speech API | Transcript |
| Brain | FastAPI heuristic → optional Ollama Gemma/Qwen | Tone, mood, intention, lip cues |

No cloud LLM. Heuristic works without Ollama; install Gemma/Qwen for richer summaries.

## Routes

- `/` — Landing
- `/guide` — mode pick
- `/guide/trainer` — Personal Trainer
- `/guide/live` — Live Guide
