import { useEffect } from "react";
import type { SettingsTabKey } from "../App";

type RefreshTrustedLanPairedBrowsers = (
  options?: { announceNewPairing?: boolean; suppressErrors?: boolean },
) => Promise<void>;

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
  useEffect(() => {
    if (
      !tauri ||
      activeTab !== "LIBRARY" ||
      !trustedLanStatusEnabled ||
      trustedLanActionBusy
    ) {
      return;
    }

    const pollMs = trustedLanPairingLink ? 1500 : 5000;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }
      await refreshTrustedLanPairedBrowsers({
        announceNewPairing: Boolean(trustedLanPairingLink),
        suppressErrors: true,
      });
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeTab,
    refreshTrustedLanPairedBrowsers,
    tauri,
    trustedLanActionBusy,
    trustedLanPairingLink,
    trustedLanStatusEnabled,
  ]);
}
