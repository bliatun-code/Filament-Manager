import { useCallback } from "react";
import type { useI18n } from "../lib/i18n";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsLibrarySyncMessages(t: SettingsTranslator) {
  const librarySyncActionMessageLabels = useCallback(() => ({
    clientAuthCleared: t(
      "settings.librarySyncClientAuthCleared",
      "Desktop client pairing was removed from this device.",
    ),
    clientPaired: t(
      "settings.librarySyncClientPaired",
      "Desktop client paired successfully and is now using the detected host.",
    ),
    deviceNameSaved: t(
      "settings.librarySyncDeviceNameSaved",
      "Device name saved.",
    ),
    hostCheckPassed: t("settings.librarySyncHostCheckOk", "Host check passed."),
    renewPairing: t(
      "settings.librarySyncRenewPairingInfo",
      "Saved pairing was cleared. Paste a fresh pairing link from the host to continue.",
    ),
    settingsSaved: t("settings.librarySyncSaved", "Library role settings saved."),
    snapshotRefreshed: t("settings.librarySyncSnapshotRefreshed", "Host snapshot refreshed."),
  }), [t]);

  const librarySyncPairingMessageLabels = useCallback(() => ({
    pairHostFailed: t(
      "settings.error.librarySyncPairHost",
      "Failed to pair this desktop client with the host.",
    ),
    pairingInvalid: t(
      "settings.librarySyncPairingInvalid",
      "Invalid pairing link. Create a new pairing link on the host and try again.",
    ),
    pairingLinkRequired: t(
      "settings.error.librarySyncPairingLinkRequired",
      "Paste the full pairing link from the host so the client can detect the host automatically.",
    ),
  }), [t]);

  const librarySyncErrorMessageLabels = useCallback(() => ({
    clearClientAuthFailed: t(
      "settings.error.librarySyncClearClientAuth",
      "Failed to remove the saved desktop client pairing.",
    ),
    deviceNameSaveFailed: t(
      "settings.error.librarySyncDeviceNameSave",
      "Failed to save the device name.",
    ),
    hostCheckFailed: t(
      "settings.error.librarySyncHostCheck",
      "Failed to check the configured host.",
    ),
    settingsSaveFailed: t(
      "settings.error.librarySyncSave",
      "Failed to save library role settings.",
    ),
    snapshotFailed: t(
      "settings.error.librarySyncSnapshot",
      "Failed to fetch host snapshot.",
    ),
  }), [t]);

  return {
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    librarySyncPairingMessageLabels,
  };
}
