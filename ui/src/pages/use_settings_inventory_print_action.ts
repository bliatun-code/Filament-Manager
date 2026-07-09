import { type Dispatch, type SetStateAction } from "react";
import { toErrorMessage } from "../lib/error_text";
import {
  printLabelPdf,
  type TrustedLanCompanionStatus,
} from "../lib/tauri_client";
import type { Locale } from "../lib/i18n";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import {
  buildSettingsInventoryOverviewPrintErrorMessage,
  buildSettingsInventoryOverviewPrintPdfLabels,
  buildSettingsInventoryOverviewPrintRows,
  buildSettingsInventoryOverviewPrintSuccessMessage,
  buildSettingsInventoryPrintLabels,
  type SettingsInventoryOverviewPrintPdfLabels,
  type SettingsInventoryPrintLabels,
  type SettingsInventoryPrintMessageLabels,
} from "./settings_inventory_print_model";

type UseSettingsInventoryPrintActionInput = {
  busy: boolean;
  loadSettingsInventoryRows: () => Promise<NormalizedSpoolWithMasterRow[]>;
  locale: Locale;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  settingsClientHostBaseUrl: string | null;
  settingsClientReadOnly: boolean;
  settingsInventoryOverviewPrintMessageLabels: () => SettingsInventoryPrintMessageLabels;
  settingsInventoryOverviewPrintPdfLabels: () => SettingsInventoryOverviewPrintPdfLabels;
  settingsInventoryPrintLabels: () => SettingsInventoryPrintLabels;
  tauri: boolean;
  trustedLanStatus: TrustedLanCompanionStatus | null;
};

export function useSettingsInventoryPrintAction({
  busy,
  loadSettingsInventoryRows,
  locale,
  setBusy,
  setError,
  setInfo,
  settingsClientHostBaseUrl,
  settingsClientReadOnly,
  settingsInventoryOverviewPrintMessageLabels,
  settingsInventoryOverviewPrintPdfLabels,
  settingsInventoryPrintLabels,
  tauri,
  trustedLanStatus,
}: UseSettingsInventoryPrintActionInput) {
  async function handlePrintInventoryOverviewA4() {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const allRows = await loadSettingsInventoryRows();

      const [
        { buildFilamentQrPayload, resolvePreferredCompanionShellUrl },
        { buildFilamentLabelQrDataUrl },
        { buildInventoryOverviewPrintPdfBase64 },
      ] = await Promise.all([
        import("../lib/filament_qr_payload"),
        import("../lib/filament_label_print"),
        import("../lib/inventory_overview_print"),
      ]);

      const companionShellUrl = resolvePreferredCompanionShellUrl({
        clientReadOnly: settingsClientReadOnly,
        clientHostBaseUrl: settingsClientHostBaseUrl,
        trustedLanShellUrl: trustedLanStatus?.shell_url ?? null,
      });

      const printRows = await buildSettingsInventoryOverviewPrintRows({
        rows: allRows,
        locale,
        companionShellUrl,
        labels: buildSettingsInventoryPrintLabels(settingsInventoryPrintLabels()),
        buildFilamentQrPayload,
        buildFilamentLabelQrDataUrl,
      });

      const pdfBase64 = await buildInventoryOverviewPrintPdfBase64(
        printRows,
        buildSettingsInventoryOverviewPrintPdfLabels(settingsInventoryOverviewPrintPdfLabels()),
      );
      await printLabelPdf(pdfBase64, null, 1);
      setInfo(
        buildSettingsInventoryOverviewPrintSuccessMessage(
          settingsInventoryOverviewPrintMessageLabels(),
        ),
      );
    } catch (printError) {
      console.error(printError);
      setError(
        toErrorMessage(
          printError,
          buildSettingsInventoryOverviewPrintErrorMessage(
            settingsInventoryOverviewPrintMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return { handlePrintInventoryOverviewA4 };
}
