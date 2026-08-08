import { Link } from "react-router-dom";

export function LivePage() {
  return (
    <main className="landing landing-narrow">
      <Link className="back" to="/guide">
        ← Speech Guide
      </Link>

      <header className="landing-hero">
        <p className="eyebrow">Live Guide</p>
        <h1 className="brand brand-sm">Live capture shell</h1>
        <p className="lede">
          Point-at-speaker capture and tone readout lands here next. Route is
          ready for the speech agent.
        </p>
      </header>
    </main>
  );
}
