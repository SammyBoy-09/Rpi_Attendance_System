/**
 * Browser-only face recognition helpers built on @vladmandic/face-api.
 * Models are lazily loaded from a CDN the first time they are needed.
 */

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

export const MATCH_THRESHOLD = 0.5;

type FaceApi = typeof import("@vladmandic/face-api");

let apiPromise: Promise<FaceApi> | null = null;

export function loadFaceApi(): Promise<FaceApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      const tf = faceapi.tf as unknown as {
        setBackend: (name: string) => Promise<boolean>;
        ready: () => Promise<void>;
      };
      // Prefer GPU; fall back to CPU when WebGL is unavailable.
      try {
        await tf.setBackend("webgl");
        await tf.ready();
      } catch {
        await tf.setBackend("cpu");
        await tf.ready();
      }
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })().catch((err) => {
      apiPromise = null;
      throw err;
    });
  }
  return apiPromise;
}

export type DetectionResult = {
  descriptor: number[];
  box: { x: number; y: number; width: number; height: number };
  score: number;
};

export async function detectFace(
  video: HTMLVideoElement,
): Promise<DetectionResult | null> {
  const faceapi = await loadFaceApi();
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.45,
  });
  const result = await faceapi
    .detectSingleFace(video, options)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) return null;

  const { x, y, width, height } = result.detection.box;
  return {
    descriptor: Array.from(result.descriptor),
    box: { x, y, width, height },
    score: result.detection.score,
  };
}

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export type Candidate<T> = { item: T; descriptor: number[] };

export function findBestMatch<T>(
  probe: number[],
  candidates: Candidate<T>[],
): { item: T; distance: number } | null {
  let best: { item: T; distance: number } | null = null;
  for (const c of candidates) {
    if (!c.descriptor || c.descriptor.length !== probe.length) continue;
    const distance = euclideanDistance(probe, c.descriptor);
    if (!best || distance < best.distance) best = { item: c.item, distance };
  }
  return best;
}

/** Crops the detected face from a video frame and returns a compact JPEG data URL. */
export function captureFaceThumbnail(
  video: HTMLVideoElement,
  box: { x: number; y: number; width: number; height: number },
  size = 256,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const pad = box.width * 0.35;
  const side = Math.max(box.width, box.height) + pad * 2;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const sx = Math.max(0, cx - side / 2);
  const sy = Math.max(0, cy - side / 2);
  const sw = Math.min(side, video.videoWidth - sx);
  const sh = Math.min(side, video.videoHeight - sy);

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}
