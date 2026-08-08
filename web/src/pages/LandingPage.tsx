import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-hero">
        <p className="eyebrow">Speech companion</p>
        <h1 className="brand">Speak &amp; See</h1>
        <p className="lede">
          Practice and understand speech with a quiet, private feedback loop.
        </p>
      </header>

      <nav className="paths" aria-label="Choose a path">
        <Link className="path" to="/slp">
          <span className="path-kicker">Young learners</span>
          <span className="path-title">
            SLP — Speech-Language Pathology
          </span>
          <span className="path-desc">
            Built for younger kids just starting out — encouraging practice that
            complements therapist-led sessions between visits.
          </span>
          <span className="path-cta">Enter →</span>
        </Link>

        <Link className="path" to="/guide">
          <span className="path-kicker">Live speech</span>
          <span className="path-title">Speech Guide</span>
          <span className="path-desc">
            Practice your own speech, or read tone and emphasis when someone
            else is speaking.
          </span>
          <span className="path-cta">Enter →</span>
        </Link>
      </nav>
    </main>
  );
}
