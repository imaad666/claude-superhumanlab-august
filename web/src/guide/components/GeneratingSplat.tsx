type GeneratingSplatProps = {
  label: string;
  detail?: string | null;
  /** Compact inline variant for tight panels */
  compact?: boolean;
};

/**
 * Flash skeleton while the local brain generates feedback —
 * X-shaped splat + shimmer bars so a long wait still feels alive.
 */
export function GeneratingSplat({
  label,
  detail = null,
  compact = false,
}: GeneratingSplatProps) {
  return (
    <div
      className={`gen-splat ${compact ? "is-compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="gen-splat-mark" aria-hidden>
        <span className="gen-splat-arm gen-splat-arm-a" />
        <span className="gen-splat-arm gen-splat-arm-b" />
        <span className="gen-splat-burst" />
      </div>

      <div className="gen-splat-copy">
        <p className="gen-splat-label">{label}</p>
        {detail && <p className="gen-splat-detail">{detail}</p>}
      </div>

      <div className="gen-splat-bones" aria-hidden>
        <span className="gen-splat-bone gen-splat-bone-lg" />
        <span className="gen-splat-bone gen-splat-bone-md" />
        <span className="gen-splat-bone gen-splat-bone-sm" />
      </div>
    </div>
  );
}
