# Speak & See — local brain

Fuses **MediaPipe lip features**, **face blendshapes** (expression/mood factor), **spectrogram/pitch**, and **transcript** into tone / mood / intention / lip coaching.

Runs fully local. Uses **Ollama (Gemma/Qwen)** when available; otherwise a built-in heuristic so the prototype still works.

## Setup

```bash
# 1) Python deps
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2) Install Ollama (macOS)
# https://ollama.com/download
# then:
ollama pull gemma2:2b
# or: ollama pull qwen2.5:3b

# 3) Run API
uvicorn main:app --reload --port 8000
```

Env (optional):

```bash
export OLLAMA_MODEL=qwen2.5:3b
export OLLAMA_URL=http://127.0.0.1:11434
```

## Endpoints

- `GET /health` — brain + Ollama status
- `POST /analyze` — feature JSON → coaching JSON

The Vite app proxies `/api/*` → `http://127.0.0.1:8000/*`.
