import { Link } from "react-router-dom";

export function SlpPage() {
  return (
    <main className="landing landing-narrow">
      <Link className="back" to="/">
        ← Speak &amp; See
      </Link>

      <header className="landing-hero">
        <p className="eyebrow">Speech-Language Pathology</p>
        <h1 className="brand brand-sm">Coming next</h1>
        <p className="lede">
          Therapist-led content for younger learners will live here. For the
          hackathon, we’re building Speech Guide first.
        </p>
      </header>

      <Link className="btn btn-primary" to="/guide">
        Go to Speech Guide →
      </Link>
    </main>
  );
}
