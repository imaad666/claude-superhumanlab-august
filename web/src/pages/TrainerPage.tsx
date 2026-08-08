import { Link } from "react-router-dom";

export function TrainerPage() {
  return (
    <main className="landing landing-narrow">
      <Link className="back" to="/guide">
        ← Speech Guide
      </Link>

      <header className="landing-hero">
        <p className="eyebrow">Personal Trainer</p>
        <h1 className="brand brand-sm">Practice shell</h1>
        <p className="lede">
          Camera + mic feedback lands here next. This route is ready for
          MediaPipe and the speech agent.
        </p>
      </header>
    </main>
  );
}
