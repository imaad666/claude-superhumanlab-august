import { useEffect, useMemo, useState } from "react";
import type { ExpressionFeatures, LipFeatures } from "../features";
import type { Point } from "../lips";
import { mediapipePoseForViseme } from "../training/visemePoses";
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
  forcedViseme?: VisemeId | null;
  demoLandmarks?: Point[] | null;
  demo?: boolean;
  hidePicks?: boolean;
  headerTitle?: string;
  statusPill?: string;
  speakAs?: string;
};

export function LipCoachPanel({
  lips,
  landmarks,
  tracking,
  brainCue,
  lipMatch,
  onSelectTarget,
  forcedViseme = null,
  demoLandmarks = null,
  demo = false,
  hidePicks = false,
  headerTitle = "Lip coach",
  statusPill,
  speakAs,
}: LipCoachPanelProps) {
  const liveViseme = lips.visemeGuess;
  const [targetId, setTargetId] = useState<VisemeId>(liveViseme);
  const [followLive, setFollowLive] = useState(true);

  useEffect(() => {
    if (forcedViseme) {
      setFollowLive(false);
      setTargetId(forcedViseme);
      onSelectTarget?.(forcedViseme);
      return;
    }
    if (followLive) {
      setTargetId(liveViseme);
      onSelectTarget?.(null);
    }
  }, [followLive, liveViseme, forcedViseme, onSelectTarget]);

  const activeViseme = forcedViseme ?? targetId;
  const guide = VISEMES.find((item) => item.id === activeViseme);
  const liveLabel =
    VISEMES.find((item) => item.id === (demo ? activeViseme : liveViseme))
      ?.label ?? "—";

  const cue = useMemo(() => {
    if (brainCue) return brainCue;
    return guide?.cue ?? "";
  }, [brainCue, guide]);

  // Teacher capture / synthetic watch pose, else live camera landmarks.
  const poseLandmarks = useMemo(() => {
    if (demoLandmarks?.length) return demoLandmarks;
    if (!demo) return landmarks;
    return mediapipePoseForViseme(activeViseme);
  }, [demo, demoLandmarks, activeViseme, landmarks]);

  return (
    <section className="guide-panel coach-panel">
      <header className="guide-panel-head">
        <h2>{headerTitle}</h2>
        <span className="guide-pill">
          {statusPill ??
            `${tracking || demo ? liveLabel : "Idle"}${
              lipMatch ? ` · ${lipMatch.replace("_", " ")}` : ""
            }`}
        </span>
      </header>

      <div className="coach-stack">
        <div className="coach-mouth-stage">
          <LipMesh3D
            landmarks={poseLandmarks}
            tracking={Boolean(demo || demoLandmarks?.length || tracking)}
            emptyHint={
              demo || demoLandmarks?.length ? "Loading mouth pose…" : undefined
            }
          />
        </div>

        <p className="coach-metrics">
          {demo && guide ? (
            <>
              {guide.label}
              {speakAs ? <> · “{speakAs}”</> : null}
              <span className="coach-metrics-ipa"> {guide.sound}</span>
              {" · "}
              open {(lips.openness * 100).toFixed(0)}% · wide{" "}
              {(lips.width * 100).toFixed(0)}% · round{" "}
              {(lips.roundness * 100).toFixed(0)}%
            </>
          ) : (
            <>
              open {(lips.openness * 100).toFixed(0)}% · wide{" "}
              {(lips.width * 100).toFixed(0)}% · round{" "}
              {(lips.roundness * 100).toFixed(0)}%
            </>
          )}
        </p>

        {!hidePicks && (
          <div className="coach-picks" role="list" aria-label="Practice targets">
            {VISEMES.filter((item) => item.id !== "rest").map((item) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={`coach-pick ${activeViseme === item.id ? "is-selected" : ""}`}
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
        )}

        {cue && <p className="coach-cue">{cue}</p>}
      </div>
    </section>
  );
}
