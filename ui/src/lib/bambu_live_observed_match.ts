import { parseBambuSettingsProfileName } from "./bambu_settings_profiles";
import type { ObservedInventoryMatchInput } from "./inventory_match";
import type { BambuLiveObservedTray } from "./tauri_client";

export type BambuLiveObservedMatchFallback = {
  rfid?: string | null;
  material?: string | null;
  filamentName?: string | null;
  colorHex?: string | null;
};

function trimmed(value?: string | null): string {
  return value?.trim() ?? "";
}

export function bambuLiveTrayObservedRfid(
  liveTray: BambuLiveObservedTray | null | undefined,
): string {
  return trimmed(liveTray?.tray_uuid) || trimmed(liveTray?.observed_rfid_tag);
}

export function bambuLiveTrayPresetFilamentProfile(
  liveTray: BambuLiveObservedTray | null | undefined,
): string {
  return parseBambuSettingsProfileName(liveTray?.tray_id_name)?.filamentProfile.trim() ?? "";
}

export function buildBambuLiveObservedInventoryMatchInput(
  liveTray: BambuLiveObservedTray | null | undefined,
  fallback: BambuLiveObservedMatchFallback = {},
): ObservedInventoryMatchInput | null {
  if (!liveTray) {
    return null;
  }
  const presetFilamentProfile = bambuLiveTrayPresetFilamentProfile(liveTray);
  const rfid = bambuLiveTrayObservedRfid(liveTray) || trimmed(fallback.rfid);
  const material = trimmed(liveTray.filament_type) || trimmed(fallback.material);
  const filamentName =
    trimmed(liveTray.filament_name) ||
    trimmed(fallback.filamentName) ||
    presetFilamentProfile;
  const colorHex = trimmed(liveTray.color_hex) || trimmed(fallback.colorHex);

  if (!rfid && !material && !filamentName && !colorHex) {
    return null;
  }
  return {
    rfid: rfid || null,
    material: material || null,
    filamentName: filamentName || null,
    colorHex: colorHex || null,
  };
}
