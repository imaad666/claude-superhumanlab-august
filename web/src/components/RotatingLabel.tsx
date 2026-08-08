import { useEffect, useState } from "react";

type RotatingLabelProps = {
  phrases: string[];
  className?: string;
  /** Typewriter + quirky kids font */
  variant?: "kids" | "guide";
  typeSpeedMs?: number;
  holdMs?: number;
};

export function RotatingLabel({
  phrases,
  className = "",
  variant = "guide",
  typeSpeedMs = 42,
  holdMs = 1800,
}: RotatingLabelProps) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (phrases.length === 0) return;

    let cancelled = false;
    let timeoutId = 0;
    const phrase = phrases[index];
    let char = 0;
    setShown("");

    const typeNext = () => {
      if (cancelled) return;
      char += 1;
      setShown(phrase.slice(0, char));

      if (char < phrase.length) {
        timeoutId = window.setTimeout(typeNext, typeSpeedMs);
        return;
      }

      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        setIndex((current) => (current + 1) % phrases.length);
      }, holdMs);
    };

    timeoutId = window.setTimeout(typeNext, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [index, phrases, typeSpeedMs, holdMs]);

  return (
    <span
      className={`rotating-label rotating-label--${variant} ${className}`.trim()}
      aria-live="polite"
    >
      {shown}
      <span className="rotating-caret" aria-hidden="true" />
    </span>
  );
}
