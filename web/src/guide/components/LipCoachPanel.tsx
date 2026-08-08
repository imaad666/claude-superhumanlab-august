import { useEffect, useMemo, useState } from "react";
import { VISEMES, type VisemeGuide, type VisemeId } from "../visemes";

type LipCoachPanelProps = {
  /** Suggested target from live speech; user can still pick manually */
  suggestedId?: VisemeId;
  mode: "trainer" | "live";
};

export function LipCoachPanel({ suggestedId = "rest", mode }: LipCoachPanelProps) {
  const [selectedId, setSelectedId] = useState<VisemeId>(suggestedId);
  const [followLive, setFollowLive] = useState(true);

  useEffect(() => {
    if (followLive) setSelectedId(suggestedId);
  }, [followLive, suggestedId]);

  const guide = useMemo(
    () => VISEMES.find((item) => item.id === selectedId) ?? VISEMES[0],
    [selectedId],
  );

  return (
    <section className="guide-panel coach-panel">
      <header className="guide-panel-head">
        <div>
          <h2>Lip coach</h2>
          <p className="guide-sub">
            {mode === "trainer"
              ? "Match this mouth shape with yours"
              : "See the shape that fits what you’re hearing"}
          </p>
        </div>
        <button
          type="button"
          className={`btn btn-ghost btn-compact ${followLive ? "is-active" : ""}`}
          onClick={() => setFollowLive((value) => !value)}
        >
          {followLive ? "Following speech" : "Manual pick"}
        </button>
      </header>

      <div className="coach-body">
        <GuideMouth guide={guide} />

        <div className="coach-copy">
          <p className="coach-sound">
            <span>{guide.label}</span>
            <span className="coach-ipa">{guide.sound}</span>
          </p>
          <p className="coach-cue">{guide.cue}</p>
          <p className="coach-tip">{guide.tip}</p>
        </div>
      </div>

      <div className="coach-picks" role="list" aria-label="Practice shapes">
        {VISEMES.filter((item) => item.id !== "rest").map((item) => (
          <button
            key={item.id}
            type="button"
            role="listitem"
            className={`coach-pick ${selectedId === item.id ? "is-selected" : ""}`}
            onClick={() => {
              setFollowLive(false);
              setSelectedId(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function GuideMouth({ guide }: { guide: VisemeGuide }) {
  return (
    <div className="guide-mouth" aria-hidden="true">
      <svg viewBox="0 0 120 120" className="guide-mouth-svg">
        <defs>
          <radialGradient id="mouthSkin" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#f3c4a4" />
            <stop offset="100%" stopColor="#d59a78" />
          </radialGradient>
          <linearGradient id="lipPink" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8897a" />
            <stop offset="100%" stopColor="#c45c4a" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="52" fill="url(#mouthSkin)" opacity="0.35" />
        <path
          className="mouth-outer"
          d={guide.outer}
          fill="url(#lipPink)"
          stroke="#9a3f32"
          strokeWidth="1.5"
        />
        <path
          className="mouth-open"
          d={guide.opening}
          fill="#2a1f16"
          stroke="#1a1410"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
