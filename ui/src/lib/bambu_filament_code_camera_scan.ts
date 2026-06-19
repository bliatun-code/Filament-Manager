import {
  appendBambuFilamentCodeBatchScanValuesOnce,
  type BambuFilamentCodeBatchScanAppendOnceResult,
} from "./bambu_filament_code_batch";
import {
  createBambuFilamentBarcodeScanner,
  createFastBambuFilamentBoxBarcodeScanner,
  type BambuFilamentBarcodeScannerFactory,
  type BambuFilamentBarcodeDetector,
  type BambuFilamentBarcodeDetectorConstructor,
} from "./bambu_filament_code_image_scan";

type BambuFilamentCodeCameraMediaDevices = Pick<MediaDevices, "getUserMedia">;

export type BambuFilamentCodeCameraScanDependencies = {
  barcodeDetector?: BambuFilamentBarcodeDetectorConstructor | null;
  fallbackBarcodeScanner?: BambuFilamentBarcodeScannerFactory | null;
  mediaDevices?: BambuFilamentCodeCameraMediaDevices | null;
};

export type BambuFilamentCodeCameraScanSupport =
  | { available: true; reason: null }
  | { available: false; reason: "camera" };

export type BambuFilamentCodeCameraFrameResult =
  | { status: "ready"; rawValues: string[] }
  | { status: "no_barcode"; rawValues: [] };

export type BambuFilamentCodeCameraAppendResult =
  BambuFilamentCodeBatchScanAppendOnceResult;

export const BAMBU_FILAMENT_CODE_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    aspectRatio: { ideal: 16 / 9 },
    facingMode: { ideal: "environment" },
    frameRate: { ideal: 30 },
    height: { ideal: 1080 },
    width: { ideal: 1920 },
  },
};

function globalMediaDevices(): BambuFilamentCodeCameraMediaDevices | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return navigator.mediaDevices;
}

function resolveMediaDevices(
  dependencies: BambuFilamentCodeCameraScanDependencies,
): BambuFilamentCodeCameraMediaDevices | null | undefined {
  return Object.prototype.hasOwnProperty.call(dependencies, "mediaDevices")
    ? dependencies.mediaDevices
    : globalMediaDevices();
}

function cameraFrameDimension(input: unknown, keys: string[]): number {
  const source = input as Record<string, unknown>;
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

export function bambuFilamentCodeCameraFrameReady(videoFrame: unknown): boolean {
  const source = videoFrame as Record<string, unknown> | null;
  const hasVideoDimensions =
    source !== null && ("videoWidth" in source || "videoHeight" in source);
  if (!hasVideoDimensions) {
    return true;
  }

  return (
    cameraFrameDimension(videoFrame, ["videoWidth"]) > 0 &&
    cameraFrameDimension(videoFrame, ["videoHeight"]) > 0
  );
}

export function bambuFilamentCodeCameraScanSupport(
  dependencies: BambuFilamentCodeCameraScanDependencies = {},
): BambuFilamentCodeCameraScanSupport {
  const mediaDevices = resolveMediaDevices(dependencies);
  if (typeof mediaDevices?.getUserMedia !== "function") {
    return { available: false, reason: "camera" };
  }

  return { available: true, reason: null };
}

export async function createBambuFilamentCodeCameraDetector(
  dependencies: BambuFilamentCodeCameraScanDependencies = {},
): Promise<BambuFilamentBarcodeDetector | null> {
  const fallbackBarcodeScanner = Object.prototype.hasOwnProperty.call(
    dependencies,
    "fallbackBarcodeScanner",
  )
    ? dependencies.fallbackBarcodeScanner
    : async () => createFastBambuFilamentBoxBarcodeScanner();
  return createBambuFilamentBarcodeScanner({
    ...dependencies,
    fallbackBarcodeScanner,
  });
}

export async function requestBambuFilamentCodeCameraStream(
  dependencies: BambuFilamentCodeCameraScanDependencies = {},
): Promise<MediaStream | null> {
  const mediaDevices = resolveMediaDevices(dependencies);
  if (typeof mediaDevices?.getUserMedia !== "function") {
    return null;
  }
  const stream = await mediaDevices.getUserMedia(BAMBU_FILAMENT_CODE_CAMERA_CONSTRAINTS);
  await applyBambuFilamentCodeCameraTrackHints(stream);
  return stream;
}

export async function applyBambuFilamentCodeCameraTrackHints(
  stream: Pick<MediaStream, "getVideoTracks">,
): Promise<void> {
  const track = stream.getVideoTracks?.()[0];
  if (!track || typeof track.applyConstraints !== "function") {
    return;
  }

  const capabilities =
    typeof track.getCapabilities === "function" ? track.getCapabilities() : null;
  const advanced: Array<MediaTrackConstraintSet & Record<string, unknown>> = [];
  const supportsCapabilityValue = (name: string, value: string) => {
    const supported = (capabilities as Record<string, unknown> | null)?.[name];
    return Array.isArray(supported) && supported.includes(value);
  };

  if (supportsCapabilityValue("focusMode", "continuous")) {
    advanced.push({ focusMode: "continuous" });
  }
  if (supportsCapabilityValue("exposureMode", "continuous")) {
    advanced.push({ exposureMode: "continuous" });
  }
  if (supportsCapabilityValue("whiteBalanceMode", "continuous")) {
    advanced.push({ whiteBalanceMode: "continuous" });
  }

  if (advanced.length === 0) {
    return;
  }

  try {
    await track.applyConstraints({ advanced });
  } catch {
    // Camera capability hints are best-effort; scanning still works without them.
  }
}

export async function scanBambuFilamentCodeCameraFrame(input: {
  detector: BambuFilamentBarcodeDetector;
  videoFrame: unknown;
}): Promise<BambuFilamentCodeCameraFrameResult> {
  if (!bambuFilamentCodeCameraFrameReady(input.videoFrame)) {
    return {
      status: "no_barcode",
      rawValues: [],
    };
  }

  const rawValues = (await input.detector.detect(input.videoFrame))
    .map((detection) => String(detection.rawValue ?? "").trim())
    .filter(Boolean);

  if (rawValues.length === 0) {
    return {
      status: "no_barcode",
      rawValues: [],
    };
  }

  return {
    status: "ready",
    rawValues,
  };
}

export function appendBambuFilamentCodeCameraScanValues(input: {
  currentInput: string;
  rawValues: string[];
  seenKeys?: ReadonlySet<string>;
}): BambuFilamentCodeCameraAppendResult {
  return appendBambuFilamentCodeBatchScanValuesOnce({
    currentInput: input.currentInput,
    scanValues: input.rawValues,
    seenKeys: input.seenKeys,
  });
}
