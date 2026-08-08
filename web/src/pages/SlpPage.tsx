import { Link } from "react-router-dom";

export function SlpPage() {
  return (
    <main className="landing landing-narrow">
      <Link className="back" to="/">
        ← Speak &amp; See
      </Link>

      <header className="landing-hero">
        <p className="eyebrow">Speech-Language Pathology</p>
        <h1 className="brand brand-sm">Made for young learners</h1>
        <p className="lede">
          Therapist-led content for kids will live here. For the hackathon,
          Speech Guide is ready to explore.
        </p>

        <div className="hero-actions">
          <Link className="btn btn-accent" to="/guide">
            Try Speech Guide
          </Link>
          <Link className="btn btn-ghost" to="/guide/trainer">
            Quick practice
          </Link>
        </div>
      </header>
    </main>
  );
}
