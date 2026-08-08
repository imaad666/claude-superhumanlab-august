import { Link } from "react-router-dom";

export function GuidePage() {
  return (
    <main className="landing landing-narrow">
      <Link className="back" to="/">
        ← Speak &amp; See
      </Link>

      <header className="landing-hero">
        <p className="eyebrow">Speech Guide</p>
        <h1 className="brand brand-sm">How do you want to listen?</h1>
        <p className="lede">
          Two modes — one for practicing your own voice, one for reading someone
          else’s.
        </p>
      </header>

      <nav className="paths" aria-label="Choose a mode">
        <Link className="path" to="/guide/trainer">
          <span className="path-kicker">You</span>
          <span className="path-title">Personal Trainer</span>
          <span className="path-desc">
            Face the camera. Speak. Get encouraging, word-by-word feedback on
            pronunciation, tone, and stress.
          </span>
          <span className="path-cta">Start practice →</span>
        </Link>

        <Link className="path" to="/guide/live">
          <span className="path-kicker">Someone else</span>
          <span className="path-title">Live Guide</span>
          <span className="path-desc">
            Point the camera at a speaker — a teacher, a friend — and see tone,
            emphasis, and speech patterns in real time.
          </span>
          <span className="path-cta">Start live →</span>
        </Link>
      </nav>
    </main>
  );
}
