# Speak & See

Speech companion for Deaf/HoH users — Superhuman Lab hackathon.

## App

```bash
cd web
npm install
npm run dev
```

Brand tokens live in `brand/` (shared reference) and are copied into `web/src/` for the app (`tokens.css`, `grid.css`).

## Routes

- `/` — Landing (SLP · Speech Guide)
- `/slp` — Speech-Language Pathology path
- `/guide` — Personal Trainer · Live Guide
- `/guide/trainer` — Personal Trainer dashboard (camera, lips, transcript, spectrogram)
- `/guide/live` — Live Guide dashboard (same layout)

## Speech Guide stack (current)

- **MediaPipe Face Landmarker** — local lip landmarks + mouth crop
- **Web Audio** — live spectrogram + volume/pitch hints for tone colors
- **Web Speech API** — interim STT (browser); local Whisper / quantized reasoning comes next
- Shared dashboard for both modes; Start session requests camera + mic
