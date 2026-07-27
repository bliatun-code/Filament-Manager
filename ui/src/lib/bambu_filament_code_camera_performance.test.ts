import assert from "node:assert/strict";
import test from "node:test";

import {
  BAMBU_FILAMENT_CAMERA_MAIN_THREAD_RGBA_BUDGET_BYTES,
  bambuFilamentCameraFallbackExceedsMainThreadBudget,
  estimateBambuFilamentCameraFallbackWorkload,
} from "./bambu_filament_code_camera_performance";
import {
  bambuFilamentCodeCameraWorkerScanSupported,
  createBambuFilamentCodeCameraWorkerScanner,
  type BambuFilamentCameraDecodePerformanceSample,
} from "./bambu_filament_code_camera_worker_client";

test("camera fallback workload quantifies every full-HD crop and readback", () => {
  const mainThread = estimateBambuFilamentCameraFallbackWorkload({
    frameHeight: 1080,
    frameWidth: 1920,
  });
  const worker = estimateBambuFilamentCameraFallbackWorkload({
    frameHeight: 1080,
    frameWidth: 1920,
    worker: true,
  });

  assert.equal(mainThread.cropCanvasCount, 13);
  assert.equal(mainThread.sourceCanvasRgbaBytes, 1920 * 1080 * 4);
  assert.ok(mainThread.cropCanvasRgbaBytes > 32 * 1024 * 1024);
  assert.ok(mainThread.fallbackReadbackRgbaBytes > 48 * 1024 * 1024);
  assert.ok(
    mainThread.estimatedMainThreadRgbaBytes >
      BAMBU_FILAMENT_CAMERA_MAIN_THREAD_RGBA_BUDGET_BYTES,
  );
  assert.equal(
    bambuFilamentCameraFallbackExceedsMainThreadBudget({
      frameHeight: 1080,
      frameWidth: 1920,
    }),
    true,
  );
  assert.equal(worker.estimatedMainThreadRgbaBytes, 0);
  assert.equal(
    worker.estimatedWorkerRgbaBytes,
    mainThread.estimatedMainThreadRgbaBytes,
  );
});

test("camera fallback stays on the main thread when worker primitives are unavailable", () => {
  assert.equal(
    bambuFilamentCodeCameraWorkerScanSupported({
      createImageBitmap: null,
      createWorker: null,
    }),
    false,
  );
  assert.equal(
    createBambuFilamentCodeCameraWorkerScanner({
      createImageBitmap: null,
      createWorker: null,
    }),
    null,
  );
});

test("camera fallback transfers one frame and reports zero RGBA work on the main thread", async () => {
  const bitmap = { close() {} } as unknown as ImageBitmap;
  const transferred: Transferable[][] = [];
  const samples: BambuFilamentCameraDecodePerformanceSample[] = [];
  const nowValues = [10, 16];
  const worker = {
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessage: null as
      | ((event: MessageEvent<{
          decodeDurationMs: number;
          id: number;
          rawValues: string[];
        }>) => void)
      | null,
    postMessage(
      message: { bitmap: ImageBitmap; id: number },
      transfer: Transferable[],
    ) {
      assert.equal(message.bitmap, bitmap);
      transferred.push(transfer);
      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            decodeDurationMs: 4,
            id: message.id,
            rawValues: ["6975337031338"],
          },
        } as MessageEvent<{
          decodeDurationMs: number;
          id: number;
          rawValues: string[];
        }>);
      });
    },
    terminate() {},
  };
  const scanner = createBambuFilamentCodeCameraWorkerScanner({
    createImageBitmap: async () => bitmap,
    createWorker: () => worker,
    now: () => nowValues.shift() ?? 16,
    onPerformanceSample: (sample) => samples.push(sample),
  });

  const detections = await scanner?.detect({ videoHeight: 1080, videoWidth: 1920 });
  scanner?.close?.();

  assert.deepEqual(detections, [{ rawValue: "6975337031338" }]);
  assert.deepEqual(transferred, [[bitmap]]);
  assert.equal(samples.length, 1);
  assert.equal(samples[0]?.mode, "worker");
  assert.equal(samples[0]?.captureDurationMs, 2);
  assert.equal(samples[0]?.decodeDurationMs, 4);
  assert.equal(samples[0]?.workload.estimatedMainThreadRgbaBytes, 0);
  assert.ok((samples[0]?.workload.estimatedWorkerRgbaBytes ?? 0) > 0);
});

test("camera fallback keeps scanning on the main thread after a worker failure", async () => {
  const samples: BambuFilamentCameraDecodePerformanceSample[] = [];
  let fallbackCount = 0;
  let terminateCount = 0;
  const worker = {
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessage: null as ((event: MessageEvent<never>) => void) | null,
    postMessage() {
      queueMicrotask(() => {
        worker.onerror?.({
          error: new Error("worker unavailable"),
          message: "worker unavailable",
        } as ErrorEvent);
      });
    },
    terminate() {
      terminateCount += 1;
    },
  };
  const scanner = createBambuFilamentCodeCameraWorkerScanner({
    createImageBitmap: async () => ({ close() {} }) as unknown as ImageBitmap,
    createWorker: () => worker,
    fallbackScanner: {
      detect: async () => {
        fallbackCount += 1;
        return [{ rawValue: "Filament Code: 53400" }];
      },
    },
    now: () => fallbackCount,
    onPerformanceSample: (sample) => samples.push(sample),
  });

  const detections = await scanner?.detect({ videoHeight: 720, videoWidth: 1280 });

  assert.deepEqual(detections, [{ rawValue: "Filament Code: 53400" }]);
  assert.equal(fallbackCount, 1);
  assert.equal(terminateCount, 1);
  assert.equal(samples[0]?.mode, "main_thread_fallback");
  assert.ok((samples[0]?.workload.estimatedMainThreadRgbaBytes ?? 0) > 0);
});

test("closing while a camera bitmap is being created rejects the scan and closes the bitmap", async () => {
  let resolveBitmap: ((bitmap: ImageBitmap) => void) | null = null;
  let bitmapCloseCount = 0;
  let fallbackCount = 0;
  let postMessageCount = 0;
  let terminateCount = 0;
  const bitmap = {
    close() {
      bitmapCloseCount += 1;
    },
  } as unknown as ImageBitmap;
  const worker = {
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessage: null as ((event: MessageEvent<never>) => void) | null,
    postMessage() {
      postMessageCount += 1;
    },
    terminate() {
      terminateCount += 1;
    },
  };
  const scanner = createBambuFilamentCodeCameraWorkerScanner({
    createImageBitmap: () =>
      new Promise<ImageBitmap>((resolve) => {
        resolveBitmap = resolve;
      }),
    createWorker: () => worker,
    fallbackScanner: {
      detect: async () => {
        fallbackCount += 1;
        return [];
      },
    },
  });

  assert.ok(scanner);
  const scan = scanner.detect({ videoHeight: 720, videoWidth: 1280 });
  scanner.close?.();
  assert.ok(resolveBitmap);
  resolveBitmap(bitmap);

  await assert.rejects(scan, /Camera barcode worker was closed/);
  assert.equal(bitmapCloseCount, 1);
  assert.equal(postMessageCount, 0);
  assert.equal(fallbackCount, 0);
  assert.equal(terminateCount, 1);
});

test("camera worker scanner rejects calls after close without falling back", async () => {
  let createBitmapCount = 0;
  let fallbackCount = 0;
  let fallbackCloseCount = 0;
  let terminateCount = 0;
  const scanner = createBambuFilamentCodeCameraWorkerScanner({
    createImageBitmap: async () => {
      createBitmapCount += 1;
      return { close() {} } as unknown as ImageBitmap;
    },
    createWorker: () => ({
      onerror: null,
      onmessage: null,
      postMessage() {},
      terminate() {
        terminateCount += 1;
      },
    }),
    fallbackScanner: {
      close: () => {
        fallbackCloseCount += 1;
      },
      detect: async () => {
        fallbackCount += 1;
        return [];
      },
    },
  });

  assert.ok(scanner);
  scanner.close?.();
  scanner.close?.();

  await assert.rejects(
    scanner.detect({ videoHeight: 720, videoWidth: 1280 }),
    /Camera barcode worker was closed/,
  );
  assert.equal(createBitmapCount, 0);
  assert.equal(fallbackCount, 0);
  assert.equal(fallbackCloseCount, 1);
  assert.equal(terminateCount, 1);
});
