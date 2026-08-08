import { Link } from "react-router-dom";
import { RotatingLabel } from "../components/RotatingLabel";

const slpPhrases = [
  "For young learners",
  "Made for kids",
  "Gentle first steps",
  "Practice between therapy",
];

const guidePhrases = [
  "Practice your voice",
  "Read someone’s tone",
  "Record, then review",
  "Train anytime",
];

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-hero">
        <p className="eyebrow">Speech companion</p>
        <h1 className="brand">Speak &amp; See</h1>
        <p className="lede">
          Learn to speak with confidence — practice, play, and get gentle
          feedback anytime.
        </p>
      </header>

      <nav className="paths" aria-label="Choose a path">
        <Link className="path path-slp" to="/slp">
          <span className="path-title">
            SLP — Speech-Language Pathology
          </span>
          <span className="path-desc">
            Friendly practice for younger kids just starting out — builds on
            what they learn with a therapist.
          </span>
          <span className="path-footer">
            <RotatingLabel phrases={slpPhrases} variant="kids" />
            <span className="btn btn-accent btn-in-card">Let’s go →</span>
          </span>
        </Link>

        <Link className="path path-guide" to="/guide">
          <span className="path-title">Speech Guide</span>
          <span className="path-desc">
            Practice your own voice, or watch someone else speak and see tone,
            stress, and rhythm light up.
          </span>
          <span className="path-footer">
            <RotatingLabel phrases={guidePhrases} variant="guide" />
            <span className="btn btn-success btn-in-card">Let’s go →</span>
          </span>
        </Link>
      </nav>

      <section className="fun-strip" aria-label="Quick starts">
        <p className="fun-strip-label">Or jump straight in</p>
        <div className="fun-strip-actions">
          <Link className="chip" to="/guide/trainer">
            Personal Trainer
          </Link>
          <Link className="chip" to="/guide/live">
            Live Guide
          </Link>
          <Link className="chip" to="/slp">
            SLP for kids
          </Link>
        </div>
      </section>
    </main>
  );
}
