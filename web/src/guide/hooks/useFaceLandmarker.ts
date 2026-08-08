import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import { lipBoundingBox, type Point } from "../lips";

type LipBox = { x: number; y: number; w: number; h: number };

type FaceLandmarkerState = {
  lipBox: LipBox | null;
  landmarks: Point[] | null;
  status: "loading" | "ready" | "error";
  error: string | null;
};

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
    status: "loading",
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm",
        );
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setState((prev) => ({ ...prev, status: "ready", error: null }));
      } catch (gpuError) {
        try {
          const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm",
          );
          const landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numFaces: 1,
          });
          if (cancelled) {
            landmarker.close();
            return;
          }
          landmarkerRef.current = landmarker;
          setState((prev) => ({ ...prev, status: "ready", error: null }));
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : gpuError instanceof Error
                ? gpuError.message
                : "MediaPipe failed to load";
          setState((prev) => ({
            ...prev,
            status: "error",
            error: message,
          }));
        }
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
          if (face?.length) {
            const landmarks = face as Point[];
            const box = lipBoundingBox(landmarks);
            setState((prev) => ({
              ...prev,
              landmarks,
              lipBox: box,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              landmarks: null,
              lipBox: null,
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
