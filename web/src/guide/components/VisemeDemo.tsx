import { VISEMES, type VisemeId } from "../visemes";

type VisemeDemoProps = {
  viseme: VisemeId;
  speakAs?: string;
  label?: string;
};

/**
 * Readable 2D coach mouth for Watch phase — uses hand-tuned viseme SVGs,
 * not synthetic MediaPipe landmarks (those crumple the 3D mesh).
 */
export function VisemeDemo({ viseme, speakAs, label }: VisemeDemoProps) {
  const guide = VISEMES.find((v) => v.id === viseme) ?? VISEMES[0];

  return (
    <div className="viseme-demo" aria-label={`Mouth shape ${guide.label}`}>
      <svg
        className="viseme-demo-svg"
        viewBox="0 0 120 110"
        role="img"
        aria-hidden={false}
      >
        <title>
          {label ?? guide.label}
          {speakAs ? ` — ${speakAs}` : ""}
        </title>
        {/* soft face plate */}
        <ellipse cx="60" cy="58" rx="48" ry="40" fill="#2a1f16" opacity="0.12" />
        <path
          className="viseme-demo-outer"
          d={guide.outer}
          fill="#c24a38"
          stroke="#8a2f22"
          strokeWidth="1.2"
        />
        <path
          className="viseme-demo-opening"
          d={guide.opening}
          fill="#1a1210"
        />
      </svg>
      <p className="viseme-demo-caption">
        <strong>{guide.label}</strong>
        {speakAs ? <span> · “{speakAs}”</span> : null}
        <span className="viseme-demo-ipa">{guide.sound}</span>
      </p>
    </div>
  );
}
