import { useEffect, useMemo, useState } from "react";
import type { ExpressionFeatures, LipFeatures } from "../features";
import type { Point } from "../lips";
import { VISEMES, type VisemeId } from "../visemes";
import { LipMesh3D } from "./LipMesh3D";

type LipCoachPanelProps = {
  mode: "trainer" | "live";
  lips: LipFeatures;
  expression: ExpressionFeatures;
  landmarks: Point[] | null;
  tracking: boolean;
  brainCue?: string | null;
  lipMatch?: "good" | "close" | "try_again" | null;
  onSelectTarget?: (id: VisemeId | null) => void;
};

export function LipCoachPanel({
  lips,
  landmarks,
  tracking,
  brainCue,
  lipMatch,
  onSelectTarget,
}: LipCoachPanelProps) {
  const liveViseme = lips.visemeGuess;
  const [targetId, setTargetId] = useState<VisemeId>(liveViseme);
  const [followLive, setFollowLive] = useState(true);

  useEffect(() => {
    if (followLive) {
      setTargetId(liveViseme);
      onSelectTarget?.(null);
    }
  }, [followLive, liveViseme, onSelectTarget]);

  const liveLabel =
    VISEMES.find((item) => item.id === liveViseme)?.label ?? "—";

  const cue = useMemo(() => {
    if (brainCue) return brainCue;
    return VISEMES.find((item) => item.id === targetId)?.cue ?? "";
  }, [brainCue, targetId]);

  return (
    <section className="guide-panel coach-panel">
      <header className="guide-panel-head">
        <h2>Lip coach</h2>
        <span className="guide-pill">
          {tracking ? liveLabel : "Idle"}
          {lipMatch ? ` · ${lipMatch.replace("_", " ")}` : ""}
        </span>
      </header>

      <div className="coach-stack">
        <LipMesh3D landmarks={landmarks} tracking={tracking} />

        <p className="coach-metrics">
          open {(lips.openness * 100).toFixed(0)}% · wide{" "}
          {(lips.width * 100).toFixed(0)}% · round{" "}
          {(lips.roundness * 100).toFixed(0)}%
        </p>

        <div className="coach-picks" role="list" aria-label="Practice targets">
          {VISEMES.filter((item) => item.id !== "rest").map((item) => (
            <button
              key={item.id}
              type="button"
              role="listitem"
              className={`coach-pick ${targetId === item.id ? "is-selected" : ""}`}
              onClick={() => {
                setFollowLive(false);
                setTargetId(item.id);
                onSelectTarget?.(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {cue && <p className="coach-cue">{cue}</p>}
      </div>
    </section>
  );
}
