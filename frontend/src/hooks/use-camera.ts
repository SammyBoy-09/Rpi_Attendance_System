import { useEffect, useRef, useState } from "react";

export type CameraState = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ready: boolean;
  error: string | null;
};

/** Attaches the user's webcam to a video element while `active` is true. */
export function useCamera(active: boolean): CameraState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setError(null);
        setReady(true);
      } catch {
        if (!cancelled) {
          setError(
            "Camera unavailable. Allow camera access in your browser and make sure no other app is using it.",
          );
          setReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setReady(false);
      if (videoRef.current) videoRef.current.srcObject = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  return { videoRef, ready, error };
}
