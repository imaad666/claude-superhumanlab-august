import { useCallback, useEffect, useRef, useState } from "react";

type CameraState = {
  stream: MediaStream | null;
  error: string | null;
  ready: boolean;
};

export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<CameraState>({
    stream: null,
    error: null,
    ready: false,
  });

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let stream: MediaStream | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setState({ stream, error: null, ready: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Camera access failed";
        setState({ stream: null, error: message, ready: false });
      }
    }

    void start();

    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
      setState({ stream: null, error: null, ready: false });
    };
  }, [enabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !state.stream) return;
    video.srcObject = state.stream;
    void video.play().catch(() => undefined);
  }, [state.stream]);

  return { videoRef, attachVideo, ...state };
}
