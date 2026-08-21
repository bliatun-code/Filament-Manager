import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { InventoryLabelSheetModalProps } from "../components/inventory_label_sheet_modal";
import { toErrorMessage } from "./error_text";
import type { useI18n } from "./i18n";
import type {
  InventoryLabelSheetItem,
  InventoryLabelSheetPaperId,
} from "./inventory_label_sheet_layout";
import { buildInventoryLabelSheetRows } from "./inventory_label_sheet_rows";
import type { InventorySpool } from "./inventory_list_model";
import { exportInventoryLabelSheetPdf } from "./tauri_client";

type UseInventoryLabelSheetActionInput = {
  busy: boolean;
  clientHostBaseUrl: string | null;
  clientReadOnly: boolean;
  locale: string;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  spools: InventorySpool[];
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryLabelSheetAction({
  busy,
  clientHostBaseUrl,
  clientReadOnly,
  locale,
  setError,
  setInfoMessage,
  spools,
  tauriAvailable,
  t,
}: UseInventoryLabelSheetActionInput) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<InventoryLabelSheetItem[]>([]);

  const openLabelSheet = useCallback(async () => {
    if (!tauriAvailable || busy || loading) {
      return;
    }
    setOpen(true);
    setLoading(true);
    setItems([]);
    setError(null);
    setInfoMessage(null);
    try {
      const [companionShellUrl, qrModule, labelModule] = await Promise.all([
        import("./spool_qr_artifacts").then(({ resolveSpoolQrCompanionShellUrl }) =>
          resolveSpoolQrCompanionShellUrl({ clientReadOnly, clientHostBaseUrl }),
        ),
        import("./filament_qr_payload"),
        import("./filament_label_print"),
      ]);
      const rows = await buildInventoryLabelSheetRows({
        spools,
        locale,
        companionShellUrl,
        labels: {
          borrowedIn: t("inventory.borrowedIn", "Borrowed in"),
          unknown: t("common.unknown", "Unknown"),
        },
        buildFilamentQrPayload: qrModule.buildFilamentQrPayload,
        buildFilamentLabelQrDataUrl: labelModule.buildFilamentLabelQrDataUrl,
      });
      setItems(
        await Promise.all(
          rows.map(async (row) => ({
            reference: row.reference,
            pngDataUrl: await labelModule.buildFilamentLabelPngDataUrl(
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
        ),
      );
    } catch (printError) {
      console.error(printError);
      setError(
        toErrorMessage(
          printError,
          t("settings.error.inventoryOverviewPrint", "Failed to create inventory label sheets."),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [
    busy,
    clientHostBaseUrl,
    clientReadOnly,
    loading,
    locale,
    setError,
    setInfoMessage,
    spools,
    t,
    tauriAvailable,
  ]);

  const saveLabelSheet = useCallback(async (paperId: InventoryLabelSheetPaperId) => {
    if (!tauriAvailable || saving || loading || items.length === 0) {
      return;
    }
    setSaving(true);
    setError(null);
    setInfoMessage(null);
    try {
      const { buildInventoryLabelSheetPdfBase64 } = await import("./inventory_overview_print");
      const exportedPath = await exportInventoryLabelSheetPdf(
        await buildInventoryLabelSheetPdfBase64(items, paperId),
        `filament-inventory-labels-${paperId}`,
      );
      setInfoMessage(
        t(
          "settings.inventoryOverviewPrintDone",
          "Inventory label sheet saved to {path}.",
          { path: exportedPath },
        ),
      );
      setOpen(false);
    } catch (printError) {
      console.error(printError);
      setError(
        toErrorMessage(
          printError,
          t("settings.error.inventoryOverviewPrint", "Failed to create inventory label sheets."),
        ),
      );
    } finally {
      setSaving(false);
    }
  }, [items, loading, saving, setError, setInfoMessage, t, tauriAvailable]);

  const modalProps: InventoryLabelSheetModalProps = {
    items,
    loading,
    onClose: () => setOpen(false),
    onSave: saveLabelSheet,
    open,
    saving,
  };

  return { modalProps, openLabelSheet };
}
