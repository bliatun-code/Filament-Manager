import {
  DEFAULT_CUSTOM_FILAMENT_LABEL_DIMENSIONS,
  FILAMENT_LABEL_PROFILES,
  validateFilamentLabelDimensions,
  type FilamentLabelSizeSelectionId,
} from "./filament_label_profiles";
import {
  readVersionedLocalPreference,
  writeVersionedLocalPreference,
  type LocalPreferenceStorage,
} from "./local_preference_storage";

export type FilamentLabelPreferences = {
  selectedSize: FilamentLabelSizeSelectionId;
  customWidthMm: number;
  customHeightMm: number;
};

export const FILAMENT_LABEL_PREFERENCES_STORAGE_KEY =
  "filament-manager:filament-label-preferences";
const FILAMENT_LABEL_PREFERENCES_VERSION = 1;

export const DEFAULT_FILAMENT_LABEL_PREFERENCES: FilamentLabelPreferences = Object.freeze({
  selectedSize: "ptouch-24",
  customWidthMm: DEFAULT_CUSTOM_FILAMENT_LABEL_DIMENSIONS.widthMm,
  customHeightMm: DEFAULT_CUSTOM_FILAMENT_LABEL_DIMENSIONS.heightMm,
});

export const VISUAL_QA_FILAMENT_LABEL_PREFERENCES: FilamentLabelPreferences = Object.freeze({
  selectedSize: "custom",
  customWidthMm: 70,
  customHeightMm: 30,
});

type FilamentLabelPreferenceOptions = {
  deterministic?: boolean;
  storage?: LocalPreferenceStorage | null;
};

const selectionIds = new Set<FilamentLabelSizeSelectionId>([
  ...FILAMENT_LABEL_PROFILES.map((profile) => profile.id),
  "custom",
]);

export function normalizeFilamentLabelPreferences(
  value: unknown,
): FilamentLabelPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<Record<keyof FilamentLabelPreferences, unknown>>;
  if (
    typeof candidate.selectedSize !== "string" ||
    !selectionIds.has(candidate.selectedSize as FilamentLabelSizeSelectionId) ||
    typeof candidate.customWidthMm !== "number" ||
    typeof candidate.customHeightMm !== "number" ||
    !validateFilamentLabelDimensions({
      widthMm: candidate.customWidthMm,
      heightMm: candidate.customHeightMm,
    }).valid
  ) {
    return null;
  }
  return {
    selectedSize: candidate.selectedSize as FilamentLabelSizeSelectionId,
    customWidthMm: candidate.customWidthMm,
    customHeightMm: candidate.customHeightMm,
  };
}

export function readFilamentLabelPreferences({
  deterministic = false,
  storage,
}: FilamentLabelPreferenceOptions = {}): FilamentLabelPreferences {
  if (deterministic) {
    return { ...VISUAL_QA_FILAMENT_LABEL_PREFERENCES };
  }
  return readVersionedLocalPreference({
    fallback: { ...DEFAULT_FILAMENT_LABEL_PREFERENCES },
    key: FILAMENT_LABEL_PREFERENCES_STORAGE_KEY,
    normalize: normalizeFilamentLabelPreferences,
    storage,
    version: FILAMENT_LABEL_PREFERENCES_VERSION,
  });
}

export function writeFilamentLabelPreferences(
  value: FilamentLabelPreferences,
  { deterministic = false, storage }: FilamentLabelPreferenceOptions = {},
): boolean {
  if (deterministic) {
    return false;
  }
  return writeVersionedLocalPreference({
    key: FILAMENT_LABEL_PREFERENCES_STORAGE_KEY,
    normalize: normalizeFilamentLabelPreferences,
    storage,
    value,
    version: FILAMENT_LABEL_PREFERENCES_VERSION,
  });
}
