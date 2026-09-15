import { useCallback, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { InventoryLabelSheetModalProps } from "../components/inventory_label_sheet_modal";
import { toErrorMessage } from "./error_text";
import type { useI18n } from "./i18n";
import type {
  InventoryLabelSheetItem,
  InventoryLabelSheetPaperId,
} from "./inventory_label_sheet_layout";
import { buildInventoryLabelSheetRows } from "./inventory_label_sheet_rows";
import {
  resolveInventoryBulkDataPlanRows,
  type InventoryBulkDataPlan,
} from "./inventory_bulk_actions_model";
import type { InventorySpool } from "./inventory_list_model";
import { exportInventoryLabelSheetPdf } from "./tauri_client";

type UseInventoryLabelSheetActionInput = {
  workspaceView: string;
  ready: boolean;
  loadingInventory: boolean;
  clientLibraryId: string | null;
  clientTargetGeneration: number | null;
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
  workspaceView, ready, loadingInventory, clientLibraryId, clientTargetGeneration,
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
  const [renderedSession, setRenderedSession] = useState<object | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<InventoryLabelSheetItem[]>([]);
  const authorityKey = JSON.stringify([workspaceView, ready, clientReadOnly, clientHostBaseUrl,
    clientLibraryId, clientTargetGeneration, locale]);
  const scope = useMemo(() => ({ key: authorityKey }), [authorityKey]);
  const eligibility = useMemo(() => ({ busy, loadingInventory, tauriAvailable, spools }),
    [busy, loadingInventory, tauriAvailable, spools]);
  const current = useRef<{ scope: object; session: object | null; phase: "idle" | "loading" | "ready" | "saving" } | null>(null);
  const latestEligibility = useRef(eligibility);
  useLayoutEffect(() => { latestEligibility.current = eligibility; }, [eligibility]);
  useLayoutEffect(() => {
    current.current = { scope, session: null, phase: "idle" };
    setRenderedSession(null);
    setOpen(false);
    setLoading(false);
    setSaving(false);
    setItems([]);
    return () => { current.current = null; };
  }, [scope]);
  const available = useCallback(() => ready && tauriAvailable && !busy && !loadingInventory &&
    current.current?.scope === scope && latestEligibility.current === eligibility,
    [ready, tauriAvailable, busy, loadingInventory, scope, eligibility]);
  const closeLabelSheet = useCallback((session: object | null) => {
    if (current.current?.scope !== scope || current.current.session !== session) return;
    current.current.session = null;
    current.current.phase = "idle";
    setRenderedSession(null);
    setOpen(false);
    setLoading(false);
    setSaving(false);
    setItems([]);
  }, [scope]);

  const openLabelSheet = useCallback(async (selectionPlan?: InventoryBulkDataPlan) => {
    if (!available() || current.current?.phase !== "idle") {
      return;
    }
    const session = {};
    const operation = current.current!;
    operation.session = session;
    setRenderedSession(session);
    operation.phase = "loading";
    const isCurrent = () => current.current === operation && operation.session === session;
    setOpen(true);
    setLoading(true);
    setItems([]);
    setError(null);
    setInfoMessage(null);
    try {
      const selectedRows = selectionPlan
        ? resolveInventoryBulkDataPlanRows(selectionPlan, spools)
        : null;
      if (selectedRows && !selectedRows.ok) {
        throw new Error(`Inventory selection is stale: ${selectedRows.error}`);
      }
      const [companionShellUrl, qrModule, labelModule] = await Promise.all([
        import("./spool_qr_artifacts").then(({ resolveSpoolQrCompanionShellUrl }) =>
          resolveSpoolQrCompanionShellUrl({ clientReadOnly, clientHostBaseUrl }),
        ),
        import("./filament_qr_payload"),
        import("./filament_label_print"),
      ]);
      if (!isCurrent()) return;
      const rows = await buildInventoryLabelSheetRows({
        spools: selectedRows?.ok ? [...selectedRows.rows] : spools,
        selectionMode: selectedRows?.ok ? "EXACT" : "ON_HAND",
        locale,
        companionShellUrl,
        labels: {
          borrowedIn: t("inventory.borrowedIn", "Borrowed in"),
          unknown: t("common.unknown", "Unknown"),
        },
        buildFilamentQrPayload: qrModule.buildFilamentQrPayload,
        buildFilamentLabelQrDataUrl: labelModule.buildFilamentLabelQrDataUrl,
      });
      if (!isCurrent()) return;
      const renderedItems = await Promise.all(
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
        );
      if (!isCurrent()) return;
      setItems(renderedItems);
      operation.phase = "ready";
    } catch (printError) {
      if (!isCurrent()) return;
      closeLabelSheet(session);
      setError(
        toErrorMessage(
          printError,
          t("settings.error.inventoryOverviewPrint", "Failed to create inventory label sheets."),
        ),
      );
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [
    available, closeLabelSheet,
    clientHostBaseUrl,
    clientReadOnly,
    locale,
    setError,
    setInfoMessage,
    spools,
    t,
  ]);

  const saveLabelSheet = useCallback(async (paperId: InventoryLabelSheetPaperId) => {
    if (!available() || !open || current.current?.session !== renderedSession || current.current?.phase !== "ready" || items.length === 0) {
      return;
    }
    const operation = current.current!;
    const session = operation.session;
    const isCurrent = () => current.current === operation && operation.session === session;
    operation.phase = "saving";
    setSaving(true);
    setError(null);
    setInfoMessage(null);
    try {
      const { buildInventoryLabelSheetPdfBase64 } = await import("./inventory_overview_print");
      if (!isCurrent()) return;
      const pdf = await buildInventoryLabelSheetPdfBase64(items, paperId);
      if (!isCurrent()) return;
      const exportedPath = await exportInventoryLabelSheetPdf(
        pdf,
        `filament-inventory-labels-${paperId}`,
      );
      if (!isCurrent()) return;
      setInfoMessage(
        t(
          "settings.inventoryOverviewPrintDone",
          "Inventory label sheet saved to {path}.",
          { path: exportedPath },
        ),
      );
      closeLabelSheet(session);
    } catch (printError) {
      if (!isCurrent()) return;
      setError(
        toErrorMessage(
          printError,
          t("settings.error.inventoryOverviewPrint", "Failed to create inventory label sheets."),
        ),
      );
    } finally {
      if (isCurrent()) { operation.phase = "ready"; setSaving(false); }
    }
  }, [available, open, renderedSession, items, closeLabelSheet, setError, setInfoMessage, t]);

  const modalProps: InventoryLabelSheetModalProps = {
    items,
    loading,
    onClose: () => closeLabelSheet(renderedSession),
    onSave: saveLabelSheet,
    open,
    saving,
  };

  return { modalProps, openLabelSheet };
}
