import { useCallback } from "react";
import type { useI18n } from "../lib/i18n";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsTrustedLanMessages(t: SettingsTranslator) {
  const trustedLanLoadMessageLabels = useCallback(() => ({
    loadCompanionFailed: t(
      "settings.error.loadTrustedLanCompanion",
      "Failed to load trusted-LAN companion status.",
    ),
    newBrowserPaired: t(
      "settings.trustedLanBrowserPairedDetected",
      "New paired browser connected.",
    ),
    refreshBrowsersFailed: t(
      "settings.error.loadTrustedLanPairedBrowsers",
      "Failed to refresh paired browsers.",
    ),
  }), [t]);

  const trustedLanConfigMessageLabels = useCallback(() => ({
    disabled: t("settings.trustedLanDisabledInfo", "Web app server turned off."),
    enabled: t("settings.trustedLanEnabledInfo", "Web app server turned on."),
    enabledPending: t(
      "settings.trustedLanEnabledPendingInfo",
      "Web app server is starting. Refresh status if it takes a moment.",
    ),
    networkSaved: t("settings.trustedLanNetworkSaved", "Web app network settings saved."),
    saveFailed: t(
      "settings.error.saveTrustedLanConfig",
      "Failed to save trusted-LAN companion settings.",
    ),
    starting: t("settings.trustedLanStartingInfo", "Starting web app server..."),
  }), [t]);

  const trustedLanValidationMessageLabels = useCallback(() => ({
    noPrivateInterface: t(
      "settings.error.trustedLanNoInterface",
      "Pick a private interface before turning on the web app server.",
    ),
  }), [t]);

  const trustedLanActionMessageLabels = useCallback(() => ({
    allBrowsersRevoked: t(
      "settings.trustedLanAllBrowsersRevoked",
      "All trusted-LAN browsers revoked.",
    ),
    browserRevoked: t("settings.trustedLanBrowserRevoked", "Trusted-LAN browser revoked."),
    copyPairingFailed: t(
      "settings.error.copyTrustedLanPairing",
      "Failed to copy the trusted-LAN pairing link.",
    ),
    createPairingFailed: t(
      "settings.error.createTrustedLanPairing",
      "Failed to create a trusted-LAN pairing link.",
    ),
    pairingCopied: t("settings.trustedLanPairingCopied", "Trusted-LAN pairing link copied."),
    pairingCreated: t(
      "settings.trustedLanPairingCreated",
      "Trusted-LAN pairing link created and copied.",
    ),
    revokeAllBrowsersFailed: t(
      "settings.error.revokeAllTrustedLanBrowsers",
      "Failed to revoke trusted-LAN browsers.",
    ),
    revokeBrowserFailed: t(
      "settings.error.revokeTrustedLanBrowser",
      "Failed to revoke the trusted-LAN browser.",
    ),
  }), [t]);

  return {
    trustedLanActionMessageLabels,
    trustedLanConfigMessageLabels,
    trustedLanLoadMessageLabels,
    trustedLanValidationMessageLabels,
  };
}
