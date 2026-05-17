import type { Dispatch, SetStateAction } from "react";
import type { SettingsTabKey } from "../App";
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
  libraryRuntime: SettingsLibraryRuntime;
  loading: boolean;
  messageGroups: SettingsMessageGroups;
  reloadSettings: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  showTransientInfo: (message: string) => void;
  tauri: boolean;
  t: TranslateFn;
};

export function useSettingsLibraryActionsRuntime({
  activeTab,
  backupValidation,
  libraryRuntime,
  loading,
  messageGroups,
  reloadSettings,
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
    loadTrustedLanCompanionStatus,
    reloadSettings,
    tauri,
  });

  const syncActions = useSettingsLibrarySyncActions({
    librarySyncActionMessageLabels,
    librarySyncBusy,
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
    librarySyncBusy,
    librarySyncSavedMode,
    setLibrarySyncModeDraft,
  });

  useSettingsLibraryAutoValidation({
    activeTab,
    handleValidateLibrarySyncHost: syncActions.handleValidateLibrarySyncHost,
    librarySyncBusy,
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
