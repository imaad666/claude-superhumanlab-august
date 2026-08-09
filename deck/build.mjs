/**
 * Speak & See — 4-slide deck (PptxGenJS)
 * Run: npm run build
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import PptxGenJS from "pptxgenjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SHOTS = path.join(ROOT, "screenshots");
const STOCK = path.join(ROOT, "assets");
const OUT = path.join(ROOT, "Speak-and-See-Deck.pptx");

// Editorial palette — flat, high contrast
const C = {
  bg: "FFFFFF",
  ink: "111111",
  mute: "555555",
  faint: "888888",
  rule: "DDDDDD",
  accent: "C44A12",
  field: "F3F3F1",
  dark: "1A1A1A",
};

function shot(name) {
  const p = path.join(SHOTS, name);
  if (!fs.existsSync(p)) throw new Error(`Missing screenshot: ${name}`);
  return p;
}

function stock(name) {
  const p = path.join(STOCK, name);
  return fs.existsSync(p) ? p : null;
}

async function build() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "WIDE";
  pptx.author = "Speak & See";
  pptx.title = "Speak & See";

  // ─── 1 · SLP ───────────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.background = { color: C.bg };

    s.addText("01  /  SLP", {
      x: 0.55,
      y: 0.35,
      w: 4,
      h: 0.3,
      fontSize: 11,
      fontFace: "Arial",
      color: C.faint,
      bold: true,
      charSpacing: 4,
    });

    s.addText("Speech-language therapy\nis a closed room.", {
      x: 0.55,
      y: 0.75,
      w: 7.2,
      h: 1.5,
      fontSize: 34,
      fontFace: "Arial",
      color: C.ink,
      bold: true,
      margin: 0,
      valign: "top",
    });

    s.addText(
      "A clinician models sounds. A child imitates. Feedback is rich, live, and human — for 30–45 minutes. Then the door closes.",
      {
        x: 0.55,
        y: 2.35,
        w: 6.4,
        h: 1.0,
        fontSize: 15,
        fontFace: "Arial",
        color: C.mute,
        margin: 0,
      },
    );

    const gaps = [
      {
        n: "01",
        t: "Live correction",
        d: "Works in session. Vanishes the second practice moves home.",
      },
      {
        n: "02",
        t: "Paper notes",
        d: "Written after the fact. No replay of mouth shape, tone, or volume.",
      },
      {
        n: "03",
        t: "Home homework",
        d: "Assigned without sensors. Parents guess what “good” looked like.",
      },
      {
        n: "04",
        t: "Next week",
        d: "Carryover is thin. Sessions often restart colder than they should.",
      },
    ];

    gaps.forEach((g, i) => {
      const y = 3.5 + i * 0.9;
      s.addText(g.n, {
        x: 0.55,
        y,
        w: 0.55,
        h: 0.35,
        fontSize: 14,
        fontFace: "Arial",
        color: C.accent,
        bold: true,
        margin: 0,
      });
      s.addText(g.t, {
        x: 1.2,
        y,
        w: 2.4,
        h: 0.35,
        fontSize: 14,
        fontFace: "Arial",
        color: C.ink,
        bold: true,
        margin: 0,
      });
      s.addText(g.d, {
        x: 3.7,
        y,
        w: 3.4,
        h: 0.7,
        fontSize: 13,
        fontFace: "Arial",
        color: C.mute,
        margin: 0,
      });
    });

    const a = stock("therapy-child.jpg");
    const b = stock("therapy-notes.jpg");
    if (a) {
      s.addImage({
        path: a,
        x: 7.6,
        y: 0.35,
        w: 5.2,
        h: 3.45,
        sizing: { type: "cover", w: 5.2, h: 3.45 },
      });
    } else {
      s.addShape(pptx.ShapeType.rect, {
        x: 7.6,
        y: 0.35,
        w: 5.2,
        h: 3.45,
        fill: { color: C.field },
        line: { color: C.rule },
      });
    }
    if (b) {
      s.addImage({
        path: b,
        x: 7.6,
        y: 3.95,
        w: 5.2,
        h: 3.15,
        sizing: { type: "cover", w: 5.2, h: 3.15 },
      });
    }
    s.addText("Clinic → notes → home gap", {
      x: 7.7,
      y: 7.0,
      w: 5.0,
      h: 0.3,
      fontSize: 11,
      fontFace: "Arial",
      color: C.faint,
      margin: 0,
    });
  }

  // ─── 2 · Problem ───────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.background = { color: C.dark };

    s.addText("02  /  PROBLEM", {
      x: 0.55,
      y: 0.4,
      w: 4,
      h: 0.3,
      fontSize: 11,
      fontFace: "Arial",
      color: "888888",
      bold: true,
      charSpacing: 4,
    });

    s.addText("The feedback loop\nbreaks after the session.", {
      x: 0.55,
      y: 1.0,
      w: 12,
      h: 1.6,
      fontSize: 36,
      fontFace: "Arial",
      color: "FFFFFF",
      bold: true,
      margin: 0,
    });

    const cols = [
      {
        h: "No shared visual",
        b: "Families leave without a picture of the target mouth. Practice becomes imitation of memory.",
      },
      {
        h: "No live signal",
        b: "Volume, pitch, smile, jaw — none of it is instrumented between visits.",
      },
      {
        h: "No durable lesson",
        b: "What the therapist modeled can’t be replayed as a mouth-shape lesson at home.",
      },
    ];

    cols.forEach((c, i) => {
      const x = 0.55 + i * 4.15;
      s.addShape(pptx.ShapeType.rect, {
        x,
        y: 3.2,
        w: 0.5,
        h: 0.06,
        fill: { color: C.accent },
        line: { color: C.accent },
      });
      s.addText(c.h, {
        x,
        y: 3.5,
        w: 3.9,
        h: 0.5,
        fontSize: 18,
        fontFace: "Arial",
        color: "FFFFFF",
        bold: true,
        margin: 0,
      });
      s.addText(c.b, {
        x,
        y: 4.15,
        w: 3.9,
        h: 1.6,
        fontSize: 14,
        fontFace: "Arial",
        color: "BBBBBB",
        margin: 0,
      });
    });

    s.addText(
      "Speak & See exists to keep the clinician’s model alive between appointments.",
      {
        x: 0.55,
        y: 6.6,
        w: 12,
        h: 0.4,
        fontSize: 14,
        fontFace: "Arial",
        color: "999999",
        italic: true,
        margin: 0,
      },
    );
  }

  // All user screenshots are 1024×640 (1.6:1) — never stretch or cover-crop.
  const SHOT_AR = 1024 / 640;

  function placeShot(slide, file, x, y, maxW, maxH) {
    let w = maxW;
    let h = w / SHOT_AR;
    if (h > maxH) {
      h = maxH;
      w = h * SHOT_AR;
    }
    slide.addImage({
      path: shot(file),
      x,
      y,
      w,
      h,
    });
    return { w, h };
  }

  // ─── 3 · Product ───────────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.background = { color: C.bg };

    s.addText("03  /  SPEAK & SEE", {
      x: 0.55,
      y: 0.28,
      w: 5,
      h: 0.26,
      fontSize: 11,
      fontFace: "Arial",
      color: C.faint,
      bold: true,
      charSpacing: 4,
    });

    s.addText("What we built", {
      x: 0.55,
      y: 0.55,
      w: 6,
      h: 0.4,
      fontSize: 28,
      fontFace: "Arial",
      color: C.ink,
      bold: true,
      margin: 0,
    });

    s.addText(
      "A speech companion with two doors: an SLP path that turns therapy targets into home practice, and a Speech Guide that coaches the mouth in real time — lips, voice, and tone.",
      {
        x: 0.55,
        y: 1.0,
        w: 12.2,
        h: 0.55,
        fontSize: 14,
        fontFace: "Arial",
        color: C.mute,
        margin: 0,
      },
    );

    // Landing — native ratio
    placeShot(s, "02-landing.png", 0.55, 1.7, 6.6, 4.2);

    // Content column
    const blocks = [
      {
        k: "SLP — for younger learners",
        lines: [
          "Therapist assigns minimal-pair words and therapy sounds from a Speech Alphabet (IPA-ish cells).",
          "SIMPLE session worksheet: topic → targets → schedule → activities → vocab — Gemma can expand the plan.",
          "Learner opens “Practice next” and jumps straight into camera practice; progress logs stay on-device.",
        ],
      },
      {
        k: "Speech Guide — trainer & live",
        lines: [
          "Personal Trainer: MediaPipe lip mesh + live cues (“open a little more”) with open/wide/round meters.",
          "Live Guide: record a teacher speaking, then build word lessons from their real lip vectors.",
          "Voice wave runs continuously for the take — loud / happy / mid / shallow baselines, not a resetting spectrogram.",
        ],
      },
    ];

    let y = 1.7;
    blocks.forEach((b) => {
      s.addText(b.k, {
        x: 7.5,
        y,
        w: 5.3,
        h: 0.32,
        fontSize: 13,
        fontFace: "Arial",
        color: C.accent,
        bold: true,
        margin: 0,
      });
      y += 0.36;
      b.lines.forEach((line) => {
        s.addText("·  " + line, {
          x: 7.5,
          y,
          w: 5.3,
          h: 0.72,
          fontSize: 12,
          fontFace: "Arial",
          color: C.mute,
          margin: 0,
          valign: "top",
        });
        y += 0.68;
      });
      y += 0.12;
    });

    s.addText(
      "Stack: MediaPipe lips · browser STT · Gemma (plans / lessons / cues) · local progress store",
      {
        x: 0.55,
        y: 7.05,
        w: 12.2,
        h: 0.28,
        fontSize: 11,
        fontFace: "Arial",
        color: C.faint,
        margin: 0,
      },
    );
  }

  // ─── 4 · How the loop closes ───────────────────────────────────────
  {
    const s = pptx.addSlide();
    s.background = { color: C.bg };

    s.addText("04  /  THE LOOP", {
      x: 0.55,
      y: 0.22,
      w: 5,
      h: 0.24,
      fontSize: 11,
      fontFace: "Arial",
      color: C.faint,
      bold: true,
      charSpacing: 4,
    });

    s.addText("Assign → practice → coach → measure", {
      x: 0.55,
      y: 0.48,
      w: 12,
      h: 0.38,
      fontSize: 24,
      fontFace: "Arial",
      color: C.ink,
      bold: true,
      margin: 0,
    });

    // Flow strip
    const steps = [
      ["1. Assign", "SLP picks sounds & words"],
      ["2. Practice", "Learner taps Practice →"],
      ["3. Coach", "Lips + voice wave + cues"],
      ["4. Measure", "By-sound accuracy over time"],
    ];
    steps.forEach((st, i) => {
      const x = 0.55 + i * 3.2;
      s.addText(st[0], {
        x,
        y: 0.95,
        w: 3.0,
        h: 0.28,
        fontSize: 13,
        fontFace: "Arial",
        color: C.accent,
        bold: true,
        margin: 0,
      });
      s.addText(st[1], {
        x,
        y: 1.22,
        w: 3.0,
        h: 0.28,
        fontSize: 12,
        fontFace: "Arial",
        color: C.mute,
        margin: 0,
      });
    });

    // Row 1: SLP alphabet + callouts
    placeShot(s, "03-slp-alphabet.png", 0.55, 1.65, 5.5, 2.5);
    s.addText("Therapist side", {
      x: 6.3,
      y: 1.65,
      w: 6.4,
      h: 0.28,
      fontSize: 12,
      fontFace: "Arial",
      color: C.ink,
      bold: true,
      margin: 0,
    });
    const therapistBits = [
      "Speech Alphabet: tap a live sound cell to add its bank words to the assign set.",
      "Minimal pairs (S vs SH, SH vs CH…) with per-word scores when logged.",
      "Progress panel: 92% avg in this take — green bars for strong sounds, brown for targets still weak.",
    ];
    therapistBits.forEach((t, i) => {
      s.addText("·  " + t, {
        x: 6.3,
        y: 2.0 + i * 0.55,
        w: 6.4,
        h: 0.55,
        fontSize: 12,
        fontFace: "Arial",
        color: C.mute,
        margin: 0,
        valign: "top",
      });
    });

    // Row 2: practice + trainer side by side (native ratio)
    const row2Y = 4.35;
    placeShot(s, "01-practice-progress.png", 0.55, row2Y, 4.15, 2.7);
    placeShot(s, "04-trainer.png", 4.9, row2Y, 4.15, 2.7);

    s.addText("Practice next + by-sound bars", {
      x: 9.25,
      y: row2Y,
      w: 3.6,
      h: 0.35,
      fontSize: 11,
      fontFace: "Arial",
      color: C.ink,
      bold: true,
      margin: 0,
    });
    s.addText(
      "Assigned words open the trainer. Accuracy rolls up per phoneme so the next session isn’t a black box.",
      {
        x: 9.25,
        y: row2Y + 0.4,
        w: 3.6,
        h: 1.0,
        fontSize: 11,
        fontFace: "Arial",
        color: C.mute,
        margin: 0,
      },
    );
    s.addText("Live lip coach", {
      x: 9.25,
      y: row2Y + 1.45,
      w: 3.6,
      h: 0.3,
      fontSize: 11,
      fontFace: "Arial",
      color: C.ink,
      bold: true,
      margin: 0,
    });
    s.addText(
      "Landmark follow, step cues (heh · eh · ll · oh), brain meters, and a continuous voice wave with loud/happy/mid/shallow lines.",
      {
        x: 9.25,
        y: row2Y + 1.8,
        w: 3.6,
        h: 1.1,
        fontSize: 11,
        fontFace: "Arial",
        color: C.mute,
        margin: 0,
      },
    );
  }

  await pptx.writeFile({ fileName: OUT });
  console.log("Wrote", OUT);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
