import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import type { BlendshapeScore } from "../features";
import { lipBoundingBox, type Point } from "../lips";

type LipBox = { x: number; y: number; w: number; h: number };

type FaceLandmarkerState = {
  lipBox: LipBox | null;
  landmarks: Point[] | null;
  blendshapes: BlendshapeScore[] | null;
  status: "loading" | "ready" | "error";
  error: string | null;
};

const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

async function createLandmarker(delegate: "GPU" | "CPU") {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
}

export function useFaceLandmarker(
  video: HTMLVideoElement | null,
  enabled: boolean,
) {
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const [state, setState] = useState<FaceLandmarkerState>({
    lipBox: null,
    landmarks: null,
    blendshapes: null,
    status: "loading",
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function init() {
      try {
        let landmarker: FaceLandmarker;
        try {
          landmarker = await createLandmarker("GPU");
        } catch {
          landmarker = await createLandmarker("CPU");
        }
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setState((prev) => ({ ...prev, status: "ready", error: null }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "MediaPipe failed to load";
        setState((prev) => ({ ...prev, status: "error", error: message }));
      }
    }

    void init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !video || state.status !== "ready") return;

    let lastVideoTime = -1;

    const tick = () => {
      const landmarker = landmarkerRef.current;
      if (
        landmarker &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime;
        let result: FaceLandmarkerResult | undefined;
        try {
          result = landmarker.detectForVideo(video, performance.now());
        } catch {
          result = undefined;
        }

        frameRef.current += 1;
        if (frameRef.current % 2 === 0) {
          const face = result?.faceLandmarks?.[0];
          const categories = result?.faceBlendshapes?.[0]?.categories ?? null;
          const blendshapes =
            categories?.map((c) => ({
              categoryName: c.categoryName,
              score: c.score,
            })) ?? null;

          if (face?.length) {
            const landmarks = face as Point[];
            setState((prev) => ({
              ...prev,
              landmarks,
              lipBox: lipBoundingBox(landmarks),
              blendshapes,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              landmarks: null,
              lipBox: null,
              blendshapes: null,
            }));
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, video, state.status]);

  return state;
}
