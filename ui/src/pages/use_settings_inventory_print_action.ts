import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SettingsInventoryLabelSheetModalProps } from "../components/settings_inventory_label_sheet_modal";
import { toErrorMessage } from "../lib/error_text";
import type {
  InventoryLabelSheetItem,
  InventoryLabelSheetPaperId,
} from "../lib/inventory_label_sheet_layout";
import {
  exportInventoryLabelSheetPdf,
  type TrustedLanCompanionStatus,
} from "../lib/tauri_client";
import type { Locale } from "../lib/i18n";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import {
  buildSettingsInventoryOverviewPrintErrorMessage,
  buildSettingsInventoryOverviewPrintRows,
  buildSettingsInventoryOverviewPrintSuccessMessage,
  buildSettingsInventoryPrintLabels,
  type SettingsInventoryPrintLabels,
  type SettingsInventoryPrintMessageLabels,
} from "./settings_inventory_print_model";

type UseSettingsInventoryPrintActionInput = {
  busy: boolean;
  initialOpen?: boolean;
  loadSettingsInventoryRows: () => Promise<NormalizedSpoolWithMasterRow[]>;
  locale: Locale;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  settingsClientHostBaseUrl: string | null;
  settingsClientReadOnly: boolean;
  settingsInventoryOverviewPrintMessageLabels: () => SettingsInventoryPrintMessageLabels;
  settingsInventoryPrintLabels: () => SettingsInventoryPrintLabels;
  tauri: boolean;
  trustedLanStatus: TrustedLanCompanionStatus | null;
};

export function useSettingsInventoryPrintAction({
  busy,
  initialOpen = false,
  loadSettingsInventoryRows,
  locale,
  setError,
  setInfo,
  settingsClientHostBaseUrl,
  settingsClientReadOnly,
  settingsInventoryOverviewPrintMessageLabels,
  settingsInventoryPrintLabels,
  tauri,
  trustedLanStatus,
}: UseSettingsInventoryPrintActionInput) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<InventoryLabelSheetItem[]>([]);
  const autoOpenedRef = useRef(false);

  const handleOpenInventoryLabelSheet = useCallback(async () => {
    if (!tauri || busy || loading) {
      return;
    }
    setOpen(true);
    setLoading(true);
    setItems([]);
    setError(null);
    setInfo(null);
    try {
      const allRows = await loadSettingsInventoryRows();
      const [
        { buildFilamentQrPayload, resolvePreferredCompanionShellUrl },
        { buildFilamentLabelPngDataUrl, buildFilamentLabelQrDataUrl },
      ] = await Promise.all([
        import("../lib/filament_qr_payload"),
        import("../lib/filament_label_print"),
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
      const renderedItems = await Promise.all(
        printRows.map(async (row) => ({
          reference: row.reference,
          pngDataUrl: await buildFilamentLabelPngDataUrl(
            {
              vendor: row.vendor,
              material: row.material,
              filamentName: row.filamentName,
              colorName: row.colorName,
              reference: row.reference,
              qrDataUrl: row.qrDataUrl,
            },
            "ptouch-24",
          ),
        })),
      );
      setItems(renderedItems);
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
      setLoading(false);
    }
  }, [
    busy,
    loadSettingsInventoryRows,
    loading,
    locale,
    setError,
    setInfo,
    settingsClientHostBaseUrl,
    settingsClientReadOnly,
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryPrintLabels,
    tauri,
    trustedLanStatus?.shell_url,
  ]);

  useEffect(() => {
    const companionLinkReady = settingsClientReadOnly
      ? Boolean(settingsClientHostBaseUrl?.trim())
      : Boolean(trustedLanStatus?.shell_url?.trim());
    if (
      !initialOpen ||
      autoOpenedRef.current ||
      !tauri ||
      busy ||
      !companionLinkReady
    ) {
      return;
    }
    autoOpenedRef.current = true;
    void handleOpenInventoryLabelSheet();
  }, [
    busy,
    handleOpenInventoryLabelSheet,
    initialOpen,
    settingsClientHostBaseUrl,
    settingsClientReadOnly,
    tauri,
    trustedLanStatus?.shell_url,
  ]);

  const handleSaveInventoryLabelSheet = useCallback(
    async (paperId: InventoryLabelSheetPaperId) => {
      if (!tauri || saving || loading || items.length === 0) {
        return;
      }
      setSaving(true);
      setError(null);
      setInfo(null);
      try {
        const { buildInventoryLabelSheetPdfBase64 } = await import(
          "../lib/inventory_overview_print"
        );
        const pdfBase64 = await buildInventoryLabelSheetPdfBase64(items, paperId);
        const exportedPath = await exportInventoryLabelSheetPdf(
          pdfBase64,
          `filament-inventory-labels-${paperId}`,
        );
        setInfo(
          buildSettingsInventoryOverviewPrintSuccessMessage(
            settingsInventoryOverviewPrintMessageLabels(),
            exportedPath,
          ),
        );
        setOpen(false);
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
        setSaving(false);
      }
    },
    [
      items,
      loading,
      saving,
      setError,
      setInfo,
      settingsInventoryOverviewPrintMessageLabels,
      tauri,
    ],
  );

  const inventoryLabelSheetModalProps: SettingsInventoryLabelSheetModalProps = {
    items,
    loading,
    onClose: () => setOpen(false),
    onSave: handleSaveInventoryLabelSheet,
    open,
    saving,
  };

  return {
    handleOpenInventoryLabelSheet,
    inventoryLabelSheetModalProps,
  };
}
