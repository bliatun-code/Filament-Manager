import type { Dispatch, SetStateAction } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import { buildTrustedLanCompanionModel } from "./settings_companion_model";
import { useSettingsInitialLoad } from "./use_settings_initial_load";
import { useSettingsLibraryAutoValidation } from "./use_settings_library_auto_validation";
import { useSettingsLibraryRoleFlow } from "./use_settings_library_role_flow";
import { useSettingsLibrarySyncActions } from "./use_settings_library_sync_actions";
import type { useSettingsBackupValidationSummary } from "./use_settings_backup_validation_summary";
import type { useSettingsLibraryRuntime } from "./use_settings_library_runtime";
import type { useSettingsMessageGroups } from "./use_settings_message_groups";
import { useTrustedLanBrowserPolling } from "./use_trusted_lan_browser_polling";
import { useTrustedLanPairingActions } from "./use_trusted_lan_pairing_actions";
import { useTrustedLanStatusActions } from "./use_trusted_lan_status_actions";

type TranslateFn = (key: string, fallback?: string) => string;
type SettingsLibraryRuntime = ReturnType<typeof useSettingsLibraryRuntime>;
type SettingsMessageGroups = ReturnType<typeof useSettingsMessageGroups>;
type BackupValidationSummary = ReturnType<typeof useSettingsBackupValidationSummary>;

type UseSettingsLibraryActionsRuntimeInput = {
  activeTab: SettingsTabKey;
  backupValidation: BackupValidationSummary;
  catalogRefreshBusy: boolean;
  libraryRuntime: SettingsLibraryRuntime;
  loading: boolean;
  messageGroups: SettingsMessageGroups;
  reloadSettings: () => Promise<void>;
  settingsDataSourceReady: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  showTransientInfo: (message: string) => void;
  tauri: boolean;
  t: TranslateFn;
};

export function useSettingsLibraryActionsRuntime({
  activeTab,
  backupValidation,
  catalogRefreshBusy,
  libraryRuntime,
  loading,
  messageGroups,
  reloadSettings,
  settingsDataSourceReady,
  setError,
  setInfo,
  showTransientInfo,
  tauri,
  t,
}: UseSettingsLibraryActionsRuntimeInput) {
  const {
    librarySyncBusy,
    librarySyncDeviceNameDraft,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncPairingDraft,
    librarySyncSavedMode,
    librarySyncSettings,
    librarySyncValidationBusy,
    setLibrarySyncBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncDeviceNameSaveBusy,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncSnapshotBusy,
    setLibrarySyncValidation,
    setLibrarySyncValidationBusy,
    setShowTrustedLanNetworkEditor,
    setShowTrustedLanRevokedBrowsers,
    setTrustedLanActionBusy,
    setTrustedLanEnabledDraft,
    setTrustedLanInterfaceAddressDraft,
    setTrustedLanInterfaces,
    setTrustedLanLoading,
    setTrustedLanPairedBrowsers,
    setTrustedLanPairingExpiresAtMs,
    setTrustedLanPairingLabel,
    setTrustedLanPairingLink,
    setTrustedLanStatus,
    settingsClientHostBaseUrl,
    settingsClientHostWritePaired,
    syncTrustedLanDraftFromStatus,
    trustedLanActionBusy,
    trustedLanEnabledDraft,
    trustedLanInterfaces,
    trustedLanPairedBrowsersRefreshInFlightRef,
    trustedLanPairedBrowsersRef,
    trustedLanPairingBrowserLabelDraft,
    trustedLanPairingLink,
    trustedLanPortDraft,
    trustedLanSelectedInterfaceOption,
    trustedLanStatus,
  } = libraryRuntime;
  const {
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    librarySyncPairingMessageLabels,
    trustedLanConfigMessageLabels,
    trustedLanLoadMessageLabels,
    trustedLanValidationMessageLabels,
  } = messageGroups;
  const {
    clearFullBackupProgress,
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
  } = backupValidation;

  const {
    loadTrustedLanCompanionStatus,
    persistTrustedLanConfig,
    refreshTrustedLanPairedBrowsers,
  } = useTrustedLanStatusActions({
    refreshInFlightRef: trustedLanPairedBrowsersRefreshInFlightRef,
    setError,
    setInfo,
    setShowTrustedLanNetworkEditor,
    setTrustedLanActionBusy,
    setTrustedLanInterfaces,
    setTrustedLanLoading,
    setTrustedLanPairedBrowsers,
    setTrustedLanPairingExpiresAtMs,
    setTrustedLanPairingLabel,
    setTrustedLanPairingLink,
    setTrustedLanStatus,
    syncTrustedLanDraftFromStatus,
    tauri,
    trustedLanConfigMessageLabels,
    trustedLanInterfaces,
    trustedLanLoadMessageLabels,
    trustedLanPairedBrowsersRef,
    trustedLanPortDraft,
    trustedLanSelectedInterfaceOption,
    trustedLanValidationMessageLabels,
  });

  useSettingsInitialLoad({
    dataSourceReady: settingsDataSourceReady,
    loadTrustedLanCompanionStatus,
    reloadSettings,
    tauri,
  });

  // Catalog refreshes can be multi-minute Host writes. Keep the library role,
  // Host target, and pairing controls on that same busy boundary so a result
  // from Host A can never be presented after the user switches to Host B.
  const librarySyncInteractionBusy =
    librarySyncBusy || catalogRefreshBusy;

  const syncActions = useSettingsLibrarySyncActions({
    librarySyncActionMessageLabels,
    librarySyncBusy: librarySyncInteractionBusy,
    librarySyncDeviceNameDraft,
    librarySyncErrorMessageLabels,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncPairingDraft,
    librarySyncPairingMessageLabels,
    librarySyncSettings,
    persistTrustedLanConfig,
    setError,
    setInfo,
    setLibrarySyncBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncDeviceNameSaveBusy,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncSnapshotBusy,
    setLibrarySyncValidation,
    setLibrarySyncValidationBusy,
    setTrustedLanEnabledDraft,
    setTrustedLanInterfaceAddressDraft,
    settingsClientHostBaseUrl,
    showTransientInfo,
    tauri,
    trustedLanConfigMessageLabels,
    trustedLanInterfaces,
    trustedLanSelectedInterfaceOption,
    trustedLanStatus,
    trustedLanValidationMessageLabels,
  });

  const roleFlow = useSettingsLibraryRoleFlow({
    clearFullBackupProgress,
    handleSaveLibrarySyncSettings: syncActions.handleSaveLibrarySyncSettings,
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    librarySyncBusy: librarySyncInteractionBusy,
    librarySyncSavedMode,
    setLibrarySyncModeDraft,
  });

  useSettingsLibraryAutoValidation({
    activeTab,
    handleValidateLibrarySyncHost: syncActions.handleValidateLibrarySyncHost,
    librarySyncBusy: librarySyncInteractionBusy,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncSettings,
    librarySyncValidationBusy,
    loading,
    settingsClientHostBaseUrl,
    settingsClientHostWritePaired,
    tauri,
  });

  useTrustedLanBrowserPolling({
    activeTab,
    refreshTrustedLanPairedBrowsers,
    tauri,
    trustedLanActionBusy,
    trustedLanPairingLink,
    trustedLanStatusEnabled: Boolean(trustedLanStatus?.enabled),
  });

  const trustedLanCompanionModel = buildTrustedLanCompanionModel({
    trustedLanStatus,
    statusLoading: libraryRuntime.trustedLanLoading,
    actionBusy: trustedLanActionBusy,
    t,
  });
  const pairingActions = useTrustedLanPairingActions({
    configActionDisabled: trustedLanCompanionModel.configActionDisabled,
    loadTrustedLanCompanionStatus,
    pairActionDisabled: trustedLanCompanionModel.pairActionDisabled,
    persistTrustedLanConfig,
    setError,
    setInfo,
    setShowTrustedLanRevokedBrowsers,
    setTrustedLanActionBusy,
    setTrustedLanEnabledDraft,
    setTrustedLanPairingExpiresAtMs,
    setTrustedLanPairingLabel,
    setTrustedLanPairingLink,
    tauri,
    trustedLanActionMessageLabels: messageGroups.trustedLanActionMessageLabels,
    trustedLanConfigMessageLabels,
    trustedLanEnabledDraft,
    trustedLanPairingBrowserLabelDraft,
    trustedLanPairingLink,
  });

  return {
    ...syncActions,
    ...roleFlow,
    ...pairingActions,
    trustedLanCompanionModel,
  };
}
