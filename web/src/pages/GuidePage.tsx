import { Link } from "react-router-dom";

export function GuidePage() {
  return (
    <main className="landing landing-narrow">
      <Link className="back" to="/">
        ← Speak &amp; See
      </Link>

      <header className="landing-hero">
        <p className="eyebrow">Speech Guide</p>
        <h1 className="brand brand-sm">Pick your mode</h1>
        <p className="lede">
          Practice your own voice, or listen along when someone else is
          speaking.
        </p>
      </header>

      <nav className="paths" aria-label="Choose a mode">
        <Link className="path" to="/guide/trainer">
          <span className="path-title">Personal Trainer</span>
          <span className="path-desc">
            Face the camera. Speak. Get encouraging, word-by-word feedback on
            pronunciation, tone, and stress.
          </span>
          <span className="btn btn-accent btn-in-card">Start practice →</span>
        </Link>

        <Link className="path" to="/guide/live">
          <span className="path-title">Live Guide</span>
          <span className="path-desc">
            Point the camera at a teacher or friend — see tone, emphasis, and
            speech patterns in real time.
          </span>
          <span className="btn btn-primary btn-in-card">Start live →</span>
        </Link>
      </nav>
    </main>
  );
}
