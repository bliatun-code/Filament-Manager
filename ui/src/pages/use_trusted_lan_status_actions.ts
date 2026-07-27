import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toErrorMessage } from "../lib/error_text";
import { parsePositiveInt, waitForMs } from "../lib/settings_utils";
import {
  listTrustedLanPairedBrowsers,
  updateTrustedLanCompanionConfig,
  type TrustedLanCompanionStatus,
  type TrustedLanInterfaceOption,
  type TrustedLanPairedBrowser,
} from "../lib/tauri_client";
import { loadTrustedLanSettingsData } from "../lib/trusted_lan_data_source";
import {
  buildTrustedLanConfigMessage,
  buildTrustedLanLoadMessage,
  buildTrustedLanNoPrivateInterfaceMessage,
  findNewTrustedLanActiveBrowserIds,
  type TrustedLanConfigMessageLabels,
  type TrustedLanLoadMessageLabels,
  type TrustedLanValidationMessageLabels,
} from "./settings_companion_model";

type RefreshTrustedLanPairedBrowsersOptions = {
  announceNewPairing?: boolean;
  suppressErrors?: boolean;
};

type UseTrustedLanStatusActionsInput = {
  refreshInFlightRef: MutableRefObject<boolean>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  setShowTrustedLanNetworkEditor: Dispatch<SetStateAction<boolean>>;
  setTrustedLanActionBusy: Dispatch<SetStateAction<boolean>>;
  setTrustedLanInterfaces: Dispatch<SetStateAction<TrustedLanInterfaceOption[]>>;
  setTrustedLanLoading: Dispatch<SetStateAction<boolean>>;
  setTrustedLanPairedBrowsers: Dispatch<SetStateAction<TrustedLanPairedBrowser[]>>;
  setTrustedLanPairingExpiresAtMs: Dispatch<SetStateAction<number | null>>;
  setTrustedLanPairingLabel: Dispatch<SetStateAction<string | null>>;
  setTrustedLanPairingLink: Dispatch<SetStateAction<string | null>>;
  setTrustedLanStatus: Dispatch<SetStateAction<TrustedLanCompanionStatus | null>>;
  syncTrustedLanDraftFromStatus: (
    status: TrustedLanCompanionStatus | null,
    interfaces?: TrustedLanInterfaceOption[],
  ) => void;
  tauri: boolean;
  trustedLanConfigMessageLabels: () => TrustedLanConfigMessageLabels;
  trustedLanInterfaces: TrustedLanInterfaceOption[];
  trustedLanLoadMessageLabels: () => TrustedLanLoadMessageLabels;
  trustedLanPairedBrowsersRef: MutableRefObject<TrustedLanPairedBrowser[]>;
  trustedLanPortDraft: string;
  trustedLanSelectedInterfaceOption: TrustedLanInterfaceOption | null;
  trustedLanValidationMessageLabels: () => TrustedLanValidationMessageLabels;
};

export function useTrustedLanStatusActions({
  refreshInFlightRef,
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
}: UseTrustedLanStatusActionsInput) {
  const loadTrustedLanCompanionStatus = useCallback(async (): Promise<TrustedLanCompanionStatus | null> => {
    if (!tauri) {
      return null;
    }
    setTrustedLanLoading(true);
    try {
      const trustedLanData = await loadTrustedLanSettingsData();

      setTrustedLanStatus(trustedLanData.status);
      setTrustedLanInterfaces(trustedLanData.interfaces);
      setTrustedLanPairedBrowsers(trustedLanData.pairedBrowsers);
      syncTrustedLanDraftFromStatus(trustedLanData.status, trustedLanData.interfaces);

      if (trustedLanData.statusError) {
        console.error(trustedLanData.statusError);
        setError(
          toErrorMessage(
            trustedLanData.statusError,
            buildTrustedLanLoadMessage("loadCompanionFailed", trustedLanLoadMessageLabels()),
          ),
        );
      }

      if (trustedLanData.interfacesError) {
        console.error(trustedLanData.interfacesError);
      }

      if (trustedLanData.pairedBrowsersError) {
        console.error(trustedLanData.pairedBrowsersError);
      }

      return trustedLanData.status;
    } catch (loadError) {
      console.error(loadError);
      setTrustedLanStatus(null);
      setTrustedLanInterfaces([]);
      setTrustedLanPairedBrowsers([]);
      setError(
        toErrorMessage(
          loadError,
          buildTrustedLanLoadMessage("loadCompanionFailed", trustedLanLoadMessageLabels()),
        ),
      );
      return null;
    } finally {
      setTrustedLanLoading(false);
    }
  }, [
    setError,
    setTrustedLanInterfaces,
    setTrustedLanLoading,
    setTrustedLanPairedBrowsers,
    setTrustedLanStatus,
    syncTrustedLanDraftFromStatus,
    tauri,
    trustedLanLoadMessageLabels,
  ]);

  const refreshTrustedLanPairedBrowsers = useCallback(
    async (options?: RefreshTrustedLanPairedBrowsersOptions): Promise<boolean> => {
      if (!tauri || refreshInFlightRef.current) {
        return true;
      }
      refreshInFlightRef.current = true;
      try {
        const nextBrowsers = await listTrustedLanPairedBrowsers();
        const newActiveIds = findNewTrustedLanActiveBrowserIds(
          trustedLanPairedBrowsersRef.current,
          nextBrowsers,
        );
        setTrustedLanPairedBrowsers(nextBrowsers);
        if (options?.announceNewPairing && newActiveIds.length > 0) {
          setInfo(buildTrustedLanLoadMessage("newBrowserPaired", trustedLanLoadMessageLabels()));
        }
        return true;
      } catch (refreshError) {
        console.error(refreshError);
        if (!options?.suppressErrors) {
          setError(
            toErrorMessage(
              refreshError,
              buildTrustedLanLoadMessage("refreshBrowsersFailed", trustedLanLoadMessageLabels()),
            ),
          );
        }
        return false;
      } finally {
        refreshInFlightRef.current = false;
      }
    },
    [
      refreshInFlightRef,
      setError,
      setInfo,
      setTrustedLanPairedBrowsers,
      tauri,
      trustedLanLoadMessageLabels,
      trustedLanPairedBrowsersRef,
    ],
  );

  const refreshTrustedLanStatusUntilSettled = useCallback(
    async (expectedEnabled: boolean): Promise<TrustedLanCompanionStatus | null> => {
      let latest = await loadTrustedLanCompanionStatus();
      if (!expectedEnabled) {
        return latest;
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (latest?.enabled && latest.running && latest.shell_reachable) {
          return latest;
        }
        await waitForMs(300);
        latest = await loadTrustedLanCompanionStatus();
      }

      return latest;
    },
    [loadTrustedLanCompanionStatus],
  );

  const persistTrustedLanConfig = useCallback(
    async (nextEnabled: boolean, successMessage: string): Promise<boolean> => {
      if (!tauri) {
        return false;
      }

      if (nextEnabled && !trustedLanSelectedInterfaceOption) {
        setError(buildTrustedLanNoPrivateInterfaceMessage(trustedLanValidationMessageLabels()));
        return false;
      }

      setTrustedLanActionBusy(true);
      setError(null);
      try {
        const nextStatus = await updateTrustedLanCompanionConfig({
          enabled: nextEnabled,
          selected_interface_name: trustedLanSelectedInterfaceOption?.name ?? null,
          selected_interface_address: trustedLanSelectedInterfaceOption?.address ?? null,
          listen_port: parsePositiveInt(trustedLanPortDraft, 4278),
        });
        setTrustedLanStatus(nextStatus);
        syncTrustedLanDraftFromStatus(nextStatus, trustedLanInterfaces);
        setShowTrustedLanNetworkEditor(false);
        setTrustedLanPairingLabel(null);
        setTrustedLanPairingExpiresAtMs(null);
        setTrustedLanPairingLink(null);
        setInfo(
          nextEnabled && !nextStatus.shell_reachable
            ? buildTrustedLanConfigMessage("starting", trustedLanConfigMessageLabels())
            : successMessage,
        );
        setTrustedLanActionBusy(false);

        void refreshTrustedLanStatusUntilSettled(nextEnabled).then((refreshedStatus) => {
          if (!nextEnabled) {
            return;
          }
          if (
            refreshedStatus?.enabled &&
            refreshedStatus.running &&
            refreshedStatus.shell_reachable
          ) {
            setInfo(successMessage);
            return;
          }
          setInfo(
            buildTrustedLanConfigMessage("enabledPending", trustedLanConfigMessageLabels()),
          );
        });
        return true;
      } catch (saveError) {
        console.error(saveError);
        setTrustedLanActionBusy(false);
        setError(
          toErrorMessage(
            saveError,
            buildTrustedLanConfigMessage("saveFailed", trustedLanConfigMessageLabels()),
          ),
        );
        return false;
      }
    },
    [
      refreshTrustedLanStatusUntilSettled,
      setError,
      setInfo,
      setShowTrustedLanNetworkEditor,
      setTrustedLanActionBusy,
      setTrustedLanPairingExpiresAtMs,
      setTrustedLanPairingLabel,
      setTrustedLanPairingLink,
      setTrustedLanStatus,
      syncTrustedLanDraftFromStatus,
      tauri,
      trustedLanConfigMessageLabels,
      trustedLanInterfaces,
      trustedLanPortDraft,
      trustedLanSelectedInterfaceOption,
      trustedLanValidationMessageLabels,
    ],
  );

  return {
    loadTrustedLanCompanionStatus,
    persistTrustedLanConfig,
    refreshTrustedLanPairedBrowsers,
  };
}
