import { createFastBambuFilamentBoxBarcodeScanner } from "./bambu_filament_code_image_scan";

type CameraWorkerRequest = {
  bitmap: ImageBitmap;
  id: number;
};

type CameraWorkerResponse = {
  decodeDurationMs: number;
  error?: string;
  id: number;
  rawValues: string[];
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<CameraWorkerRequest>) => void) | null;
  postMessage: (message: CameraWorkerResponse) => void;
};
const scanner = createFastBambuFilamentBoxBarcodeScanner();

workerScope.onmessage = (event) => {
  const { bitmap, id } = event.data;
  const startedAt = performance.now();
  void scanner
    .detect(bitmap)
    .then((detections) => {
      workerScope.postMessage({
        decodeDurationMs: Math.max(0, performance.now() - startedAt),
        id,
        rawValues: detections
          .map((detection) => String(detection.rawValue ?? "").trim())
          .filter(Boolean),
      });
    })
    .catch((error: unknown) => {
      workerScope.postMessage({
        decodeDurationMs: Math.max(0, performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
        id,
        rawValues: [],
      });
    })
    .finally(() => bitmap.close());
};
