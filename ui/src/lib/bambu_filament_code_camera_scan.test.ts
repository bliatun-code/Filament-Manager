import assert from "node:assert/strict";
import test from "node:test";

import {
  appendBambuFilamentCodeCameraScanValues,
  bambuFilamentCodeCameraFrameReady,
  bambuFilamentCodeCameraScanSupport,
  createBambuFilamentCodeCameraDetector,
  requestBambuFilamentCodeCameraStream,
  scanBambuFilamentCodeCameraFrame,
} from "./bambu_filament_code_camera_scan";
import type { BambuFilamentBarcodeDetectorConstructor } from "./bambu_filament_code_image_scan";

function detectorFor(rawValues: string[]): BambuFilamentBarcodeDetectorConstructor {
  return class {
    async detect() {
      return rawValues.map((rawValue) => ({ rawValue }));
    }
  };
}

test("bambuFilamentCodeCameraScanSupport reports missing camera access", () => {
  assert.deepEqual(
    bambuFilamentCodeCameraScanSupport({
      barcodeDetector: detectorFor(["53400"]),
      mediaDevices: null,
    }),
    { available: false, reason: "camera" },
  );
  assert.deepEqual(
    bambuFilamentCodeCameraScanSupport({
      barcodeDetector: detectorFor(["53400"]),
      mediaDevices: {
        getUserMedia: async () => ({}) as MediaStream,
      },
    }),
    { available: true, reason: null },
  );
});

test("createBambuFilamentCodeCameraDetector uses the fallback scanner without native BarcodeDetector", async () => {
  const scanner = await createBambuFilamentCodeCameraDetector({
    barcodeDetector: null,
    fallbackBarcodeScanner: async () => ({
      detect: async () => [{ rawValue: "Filament Code: 53400" }],
    }),
  });

  assert.deepEqual(await scanner?.detect({}), [{ rawValue: "Filament Code: 53400" }]);
});

test("requestBambuFilamentCodeCameraStream asks for an environment-facing video stream", async () => {
  let constraints: MediaStreamConstraints | null = null;
  const fakeStream = { id: "stream" } as unknown as MediaStream;
  const stream = await requestBambuFilamentCodeCameraStream({
    mediaDevices: {
      getUserMedia: async (requestedConstraints) => {
        constraints = requestedConstraints;
        return fakeStream;
      },
    },
  });

  assert.equal(stream, fakeStream);
  assert.deepEqual(constraints, {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      height: { ideal: 720 },
      width: { ideal: 1280 },
    },
  });
});

test("scanBambuFilamentCodeCameraFrame returns trimmed barcode values", async () => {
  const ready = await scanBambuFilamentCodeCameraFrame({
    detector: new (detectorFor([" Filament Code: 53400 ", ""]))(),
    videoFrame: {},
  });
  const empty = await scanBambuFilamentCodeCameraFrame({
    detector: new (detectorFor([""]))(),
    videoFrame: {},
  });

  assert.deepEqual(ready, {
    status: "ready",
    rawValues: ["Filament Code: 53400"],
  });
  assert.deepEqual(empty, {
    status: "no_barcode",
    rawValues: [],
  });
});

test("scanBambuFilamentCodeCameraFrame waits for video dimensions", async () => {
  let detectCount = 0;
  const frame = await scanBambuFilamentCodeCameraFrame({
    detector: {
      detect: async () => {
        detectCount += 1;
        return [{ rawValue: "Filament Code: 53400" }];
      },
    },
    videoFrame: { videoWidth: 0, videoHeight: 720 },
  });

  assert.equal(bambuFilamentCodeCameraFrameReady({ videoWidth: 1280, videoHeight: 720 }), true);
  assert.equal(bambuFilamentCodeCameraFrameReady({ videoWidth: 0, videoHeight: 720 }), false);
  assert.deepEqual(frame, { status: "no_barcode", rawValues: [] });
  assert.equal(detectCount, 0);
});

test("appendBambuFilamentCodeCameraScanValues deduplicates a continuous camera session", () => {
  const first = appendBambuFilamentCodeCameraScanValues({
    currentInput: "",
    rawValues: ["Filament Code: 53400"],
  });
  const second = appendBambuFilamentCodeCameraScanValues({
    currentInput: first.input,
    rawValues: ["53400"],
    seenKeys: first.nextSeenKeys,
  });

  assert.equal(first.status, "appended");
  assert.deepEqual(first.appendedCodeLines, ["53400"]);
  assert.equal(first.input, "53400");

  assert.equal(second.status, "duplicate");
  assert.deepEqual(second.appendedLines, []);
  assert.equal(second.input, "53400");
});
