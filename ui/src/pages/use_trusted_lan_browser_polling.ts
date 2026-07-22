import { useDocumentVisiblePolling } from "../lib/use_document_visible_polling";
import type { SettingsTabKey } from "./settings_page_model";

type RefreshTrustedLanPairedBrowsers = (
  options?: { announceNewPairing?: boolean; suppressErrors?: boolean },
) => Promise<boolean>;

type UseTrustedLanBrowserPollingInput = {
  activeTab: SettingsTabKey;
  refreshTrustedLanPairedBrowsers: RefreshTrustedLanPairedBrowsers;
  tauri: boolean;
  trustedLanActionBusy: boolean;
  trustedLanPairingLink: string | null;
  trustedLanStatusEnabled: boolean;
};

export function useTrustedLanBrowserPolling({
  activeTab,
  refreshTrustedLanPairedBrowsers,
  tauri,
  trustedLanActionBusy,
  trustedLanPairingLink,
  trustedLanStatusEnabled,
}: UseTrustedLanBrowserPollingInput) {
  const pollMs = trustedLanPairingLink ? 1_500 : 5_000;

  useDocumentVisiblePolling({
    enabled:
      tauri &&
      activeTab === "LIBRARY" &&
      trustedLanStatusEnabled &&
      !trustedLanActionBusy,
    failureInitialDelayMs: pollMs,
    failureMaxDelayMs: 30_000,
    intervalMs: pollMs,
    poll: () =>
      refreshTrustedLanPairedBrowsers({
        announceNewPairing: Boolean(trustedLanPairingLink),
        suppressErrors: true,
      }),
    runImmediately: true,
  });
}
