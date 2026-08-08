#!/usr/bin/env bash
# Unified Speak & See launcher — wakes Ollama model, brain API, and Vite.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="${OLLAMA_MODEL:-gemma3:4b}"
BRAIN_PORT="${BRAIN_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

log() { printf '\n▸ %s\n' "$*"; }

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing: $1"
    return 1
  fi
}

# --- Ollama ---
log "Checking Ollama"
if ! command -v ollama >/dev/null 2>&1; then
  log "Installing Ollama via Homebrew…"
  need_cmd brew
  brew install ollama
fi

if ! curl -sf "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
  log "Starting ollama serve…"
  # macOS app / brew service
  if command -v brew >/dev/null 2>&1 && brew services list 2>/dev/null | grep -q ollama; then
    brew services start ollama >/dev/null 2>&1 || true
  fi
  nohup ollama serve >/tmp/speak-see-ollama.log 2>&1 &
  for _ in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

if ! curl -sf "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
  echo "Ollama did not start. Install from https://ollama.com/download and retry."
  echo "Heuristic brain will still work."
else
  log "Ensuring vision model $MODEL (~3.3GB)…"
  ollama pull "$MODEL"
fi

# --- Python brain ---
log "Starting brain on :$BRAIN_PORT"
cd "$ROOT/server"
if [[ ! -x .venv/bin/uvicorn ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

if lsof -tiTCP:"$BRAIN_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  log "Brain already listening on :$BRAIN_PORT"
else
  OLLAMA_MODEL="$MODEL" nohup .venv/bin/uvicorn main:app --host 127.0.0.1 --port "$BRAIN_PORT" \
    >/tmp/speak-see-brain.log 2>&1 &
  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:$BRAIN_PORT/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
fi

log "Warming model via /wake…"
curl -sf -X POST "http://127.0.0.1:$BRAIN_PORT/wake" || true
echo

# --- Vite ---
log "Starting web on :$WEB_PORT"
cd "$ROOT/web"
if [[ ! -d node_modules ]]; then
  npm install
fi

export OLLAMA_MODEL="$MODEL"
exec npm run dev -- --host 127.0.0.1 --port "$WEB_PORT"
