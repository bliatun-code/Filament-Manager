import {
  saveLibrarySyncSettings,
  type LibrarySyncSettings,
} from "../lib/tauri_client";
import {
  buildLibrarySyncSaveSettingsInput,
  normalizeLibrarySyncMode,
} from "./settings_library_sync_model";

type WriteLibrarySyncSettings = (
  settings: LibrarySyncSettings,
) => Promise<LibrarySyncSettings>;

export function isLibrarySyncDeviceNameDirty(
  current: LibrarySyncSettings | null,
  draft: string,
): boolean {
  return current !== null && draft !== current.device_name;
}

export async function persistLibrarySyncDeviceName({
  current,
  deviceName,
  writeSettings = saveLibrarySyncSettings,
}: {
  current: LibrarySyncSettings;
  deviceName: string;
  writeSettings?: WriteLibrarySyncSettings;
}): Promise<LibrarySyncSettings> {
  const currentMode = normalizeLibrarySyncMode(current.mode);
  if (current.mode !== currentMode) {
    throw new Error("Cannot save a device name while the persisted library role is unknown.");
  }

  return writeSettings(
    buildLibrarySyncSaveSettingsInput({
      current,
      targetMode: currentMode,
      deviceName,
      hostBaseUrlDraft: current.host_base_url ?? "",
    }),
  );
}
