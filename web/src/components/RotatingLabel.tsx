import { useEffect, useState } from "react";

type RotatingLabelProps = {
  phrases: string[];
  intervalMs?: number;
  className?: string;
};

export function RotatingLabel({
  phrases,
  intervalMs = 2400,
  className = "",
}: RotatingLabelProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (phrases.length < 2) return;

    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % phrases.length);
        setVisible(true);
      }, 220);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [phrases, intervalMs]);

  return (
    <span
      className={`rotating-label ${visible ? "is-in" : "is-out"} ${className}`.trim()}
      aria-live="polite"
    >
      {phrases[index]}
    </span>
  );
}
