import { formatFilamentDisplayTitle } from "../lib/display_format";
import {
  updateMasterCatalogEntry,
  type MasterCatalogRow,
} from "../lib/tauri_client";
import {
  buildSettingsNoMissingSwatchesMessage,
  buildSettingsSwatchBulkConfirmMessage,
  buildSettingsSwatchBulkResultMessage,
  buildSettingsSwatchErrorMessage,
  buildSettingsSwatchSavedMessage,
  resolveSettingsSwatchHex,
  type SettingsSwatchBulkMessageLabels,
  type SettingsSwatchErrorMessageLabels,
  type SettingsSwatchSavedMessageLabels,
} from "./settings_catalog_model";

type UseSettingsSwatchActionsOptions = {
  busy: boolean;
  clearConfirmBulkSwatch: () => void;
  confirmBulkSwatch: boolean;
  reloadSettings: () => Promise<void>;
  setConfirmBulkSwatch: (value: boolean) => void;
  setError: (value: string | null) => void;
  setInfo: (value: string | null) => void;
  setSwatchBusy: (value: boolean) => void;
  settingsSwatchBulkMessageLabels: () => SettingsSwatchBulkMessageLabels;
  settingsSwatchErrorMessageLabels: () => SettingsSwatchErrorMessageLabels;
  settingsSwatchSavedMessageLabels: () => SettingsSwatchSavedMessageLabels;
  swatchBusy: boolean;
  swatchDraftById: Record<string, string>;
  tauri: boolean;
  visibleMissingSwatchMasters: MasterCatalogRow[];
};

export function useSettingsSwatchActions({
  busy,
  clearConfirmBulkSwatch,
  confirmBulkSwatch,
  reloadSettings,
  setConfirmBulkSwatch,
  setError,
  setInfo,
  setSwatchBusy,
  settingsSwatchBulkMessageLabels,
  settingsSwatchErrorMessageLabels,
  settingsSwatchSavedMessageLabels,
  swatchBusy,
  swatchDraftById,
  tauri,
  visibleMissingSwatchMasters,
}: UseSettingsSwatchActionsOptions) {
  async function handleSaveMissingSwatch(master: MasterCatalogRow) {
    if (!tauri || busy || swatchBusy) {
      return;
    }
    const normalizedHex = resolveSettingsSwatchHex({ master, swatchDraftById });
    if (!normalizedHex) {
      setError(
        buildSettingsSwatchErrorMessage("invalidSwatchHex", settingsSwatchErrorMessageLabels()),
      );
      return;
    }
    setSwatchBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateMasterCatalogEntry({
        master_id: master.id,
        vendor: master.vendor,
        material: master.material,
        filament_name: master.filament_name,
        color_name: master.color_name,
        hex_color: normalizedHex,
        product_url: master.product_url ?? null,
        default_weight: master.default_weight,
      });
      setInfo(
        buildSettingsSwatchSavedMessage(
          formatFilamentDisplayTitle(master.material, master.filament_name, master.color_name),
          settingsSwatchSavedMessageLabels(),
        ),
      );
      await reloadSettings();
    } catch (saveError) {
      console.error(saveError);
      setError(
        buildSettingsSwatchErrorMessage("saveSwatchFailed", settingsSwatchErrorMessageLabels()),
      );
    } finally {
      setSwatchBusy(false);
    }
  }

  async function handleBulkAutoFillMissingSwatches() {
    if (!tauri || busy || swatchBusy) {
      return;
    }
    const targets = visibleMissingSwatchMasters;
    if (targets.length === 0) {
      clearConfirmBulkSwatch();
      setInfo(buildSettingsNoMissingSwatchesMessage(settingsSwatchBulkMessageLabels()));
      return;
    }
    if (!confirmBulkSwatch) {
      setError(null);
      setConfirmBulkSwatch(true);
      setInfo(buildSettingsSwatchBulkConfirmMessage(settingsSwatchBulkMessageLabels()));
      return;
    }
    clearConfirmBulkSwatch();
    setSwatchBusy(true);
    setError(null);
    setInfo(null);
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    try {
      for (const master of targets) {
        const normalizedHex = resolveSettingsSwatchHex({ master, swatchDraftById });
        if (!normalizedHex) {
          skipped += 1;
          continue;
        }
        try {
          await updateMasterCatalogEntry({
            master_id: master.id,
            vendor: master.vendor,
            material: master.material,
            filament_name: master.filament_name,
            color_name: master.color_name,
            hex_color: normalizedHex,
            product_url: master.product_url ?? null,
            default_weight: master.default_weight,
          });
          updated += 1;
        } catch (bulkError) {
          console.error(bulkError);
          failed += 1;
        }
      }

      await reloadSettings();
      const resultMessage = buildSettingsSwatchBulkResultMessage(
        { failed, skipped, updated },
        settingsSwatchBulkMessageLabels(),
      );
      if (resultMessage.kind === "error") {
        setError(resultMessage.message);
        return;
      }
      setInfo(resultMessage.message);
    } finally {
      setSwatchBusy(false);
    }
  }

  return {
    handleBulkAutoFillMissingSwatches,
    handleSaveMissingSwatch,
  };
}
