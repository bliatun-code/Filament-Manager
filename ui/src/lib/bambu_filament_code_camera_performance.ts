export type BambuFilamentBarcodeScanCropSpec = {
  enhance?: boolean;
  height: number;
  scale?: number;
  width: number;
  x: number;
  y: number;
};

export const BAMBU_FILAMENT_BARCODE_SCAN_MAX_CANVAS_WIDTH = 1600;

export const BAMBU_FILAMENT_BARCODE_SCAN_CROP_SPECS = [
  { x: 0.28, y: 0.3, width: 0.44, height: 0.28, scale: 2.5, enhance: true },
  { x: 0.32, y: 0.32, width: 0.36, height: 0.24, scale: 3, enhance: true },
  { x: 0.36, y: 0.34, width: 0.3, height: 0.22, scale: 3.3 },
  { x: 0.24, y: 0.42, width: 0.52, height: 0.26, scale: 2.1 },
  { x: 0.26, y: 0.46, width: 0.48, height: 0.24, scale: 2.4, enhance: true },
  { x: 0.3, y: 0.46, width: 0.4, height: 0.24, scale: 2.8 },
  { x: 0.3, y: 0.5, width: 0.4, height: 0.2, scale: 3, enhance: true },
  { x: 0.04, y: 0.32, width: 0.92, height: 0.34, scale: 1.35 },
  { x: 0.04, y: 0.5, width: 0.92, height: 0.34, scale: 1.45 },
  { x: 0.04, y: 0.16, width: 0.92, height: 0.34, scale: 1.35 },
  { x: 0.12, y: 0.24, width: 0.76, height: 0.5, scale: 1.55 },
  { x: 0.04, y: 0.32, width: 0.92, height: 0.34, scale: 1.45, enhance: true },
  { x: 0.04, y: 0.5, width: 0.92, height: 0.34, scale: 1.55, enhance: true },
] satisfies readonly BambuFilamentBarcodeScanCropSpec[];

export const BAMBU_FILAMENT_CAMERA_SCAN_INTERVAL_MS = 1200;

export const BAMBU_FILAMENT_CAMERA_MAIN_THREAD_RGBA_BUDGET_BYTES =
  8 * 1024 * 1024;

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type BambuFilamentBarcodeScanCropDimensions = {
  sourceHeight: number;
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
  targetHeight: number;
  targetWidth: number;
};

export function bambuFilamentBarcodeScanCropDimensions(input: {
  frameHeight: number;
  frameWidth: number;
  spec: BambuFilamentBarcodeScanCropSpec;
}): BambuFilamentBarcodeScanCropDimensions {
  const frameWidth = Math.max(1, Math.round(input.frameWidth));
  const frameHeight = Math.max(1, Math.round(input.frameHeight));
  const sourceX = Math.round(frameWidth * clampUnit(input.spec.x));
  const sourceY = Math.round(frameHeight * clampUnit(input.spec.y));
  const requestedWidth = Math.max(
    1,
    Math.round(frameWidth * clampUnit(input.spec.width)),
  );
  const requestedHeight = Math.max(
    1,
    Math.round(frameHeight * clampUnit(input.spec.height)),
  );
  const sourceWidth = Math.max(1, Math.min(requestedWidth, frameWidth - sourceX));
  const sourceHeight = Math.max(
    1,
    Math.min(requestedHeight, frameHeight - sourceY),
  );
  const scale = input.spec.scale ?? 1;
  let targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  let targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  if (targetWidth > BAMBU_FILAMENT_BARCODE_SCAN_MAX_CANVAS_WIDTH) {
    const resize = BAMBU_FILAMENT_BARCODE_SCAN_MAX_CANVAS_WIDTH / targetWidth;
    targetWidth = BAMBU_FILAMENT_BARCODE_SCAN_MAX_CANVAS_WIDTH;
    targetHeight = Math.max(1, Math.round(targetHeight * resize));
  }

  return {
    sourceHeight,
    sourceWidth,
    sourceX,
    sourceY,
    targetHeight,
    targetWidth,
  };
}

export type BambuFilamentCameraFallbackWorkload = {
  cropCanvasCount: number;
  cropCanvasRgbaBytes: number;
  estimatedMainThreadRgbaBytes: number;
  estimatedMainThreadRgbaBytesPerSecond: number;
  estimatedWorkerRgbaBytes: number;
  fallbackReadbackRgbaBytes: number;
  frameHeight: number;
  frameWidth: number;
  sourceCanvasRgbaBytes: number;
};

export function estimateBambuFilamentCameraFallbackWorkload(input: {
  frameHeight: number;
  frameWidth: number;
  scanIntervalMs?: number;
  worker?: boolean;
}): BambuFilamentCameraFallbackWorkload {
  const frameWidth = Math.max(1, Math.round(input.frameWidth));
  const frameHeight = Math.max(1, Math.round(input.frameHeight));
  const scanIntervalMs = Math.max(
    1,
    Math.round(input.scanIntervalMs ?? BAMBU_FILAMENT_CAMERA_SCAN_INTERVAL_MS),
  );
  const rgbaBytesPerPixel = 4;
  const sourceCanvasRgbaBytes = frameWidth * frameHeight * rgbaBytesPerPixel;
  const cropPixels = BAMBU_FILAMENT_BARCODE_SCAN_CROP_SPECS.map((spec) => {
    const dimensions = bambuFilamentBarcodeScanCropDimensions({
      frameHeight,
      frameWidth,
      spec,
    });
    return dimensions.targetWidth * dimensions.targetHeight;
  });
  const cropCanvasRgbaBytes =
    cropPixels.reduce((total, pixels) => total + pixels, 0) * rgbaBytesPerPixel;

  // A miss in the fast fallback reads every candidate once for generic EAN-13,
  // then the first six crops once more for the known Bambu-box matcher.
  const genericReadbackPixels = frameWidth * frameHeight +
    cropPixels.reduce((total, pixels) => total + pixels, 0);
  const knownReadbackPixels = cropPixels
    .slice(0, 6)
    .reduce((total, pixels) => total + pixels, 0);
  const fallbackReadbackRgbaBytes =
    (genericReadbackPixels + knownReadbackPixels) * rgbaBytesPerPixel;
  const totalRgbaBytes =
    sourceCanvasRgbaBytes + cropCanvasRgbaBytes + fallbackReadbackRgbaBytes;
  const estimatedMainThreadRgbaBytes = input.worker ? 0 : totalRgbaBytes;

  return {
    cropCanvasCount: cropPixels.length,
    cropCanvasRgbaBytes,
    estimatedMainThreadRgbaBytes,
    estimatedMainThreadRgbaBytesPerSecond:
      estimatedMainThreadRgbaBytes * (1000 / scanIntervalMs),
    estimatedWorkerRgbaBytes: input.worker ? totalRgbaBytes : 0,
    fallbackReadbackRgbaBytes,
    frameHeight,
    frameWidth,
    sourceCanvasRgbaBytes,
  };
}

export function bambuFilamentCameraFallbackExceedsMainThreadBudget(input: {
  frameHeight: number;
  frameWidth: number;
}): boolean {
  return (
    estimateBambuFilamentCameraFallbackWorkload(input)
      .estimatedMainThreadRgbaBytes >
    BAMBU_FILAMENT_CAMERA_MAIN_THREAD_RGBA_BUDGET_BYTES
  );
}
