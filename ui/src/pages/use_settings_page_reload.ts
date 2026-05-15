import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type {
  BambuLiveIntegrationEntry,
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
  LibrarySyncSettings,
  MasterCatalogRow,
  PrinterOverviewRow,
  PrinterRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";
import { loadSettingsPageData } from "../lib/settings_data_source";
import {
  buildSettingsPageDataModel,
  buildSettingsPageLoadErrorMessage,
  type SettingsPageMessageLabels,
} from "./settings_page_model";
import type { LibrarySyncMode } from "./settings_library_sync_model";

type UseSettingsPageReloadInput = {
  setBambuLiveIntegrations: Dispatch<SetStateAction<Record<string, BambuLiveIntegrationEntry["config"]>>>;
  setCatalogMasters: Dispatch<SetStateAction<MasterCatalogRow[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLibrarySyncDeviceNameDraft: Dispatch<SetStateAction<string>>;
  setLibrarySyncHostBaseUrlDraft: Dispatch<SetStateAction<string>>;
  setLibrarySyncModeDraft: Dispatch<SetStateAction<LibrarySyncMode>>;
  setLibrarySyncSettings: Dispatch<SetStateAction<LibrarySyncSettings | null>>;
  setLibrarySyncSnapshot: Dispatch<SetStateAction<LibrarySyncRemoteSnapshot | null>>;
  setLibrarySyncValidation: Dispatch<SetStateAction<LibrarySyncHostValidationResult | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setPrinterOverview: Dispatch<SetStateAction<PrinterOverviewRow[]>>;
  setPrinters: Dispatch<SetStateAction<PrinterRow[]>>;
  setSpoolRows: Dispatch<SetStateAction<SpoolWithMasterRow[]>>;
  setSwatchDraftById: Dispatch<SetStateAction<Record<string, string>>>;
  settingsPageMessageLabels: () => SettingsPageMessageLabels;
  tauri: boolean;
};

export function useSettingsPageReload({
  setBambuLiveIntegrations,
  setCatalogMasters,
  setError,
  setLibrarySyncDeviceNameDraft,
  setLibrarySyncHostBaseUrlDraft,
  setLibrarySyncModeDraft,
  setLibrarySyncSettings,
  setLibrarySyncSnapshot,
  setLibrarySyncValidation,
  setLoading,
  setPrinterOverview,
  setPrinters,
  setSpoolRows,
  setSwatchDraftById,
  settingsPageMessageLabels,
  tauri,
}: UseSettingsPageReloadInput) {
  const silentReloadInFlightRef = useRef(false);

  return useCallback(async (options?: { silent?: boolean }) => {
    if (!tauri) {
      return;
    }
    if (options?.silent && silentReloadInFlightRef.current) {
      return;
    }
    if (options?.silent) {
      silentReloadInFlightRef.current = true;
    }
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const pageData = buildSettingsPageDataModel(
        await loadSettingsPageData({
          onHostLoadError: (loadError) => {
            console.warn(
              "Settings host printer overview unavailable, using cached snapshot.",
              loadError,
            );
          },
        }),
      );
      setPrinters(pageData.printers);
      setPrinterOverview(pageData.printerOverview);
      setSpoolRows(pageData.spoolRows);
      setBambuLiveIntegrations(pageData.bambuLiveIntegrations);
      setCatalogMasters(pageData.catalogRows);
      setLibrarySyncSettings(pageData.librarySyncSettings);
      setLibrarySyncModeDraft(pageData.librarySyncModeDraft);
      setLibrarySyncDeviceNameDraft(pageData.librarySyncDeviceNameDraft);
      setLibrarySyncHostBaseUrlDraft(pageData.librarySyncHostBaseUrlDraft);
      setLibrarySyncValidation(null);
      setLibrarySyncSnapshot(pageData.librarySyncSettings.cached_snapshot ?? null);
      setSwatchDraftById(pageData.swatchDraftById);
    } catch (loadError) {
      console.error(loadError);
      setError(buildSettingsPageLoadErrorMessage(settingsPageMessageLabels()));
    } finally {
      if (options?.silent) {
        silentReloadInFlightRef.current = false;
      }
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [
    setBambuLiveIntegrations,
    setCatalogMasters,
    setError,
    setLibrarySyncDeviceNameDraft,
    setLibrarySyncHostBaseUrlDraft,
    setLibrarySyncModeDraft,
    setLibrarySyncSettings,
    setLibrarySyncSnapshot,
    setLibrarySyncValidation,
    setLoading,
    setPrinterOverview,
    setPrinters,
    setSpoolRows,
    setSwatchDraftById,
    settingsPageMessageLabels,
    tauri,
  ]);
}
