import type { MutableRefObject } from "react";
import type {
  TrustedLanCompanionStatus,
  TrustedLanInterfaceOption,
  TrustedLanPairedBrowser,
} from "../lib/tauri_client";
import type { Locale } from "../lib/i18n";
import { useTrustedLanBrowserListModel } from "./use_trusted_lan_browser_list_model";
import { useTrustedLanNetworkState } from "./use_trusted_lan_network_state";
import { useTrustedLanPairedBrowserRefSync } from "./use_trusted_lan_paired_browser_ref_sync";
import { useTrustedLanRevokedVisibility } from "./use_trusted_lan_revoked_visibility";

type TranslateFn = (key: string, fallback?: string) => string;

type UseSettingsTrustedLanDerivedStateInput = {
  locale: Locale;
  setShowTrustedLanRevokedBrowsers: (show: boolean) => void;
  t: TranslateFn;
  trustedLanInterfaceAddressDraft: string;
  trustedLanInterfaces: TrustedLanInterfaceOption[];
  trustedLanPairedBrowsers: TrustedLanPairedBrowser[];
  trustedLanPairedBrowsersRef: MutableRefObject<TrustedLanPairedBrowser[]>;
  trustedLanPortDraft: string;
  trustedLanStatus: TrustedLanCompanionStatus | null;
};

export function useSettingsTrustedLanDerivedState({
  locale,
  setShowTrustedLanRevokedBrowsers,
  t,
  trustedLanInterfaceAddressDraft,
  trustedLanInterfaces,
  trustedLanPairedBrowsers,
  trustedLanPairedBrowsersRef,
  trustedLanPortDraft,
  trustedLanStatus,
}: UseSettingsTrustedLanDerivedStateInput) {
  const browserListModel = useTrustedLanBrowserListModel({
    locale,
    t,
    trustedLanPairedBrowsers,
  });
  const networkState = useTrustedLanNetworkState({
    trustedLanInterfaceAddressDraft,
    trustedLanInterfaces,
    trustedLanPortDraft,
    trustedLanStatus,
  });

  useTrustedLanRevokedVisibility({
    revokedBrowserCount: browserListModel.revokedTrustedLanPairedBrowsers.length,
    setShowTrustedLanRevokedBrowsers,
  });
  useTrustedLanPairedBrowserRefSync({
    trustedLanPairedBrowsers,
    trustedLanPairedBrowsersRef,
  });

  return {
    ...browserListModel,
    ...networkState,
  };
}
