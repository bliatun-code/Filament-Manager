export type FilamentLabelProfileId = "ptouch-24" | "compact" | "standard" | "expanded";

export type FilamentLabelSizeSelectionId = FilamentLabelProfileId | "custom";

export type FilamentLabelDimensions = {
  widthMm: number;
  heightMm: number;
};

export type FilamentLabelSize = FilamentLabelDimensions & {
  selectionId: FilamentLabelSizeSelectionId;
};

export type FilamentLabelSizeInput =
  | FilamentLabelProfileId
  | FilamentLabelDimensions
  | FilamentLabelSize;

export type FilamentLabelDimensionValidationCode =
  | "valid"
  | "width-not-finite"
  | "height-not-finite"
  | "width-out-of-range"
  | "height-out-of-range"
  | "width-off-step"
  | "height-off-step"
  | "width-too-small-for-height";

export type FilamentLabelDimensionsValidationResult =
  | {
      valid: true;
      code: "valid";
      dimensions: FilamentLabelDimensions;
    }
  | {
      valid: false;
      code: Exclude<FilamentLabelDimensionValidationCode, "valid">;
      minimumWidthMm?: number;
    };

export type FilamentLabelProfile = FilamentLabelDimensions & {
  id: FilamentLabelProfileId;
  title: string;
  description: string;
};

export const FILAMENT_LABEL_DPI = 300;
export const FILAMENT_LABEL_DIMENSION_STEP_MM = 0.5;
export const FILAMENT_LABEL_MIN_WIDTH_MM = 45;
export const FILAMENT_LABEL_MAX_WIDTH_MM = 150;
export const FILAMENT_LABEL_MIN_HEIGHT_MM = 24;
export const FILAMENT_LABEL_MAX_HEIGHT_MM = 80;
export const FILAMENT_LABEL_MIN_TEXT_WIDTH_MM = 20;
export const FILAMENT_LABEL_MIN_LANDSCAPE_RATIO = 1.6;

export const DEFAULT_CUSTOM_FILAMENT_LABEL_DIMENSIONS: Readonly<FilamentLabelDimensions> = {
  widthMm: 60,
  heightMm: 24,
};

export const FILAMENT_LABEL_PROFILES: readonly FilamentLabelProfile[] = [
  {
    id: "ptouch-24",
    widthMm: 60,
    heightMm: 24,
    title: "P-Touch 24 mm",
    description: "Uses the full tape height",
  },
  {
    id: "compact",
    widthMm: 50,
    heightMm: 25,
    title: "Compact",
    description: "Short landscape label",
  },
  {
    id: "standard",
    widthMm: 60,
    heightMm: 30,
    title: "Standard",
    description: "More room for details",
  },
  {
    id: "expanded",
    widthMm: 75,
    heightMm: 40,
    title: "Expanded",
    description: "Largest text and QR",
  },
] as const;

export function filamentLabelProfile(profileId: FilamentLabelProfileId): FilamentLabelProfile {
  return (
    FILAMENT_LABEL_PROFILES.find((profile) => profile.id === profileId) ??
    FILAMENT_LABEL_PROFILES[0]
  );
}

export function minimumFilamentLabelWidthMm(heightMm: number): number {
  return Math.max(
    heightMm + FILAMENT_LABEL_MIN_TEXT_WIDTH_MM,
    heightMm * FILAMENT_LABEL_MIN_LANDSCAPE_RATIO,
  );
}

function isOnDimensionStep(value: number): boolean {
  const steps = value / FILAMENT_LABEL_DIMENSION_STEP_MM;
  return Math.abs(steps - Math.round(steps)) < Number.EPSILON * 100;
}

export function validateFilamentLabelDimensions(
  dimensions: FilamentLabelDimensions,
): FilamentLabelDimensionsValidationResult {
  const { widthMm, heightMm } = dimensions;
  if (!Number.isFinite(widthMm)) {
    return { valid: false, code: "width-not-finite" };
  }
  if (!Number.isFinite(heightMm)) {
    return { valid: false, code: "height-not-finite" };
  }
  if (widthMm < FILAMENT_LABEL_MIN_WIDTH_MM || widthMm > FILAMENT_LABEL_MAX_WIDTH_MM) {
    return { valid: false, code: "width-out-of-range" };
  }
  if (heightMm < FILAMENT_LABEL_MIN_HEIGHT_MM || heightMm > FILAMENT_LABEL_MAX_HEIGHT_MM) {
    return { valid: false, code: "height-out-of-range" };
  }
  if (!isOnDimensionStep(widthMm)) {
    return { valid: false, code: "width-off-step" };
  }
  if (!isOnDimensionStep(heightMm)) {
    return { valid: false, code: "height-off-step" };
  }

  const minimumWidthMm = minimumFilamentLabelWidthMm(heightMm);
  if (widthMm < minimumWidthMm) {
    return {
      valid: false,
      code: "width-too-small-for-height",
      minimumWidthMm,
    };
  }

  return {
    valid: true,
    code: "valid",
    dimensions: {
      widthMm: Object.is(widthMm, -0) ? 0 : widthMm,
      heightMm: Object.is(heightMm, -0) ? 0 : heightMm,
    },
  };
}

function assertValidCustomDimensions(
  dimensions: FilamentLabelDimensions,
): FilamentLabelDimensions {
  const validation = validateFilamentLabelDimensions(dimensions);
  if (!validation.valid) {
    throw new RangeError(`Invalid filament label dimensions: ${validation.code}`);
  }
  return validation.dimensions;
}

export function filamentLabelSize(
  selectionId: FilamentLabelSizeSelectionId,
  customDimensions: FilamentLabelDimensions = DEFAULT_CUSTOM_FILAMENT_LABEL_DIMENSIONS,
): FilamentLabelSize {
  if (selectionId !== "custom") {
    const profile = filamentLabelProfile(selectionId);
    return {
      selectionId,
      widthMm: profile.widthMm,
      heightMm: profile.heightMm,
    };
  }
  return {
    selectionId,
    ...assertValidCustomDimensions(customDimensions),
  };
}

export function resolveFilamentLabelSize(input: FilamentLabelSizeInput): FilamentLabelSize {
  if (typeof input === "string") {
    return filamentLabelSize(input);
  }
  if ("selectionId" in input) {
    return filamentLabelSize(input.selectionId, input);
  }
  return filamentLabelSize("custom", input);
}

function formatDimensionForFilename(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", "p");
}

export function filamentLabelSizeFilenameSuffix(input: FilamentLabelSizeInput): string {
  const size = resolveFilamentLabelSize(input);
  if (size.selectionId !== "custom") {
    return size.selectionId;
  }
  return `custom-${formatDimensionForFilename(size.widthMm)}x${formatDimensionForFilename(size.heightMm)}mm`;
}

export function filamentLabelPixelSize(input: FilamentLabelSizeInput): {
  width: number;
  height: number;
} {
  const size = resolveFilamentLabelSize(input);
  return {
    width: Math.round((size.widthMm / 25.4) * FILAMENT_LABEL_DPI),
    height: Math.round((size.heightMm / 25.4) * FILAMENT_LABEL_DPI),
  };
}
