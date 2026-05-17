import type { Locale } from "../lib/i18n";
import { useSettingsLibraryClientAdvanced } from "./use_settings_library_client_advanced";
import { useSettingsLibraryDerivedState } from "./use_settings_library_derived_state";
import { useSettingsLibrarySyncState } from "./use_settings_library_sync_state";
import { useSettingsTrustedLanDerivedState } from "./use_settings_trusted_lan_derived_state";
import { useSettingsTrustedLanState } from "./use_settings_trusted_lan_state";
import { useTrustedLanDraftSync } from "./use_trusted_lan_draft_sync";
import { useTrustedLanPairingQr } from "./use_trusted_lan_pairing_qr";

type TranslateFn = (key: string, fallback?: string) => string;

type UseSettingsLibraryRuntimeInput = {
  locale: Locale;
  tauri: boolean;
  t: TranslateFn;
};

export function useSettingsLibraryRuntime({
  locale,
  tauri,
  t,
}: UseSettingsLibraryRuntimeInput) {
  const librarySyncState = useSettingsLibrarySyncState();
  const trustedLanState = useSettingsTrustedLanState(tauri);
  const libraryClientAdvanced = useSettingsLibraryClientAdvanced();
  const trustedLanPairingQr = useTrustedLanPairingQr(trustedLanState.trustedLanPairingLink);
  const libraryDerivedState = useSettingsLibraryDerivedState({
    librarySyncModeDraft: librarySyncState.librarySyncModeDraft,
    librarySyncSettings: librarySyncState.librarySyncSettings,
    librarySyncSnapshot: librarySyncState.librarySyncSnapshot,
    librarySyncValidation: librarySyncState.librarySyncValidation,
    pairedBrowserCount: trustedLanState.trustedLanPairedBrowsers.length,
    showTrustedLanNetworkEditor: trustedLanState.showTrustedLanNetworkEditor,
    t,
    trustedLanEnabledDraft: trustedLanState.trustedLanEnabledDraft,
    trustedLanPairingLink: trustedLanState.trustedLanPairingLink,
    trustedLanStatusEnabled: Boolean(trustedLanState.trustedLanStatus?.enabled),
  });
  const trustedLanDerivedState = useSettingsTrustedLanDerivedState({
    locale,
    setShowTrustedLanRevokedBrowsers: trustedLanState.setShowTrustedLanRevokedBrowsers,
    t,
    trustedLanInterfaceAddressDraft: trustedLanState.trustedLanInterfaceAddressDraft,
    trustedLanInterfaces: trustedLanState.trustedLanInterfaces,
    trustedLanPairedBrowsers: trustedLanState.trustedLanPairedBrowsers,
    trustedLanPairedBrowsersRef: trustedLanState.trustedLanPairedBrowsersRef,
    trustedLanPortDraft: trustedLanState.trustedLanPortDraft,
    trustedLanStatus: trustedLanState.trustedLanStatus,
  });
  const syncTrustedLanDraftFromStatus = useTrustedLanDraftSync({
    setTrustedLanEnabledDraft: trustedLanState.setTrustedLanEnabledDraft,
    setTrustedLanInterfaceAddressDraft: trustedLanState.setTrustedLanInterfaceAddressDraft,
    setTrustedLanPortDraft: trustedLanState.setTrustedLanPortDraft,
  });

  return {
    ...librarySyncState,
    ...trustedLanState,
    ...libraryClientAdvanced,
    ...trustedLanPairingQr,
    ...libraryDerivedState,
    ...trustedLanDerivedState,
    syncTrustedLanDraftFromStatus,
  };
}
