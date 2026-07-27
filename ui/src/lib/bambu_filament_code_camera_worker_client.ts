import {
  createFastBambuFilamentBoxBarcodeScanner,
  type BambuFilamentBarcodeDetection,
  type BambuFilamentBarcodeDetector,
} from "./bambu_filament_code_image_scan";
import {
  estimateBambuFilamentCameraFallbackWorkload,
  type BambuFilamentCameraFallbackWorkload,
} from "./bambu_filament_code_camera_performance";

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

type CameraWorkerLike = {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<CameraWorkerResponse>) => void) | null;
  postMessage: (message: CameraWorkerRequest, transfer: Transferable[]) => void;
  terminate: () => void;
};

export type BambuFilamentCameraDecodePerformanceSample = {
  captureDurationMs: number;
  decodeDurationMs: number;
  mode: "main_thread_fallback" | "worker";
  workload: BambuFilamentCameraFallbackWorkload;
};

export type BambuFilamentCodeCameraWorkerScannerDependencies = {
  createImageBitmap?: ((image: ImageBitmapSource) => Promise<ImageBitmap>) | null;
  createWorker?: (() => CameraWorkerLike) | null;
  fallbackScanner?: BambuFilamentBarcodeDetector;
  now?: () => number;
  onPerformanceSample?: (
    sample: BambuFilamentCameraDecodePerformanceSample,
  ) => void;
  requestTimeoutMs?: number;
};

type PendingWorkerScan = {
  fallbackImage: unknown;
  reject: (error: unknown) => void;
  resolve: (detections: BambuFilamentBarcodeDetection[]) => void;
  startedAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
};

function defaultCreateCameraWorker(): CameraWorkerLike {
  return new Worker(
    new URL("./bambu_filament_code_camera_worker.ts", import.meta.url),
    {
      name: "filament-code-camera-decoder",
      type: "module",
    },
  ) as unknown as CameraWorkerLike;
}

function globalCreateImageBitmap():
  | ((image: ImageBitmapSource) => Promise<ImageBitmap>)
  | undefined {
  if (typeof globalThis.createImageBitmap !== "function") {
    return undefined;
  }
  return (image) => globalThis.createImageBitmap(image);
}

function cameraFrameDimensions(image: unknown): {
  frameHeight: number;
  frameWidth: number;
} {
  const source = image as Record<string, unknown>;
  const frameWidth = Number(source.videoWidth ?? source.naturalWidth ?? source.width);
  const frameHeight = Number(
    source.videoHeight ?? source.naturalHeight ?? source.height,
  );
  return {
    frameHeight: Number.isFinite(frameHeight) && frameHeight > 0 ? frameHeight : 1,
    frameWidth: Number.isFinite(frameWidth) && frameWidth > 0 ? frameWidth : 1,
  };
}

export function bambuFilamentCodeCameraWorkerScanSupported(
  dependencies: BambuFilamentCodeCameraWorkerScannerDependencies = {},
): boolean {
  const createBitmap = Object.prototype.hasOwnProperty.call(
    dependencies,
    "createImageBitmap",
  )
    ? dependencies.createImageBitmap
    : globalCreateImageBitmap();
  const createWorker = Object.prototype.hasOwnProperty.call(dependencies, "createWorker")
    ? dependencies.createWorker
    : typeof Worker === "function" && typeof OffscreenCanvas === "function"
      ? defaultCreateCameraWorker
      : null;
  return typeof createBitmap === "function" && typeof createWorker === "function";
}

export function createBambuFilamentCodeCameraWorkerScanner(
  dependencies: BambuFilamentCodeCameraWorkerScannerDependencies = {},
): BambuFilamentBarcodeDetector | null {
  if (!bambuFilamentCodeCameraWorkerScanSupported(dependencies)) {
    return null;
  }

  const createBitmap = Object.prototype.hasOwnProperty.call(
    dependencies,
    "createImageBitmap",
  )
    ? dependencies.createImageBitmap
    : globalCreateImageBitmap();
  const createWorker = Object.prototype.hasOwnProperty.call(dependencies, "createWorker")
    ? dependencies.createWorker
    : defaultCreateCameraWorker;
  if (typeof createBitmap !== "function" || typeof createWorker !== "function") {
    return null;
  }

  const now = dependencies.now ?? (() => performance.now());
  const fallbackScanner =
    dependencies.fallbackScanner ?? createFastBambuFilamentBoxBarcodeScanner();
  const requestTimeoutMs = Math.max(250, dependencies.requestTimeoutMs ?? 8_000);
  let worker: CameraWorkerLike | null = createWorker();
  let closed = false;
  let nextRequestId = 1;
  const pending = new Map<number, PendingWorkerScan>();

  const cameraWorkerClosedError = () =>
    new Error("Camera barcode worker was closed.");

  const reportMainThreadFallback = async (
    image: unknown,
    startedAt: number,
  ): Promise<BambuFilamentBarcodeDetection[]> => {
    if (closed) {
      throw cameraWorkerClosedError();
    }
    const detections = await fallbackScanner.detect(image);
    if (closed) {
      throw cameraWorkerClosedError();
    }
    dependencies.onPerformanceSample?.({
      captureDurationMs: 0,
      decodeDurationMs: Math.max(0, now() - startedAt),
      mode: "main_thread_fallback",
      workload: estimateBambuFilamentCameraFallbackWorkload({
        ...cameraFrameDimensions(image),
      }),
    });
    return detections;
  };

  const disableWorker = (error: unknown) => {
    const currentWorker = worker;
    worker = null;
    currentWorker?.terminate();
    for (const [id, request] of pending) {
      clearTimeout(request.timeoutId);
      pending.delete(id);
      void reportMainThreadFallback(request.fallbackImage, request.startedAt).then(
        request.resolve,
        request.reject,
      );
    }
    return error;
  };

  worker.onmessage = (event) => {
    const request = pending.get(event.data.id);
    if (!request) {
      return;
    }
    pending.delete(event.data.id);
    clearTimeout(request.timeoutId);
    if (event.data.error) {
      disableWorker(new Error(event.data.error));
      void reportMainThreadFallback(request.fallbackImage, request.startedAt).then(
        request.resolve,
        request.reject,
      );
      return;
    }

    const dimensions = cameraFrameDimensions(request.fallbackImage);
    dependencies.onPerformanceSample?.({
      captureDurationMs: Math.max(0, now() - request.startedAt - event.data.decodeDurationMs),
      decodeDurationMs: Math.max(0, event.data.decodeDurationMs),
      mode: "worker",
      workload: estimateBambuFilamentCameraFallbackWorkload({
        ...dimensions,
        worker: true,
      }),
    });
    request.resolve(
      event.data.rawValues.map((rawValue) => ({ rawValue })),
    );
  };
  worker.onerror = (event) => {
    disableWorker(event.error ?? new Error(event.message));
  };

  return {
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      const currentWorker = worker;
      worker = null;
      if (currentWorker) {
        currentWorker.onmessage = null;
        currentWorker.onerror = null;
      }
      currentWorker?.terminate();
      for (const request of pending.values()) {
        clearTimeout(request.timeoutId);
        request.reject(cameraWorkerClosedError());
      }
      pending.clear();
      fallbackScanner.close?.();
    },
    detect: async (image: unknown) => {
      if (closed) {
        throw cameraWorkerClosedError();
      }
      if (!worker) {
        return reportMainThreadFallback(image, now());
      }

      const startedAt = now();
      let bitmap: ImageBitmap;
      try {
        bitmap = await createBitmap(image as ImageBitmapSource);
      } catch {
        if (closed) {
          throw cameraWorkerClosedError();
        }
        return reportMainThreadFallback(image, startedAt);
      }

      if (closed) {
        bitmap.close?.();
        throw cameraWorkerClosedError();
      }
      const currentWorker = worker;
      if (!currentWorker) {
        bitmap.close?.();
        return reportMainThreadFallback(image, startedAt);
      }

      const id = nextRequestId;
      nextRequestId += 1;
      return new Promise<BambuFilamentBarcodeDetection[]>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const request = pending.get(id);
          if (!request) {
            return;
          }
          pending.delete(id);
          disableWorker(new Error("Camera barcode worker timed out."));
          void reportMainThreadFallback(image, startedAt).then(resolve, reject);
        }, requestTimeoutMs);
        pending.set(id, {
          fallbackImage: image,
          reject,
          resolve,
          startedAt,
          timeoutId,
        });
        try {
          currentWorker.postMessage({ bitmap, id }, [bitmap]);
        } catch (error) {
          bitmap.close?.();
          pending.delete(id);
          clearTimeout(timeoutId);
          disableWorker(error);
          void reportMainThreadFallback(image, startedAt).then(resolve, reject);
        }
      });
    },
  };
}
