import { useCallback, type Dispatch, type SetStateAction } from "react";
import { clearDashboardPageSnapshot } from "../lib/dashboard_page_snapshot_cache";
import { toErrorMessage } from "../lib/error_text";
import {
  clearLibrarySyncClientAuth,
  getLibrarySyncSettings,
  pairLibrarySyncHost,
  saveLibrarySyncSettings,
  validateLibrarySyncHost,
  type LibrarySyncHostValidationResult,
  type LibrarySyncRemoteSnapshot,
  type LibrarySyncSettings,
  type TrustedLanInterfaceOption,
  type TrustedLanCompanionStatus,
} from "../lib/tauri_client";
import { refreshLibrarySyncSnapshot } from "../lib/settings_data_source";
import { extractBaseUrlFromPairingInput } from "../lib/settings_utils";
import { persistLibrarySyncDeviceName } from "./settings_library_device_name";
import {
  buildLibrarySyncActionMessage,
  buildLibrarySyncErrorMessage,
  buildLibrarySyncPairingMessage,
  buildLibrarySyncPairingSettingsInput,
  buildLibrarySyncSaveSettingsInput,
  type LibrarySyncActionMessageLabels,
  type LibrarySyncErrorMessageLabels,
  type LibrarySyncMode,
  type LibrarySyncPairingMessageLabels,
} from "./settings_library_sync_model";
import {
  buildTrustedLanConfigMessage,
  buildTrustedLanNoPrivateInterfaceMessage,
  type TrustedLanConfigMessageLabels,
  type TrustedLanValidationMessageLabels,
} from "./settings_companion_model";

type LibrarySyncActionLabels = {
  librarySyncActionMessageLabels: () => LibrarySyncActionMessageLabels;
  librarySyncErrorMessageLabels: () => LibrarySyncErrorMessageLabels;
  librarySyncPairingMessageLabels: () => LibrarySyncPairingMessageLabels;
  trustedLanConfigMessageLabels: () => TrustedLanConfigMessageLabels;
  trustedLanValidationMessageLabels: () => TrustedLanValidationMessageLabels;
};

type UseSettingsLibrarySyncActionsInput = LibrarySyncActionLabels & {
  librarySyncBusy: boolean;
  librarySyncDeviceNameDraft: string;
  librarySyncHostBaseUrlDraft: string;
  librarySyncModeDraft: LibrarySyncMode;
  librarySyncPairingDraft: string;
  librarySyncSettings: LibrarySyncSettings | null;
  persistTrustedLanConfig: (nextEnabled: boolean, successMessage: string) => Promise<boolean>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  setLibrarySyncBusy: Dispatch<SetStateAction<boolean>>;
  setLibrarySyncDeviceNameDraft: Dispatch<SetStateAction<string>>;
  setLibrarySyncDeviceNameSaveBusy: Dispatch<SetStateAction<boolean>>;
  setLibrarySyncHostBaseUrlDraft: Dispatch<SetStateAction<string>>;
  setLibrarySyncModeDraft: Dispatch<SetStateAction<LibrarySyncMode>>;
  setLibrarySyncPairingDraft: Dispatch<SetStateAction<string>>;
  setLibrarySyncSettings: Dispatch<SetStateAction<LibrarySyncSettings | null>>;
  setLibrarySyncSnapshot: Dispatch<SetStateAction<LibrarySyncRemoteSnapshot | null>>;
  setLibrarySyncSnapshotBusy: Dispatch<SetStateAction<boolean>>;
  setLibrarySyncValidation: Dispatch<SetStateAction<LibrarySyncHostValidationResult | null>>;
  setLibrarySyncValidationBusy: Dispatch<SetStateAction<boolean>>;
  setTrustedLanEnabledDraft: Dispatch<SetStateAction<boolean>>;
  setTrustedLanInterfaceAddressDraft: Dispatch<SetStateAction<string>>;
  settingsClientHostBaseUrl: string | null;
  showTransientInfo: (message: string) => void;
  tauri: boolean;
  trustedLanInterfaces: TrustedLanInterfaceOption[];
  trustedLanSelectedInterfaceOption: TrustedLanInterfaceOption | null;
  trustedLanStatus: TrustedLanCompanionStatus | null;
};

export function useSettingsLibrarySyncActions({
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
}: UseSettingsLibrarySyncActionsInput) {
  const handleSaveLibrarySyncSettings = useCallback(async (nextMode = librarySyncModeDraft) => {
    if (!tauri || !librarySyncSettings) {
      return false;
    }
    setLibrarySyncBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (nextMode === "HOST") {
        const fallbackInterface = trustedLanSelectedInterfaceOption ?? trustedLanInterfaces[0] ?? null;
        if (!fallbackInterface) {
          setError(buildTrustedLanNoPrivateInterfaceMessage(trustedLanValidationMessageLabels()));
          return false;
        }
        if (!trustedLanSelectedInterfaceOption) {
          setTrustedLanInterfaceAddressDraft(fallbackInterface.address);
        }
        setTrustedLanEnabledDraft(true);
        const hostEnabled = await persistTrustedLanConfig(
          true,
          buildTrustedLanConfigMessage("enabled", trustedLanConfigMessageLabels()),
        );
        if (!hostEnabled) {
          setTrustedLanEnabledDraft(Boolean(trustedLanStatus?.enabled));
          return false;
        }
      } else if (nextMode === "CLIENT") {
        setTrustedLanEnabledDraft(false);
        const disabled = await persistTrustedLanConfig(
          false,
          buildTrustedLanConfigMessage("disabled", trustedLanConfigMessageLabels()),
        );
        if (!disabled) {
          setTrustedLanEnabledDraft(Boolean(trustedLanStatus?.enabled));
          return false;
        }
      }

      const saved = await saveLibrarySyncSettings(
        buildLibrarySyncSaveSettingsInput({
          current: librarySyncSettings,
          targetMode: nextMode,
          deviceName: librarySyncDeviceNameDraft,
          hostBaseUrlDraft: librarySyncHostBaseUrlDraft,
        }),
      );

      clearDashboardPageSnapshot();
      setLibrarySyncSettings(saved);
      setLibrarySyncModeDraft((saved.mode as LibrarySyncMode) ?? "STANDALONE");
      setLibrarySyncDeviceNameDraft(saved.device_name ?? "");
      setLibrarySyncHostBaseUrlDraft(saved.host_base_url ?? "");
      if (saved.mode !== "CLIENT") {
        setLibrarySyncValidation(null);
        setLibrarySyncSnapshot(null);
      }
      setInfo(buildLibrarySyncActionMessage("settingsSaved", librarySyncActionMessageLabels()));
      return true;
    } catch (saveError) {
      console.error(saveError);
      setError(
        toErrorMessage(
          saveError,
          buildLibrarySyncErrorMessage("settingsSaveFailed", librarySyncErrorMessageLabels()),
        ),
      );
      return false;
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncDeviceNameDraft,
    librarySyncErrorMessageLabels,
    librarySyncHostBaseUrlDraft,
    librarySyncModeDraft,
    librarySyncSettings,
    persistTrustedLanConfig,
    setError,
    setInfo,
    setLibrarySyncBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncValidation,
    setTrustedLanEnabledDraft,
    setTrustedLanInterfaceAddressDraft,
    tauri,
    trustedLanConfigMessageLabels,
    trustedLanInterfaces,
    trustedLanSelectedInterfaceOption,
    trustedLanStatus?.enabled,
    trustedLanValidationMessageLabels,
  ]);

  const handleSaveLibrarySyncDeviceName = useCallback(async () => {
    if (!tauri || librarySyncBusy || !librarySyncSettings) {
      return false;
    }
    setLibrarySyncBusy(true);
    setLibrarySyncDeviceNameSaveBusy(true);
    setError(null);
    setInfo(null);
    try {
      const saved = await persistLibrarySyncDeviceName({
        current: librarySyncSettings,
        deviceName: librarySyncDeviceNameDraft,
      });
      setLibrarySyncSettings(saved);
      setLibrarySyncDeviceNameDraft(saved.device_name ?? "");
      setInfo(
        buildLibrarySyncActionMessage("deviceNameSaved", librarySyncActionMessageLabels()),
      );
      return true;
    } catch (saveError) {
      console.error(saveError);
      setError(
        toErrorMessage(
          saveError,
          buildLibrarySyncErrorMessage(
            "deviceNameSaveFailed",
            librarySyncErrorMessageLabels(),
          ),
        ),
      );
      return false;
    } finally {
      setLibrarySyncDeviceNameSaveBusy(false);
      setLibrarySyncBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncBusy,
    librarySyncDeviceNameDraft,
    librarySyncErrorMessageLabels,
    librarySyncSettings,
    setError,
    setInfo,
    setLibrarySyncBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncDeviceNameSaveBusy,
    setLibrarySyncSettings,
    tauri,
  ]);

  const handleValidateLibrarySyncHost = useCallback(async () => {
    const baseUrl = librarySyncHostBaseUrlDraft.trim() || settingsClientHostBaseUrl || "";
    const expectedLibraryId = librarySyncSettings?.library_id ?? null;
    if (!tauri || !baseUrl) {
      return;
    }
    setLibrarySyncValidationBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await validateLibrarySyncHost(baseUrl, expectedLibraryId);
      setLibrarySyncValidation(result);
      const refreshed = await getLibrarySyncSettings();
      setLibrarySyncSettings(refreshed);
      setLibrarySyncSnapshot(refreshed.cached_snapshot ?? null);
      if (result.ok && result.matches_library_id) {
        if (result.pairing_checked && !result.pairing_valid) {
          return;
        }
        showTransientInfo(
          buildLibrarySyncActionMessage("hostCheckPassed", librarySyncActionMessageLabels()),
        );
      }
    } catch (validationError) {
      console.error(validationError);
      setError(
        toErrorMessage(
          validationError,
          buildLibrarySyncErrorMessage("hostCheckFailed", librarySyncErrorMessageLabels()),
        ),
      );
    } finally {
      setLibrarySyncValidationBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    librarySyncHostBaseUrlDraft,
    librarySyncSettings,
    setError,
    setInfo,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncValidation,
    setLibrarySyncValidationBusy,
    settingsClientHostBaseUrl,
    showTransientInfo,
    tauri,
  ]);

  const handlePairLibrarySyncHost = useCallback(async () => {
    const pairingInput = librarySyncPairingDraft.trim();
    const derivedBaseUrl = extractBaseUrlFromPairingInput(pairingInput);
    if (!tauri || !pairingInput || !derivedBaseUrl) {
      if (tauri && pairingInput && !derivedBaseUrl) {
        setError(
          buildLibrarySyncPairingMessage(
            "pairingLinkRequired",
            librarySyncPairingMessageLabels(),
          ),
        );
      }
      return;
    }
    setLibrarySyncBusy(true);
    setError(null);
    setInfo(null);
    let validation: LibrarySyncHostValidationResult | null = null;
    try {
      validation = await validateLibrarySyncHost(derivedBaseUrl, null);
      setLibrarySyncValidation(validation);
      if (!validation.ok || !validation.library_id) {
        throw new Error(validation.message);
      }
      await saveLibrarySyncSettings(
        buildLibrarySyncPairingSettingsInput({
          deviceName: librarySyncDeviceNameDraft,
          libraryId: validation.library_id,
          hostBaseUrl: validation.base_url,
          hostDeviceName: validation.device_name,
        }),
      );
      clearDashboardPageSnapshot();
      const saved = await pairLibrarySyncHost(validation.base_url, pairingInput);
      setLibrarySyncSettings(saved);
      setLibrarySyncModeDraft("CLIENT");
      setLibrarySyncDeviceNameDraft(saved.device_name ?? librarySyncDeviceNameDraft);
      setLibrarySyncHostBaseUrlDraft(saved.host_base_url ?? validation.base_url);
      setLibrarySyncPairingDraft("");
      setInfo(buildLibrarySyncActionMessage("clientPaired", librarySyncActionMessageLabels()));
    } catch (pairError) {
      console.error(pairError);
      if (validation) {
        setLibrarySyncValidation({
          ...validation,
          ok: false,
          matches_library_id: false,
          message: buildLibrarySyncPairingMessage(
            "pairingInvalid",
            librarySyncPairingMessageLabels(),
          ),
        });
        setError(null);
      } else {
        setError(
          toErrorMessage(
            pairError,
            buildLibrarySyncPairingMessage(
              "pairHostFailed",
              librarySyncPairingMessageLabels(),
            ),
          ),
        );
      }
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncDeviceNameDraft,
    librarySyncPairingDraft,
    librarySyncPairingMessageLabels,
    setError,
    setInfo,
    setLibrarySyncBusy,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    setLibrarySyncValidation,
    tauri,
  ]);

  const handleClearLibrarySyncClientAuth = useCallback(async () => {
    if (!tauri || librarySyncBusy) {
      return;
    }
    setLibrarySyncBusy(true);
    setError(null);
    setInfo(null);
    try {
      const cleared = await clearLibrarySyncClientAuth();
      clearDashboardPageSnapshot();
      setLibrarySyncSettings(cleared);
      setLibrarySyncPairingDraft("");
      setInfo(buildLibrarySyncActionMessage("clientAuthCleared", librarySyncActionMessageLabels()));
    } catch (clearError) {
      console.error(clearError);
      setError(
        toErrorMessage(
          clearError,
          buildLibrarySyncErrorMessage("clearClientAuthFailed", librarySyncErrorMessageLabels()),
        ),
      );
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncBusy,
    librarySyncErrorMessageLabels,
    setError,
    setInfo,
    setLibrarySyncBusy,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    tauri,
  ]);

  const handleRenewLibrarySyncClientAuth = useCallback(async () => {
    if (!tauri || librarySyncBusy) {
      return;
    }
    setLibrarySyncBusy(true);
    setError(null);
    setInfo(null);
    try {
      const cleared = await clearLibrarySyncClientAuth();
      clearDashboardPageSnapshot();
      setLibrarySyncSettings(cleared);
      setLibrarySyncValidation(null);
      setLibrarySyncPairingDraft("");
      setInfo(buildLibrarySyncActionMessage("renewPairing", librarySyncActionMessageLabels()));
    } catch (clearError) {
      console.error(clearError);
      setError(
        toErrorMessage(
          clearError,
          buildLibrarySyncErrorMessage("clearClientAuthFailed", librarySyncErrorMessageLabels()),
        ),
      );
    } finally {
      setLibrarySyncBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncBusy,
    librarySyncErrorMessageLabels,
    setError,
    setInfo,
    setLibrarySyncBusy,
    setLibrarySyncPairingDraft,
    setLibrarySyncSettings,
    setLibrarySyncValidation,
    tauri,
  ]);

  const handleFetchLibrarySyncSnapshot = useCallback(async () => {
    if (!tauri || !librarySyncSettings) {
      return;
    }
    setLibrarySyncSnapshotBusy(true);
    setError(null);
    setInfo(null);
    try {
      const refreshed = await refreshLibrarySyncSnapshot(
        librarySyncHostBaseUrlDraft,
        librarySyncSettings.library_id,
      );
      setLibrarySyncSettings(refreshed.syncSettings);
      setLibrarySyncSnapshot(refreshed.snapshot);
      setInfo(buildLibrarySyncActionMessage("snapshotRefreshed", librarySyncActionMessageLabels()));
    } catch (snapshotError) {
      console.error(snapshotError);
      setError(
        toErrorMessage(
          snapshotError,
          buildLibrarySyncErrorMessage("snapshotFailed", librarySyncErrorMessageLabels()),
        ),
      );
    } finally {
      setLibrarySyncSnapshotBusy(false);
    }
  }, [
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    librarySyncHostBaseUrlDraft,
    librarySyncSettings,
    setError,
    setInfo,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncSnapshotBusy,
    tauri,
  ]);

  return {
    handleClearLibrarySyncClientAuth,
    handleFetchLibrarySyncSnapshot,
    handlePairLibrarySyncHost,
    handleRenewLibrarySyncClientAuth,
    handleSaveLibrarySyncDeviceName,
    handleSaveLibrarySyncSettings,
    handleValidateLibrarySyncHost,
  };
}
