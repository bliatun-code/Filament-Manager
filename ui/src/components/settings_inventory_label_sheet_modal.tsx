import { useEffect, useMemo, useState } from "react";
import {
  INVENTORY_LABEL_SHEET_PAPER_PROFILES,
  inventoryLabelSheetLayout,
  type InventoryLabelSheetItem,
  type InventoryLabelSheetPaperId,
} from "../lib/inventory_label_sheet_layout";
import { useI18n } from "../lib/i18n";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";
import { AppModal } from "./app_modal";
import { ModalHeader } from "./modal_chrome";

export type InventoryLabelSheetModalProps = {
  items: InventoryLabelSheetItem[];
  loading: boolean;
  onClose: () => void;
  onSave: (paperId: InventoryLabelSheetPaperId) => Promise<void> | void;
  open: boolean;
  saving: boolean;
};

export function InventoryLabelSheetModal({
  items,
  loading,
  onClose,
  onSave,
  open,
  saving,
}: InventoryLabelSheetModalProps) {
  const { t } = useI18n();
  const [paperId, setPaperId] = useState<InventoryLabelSheetPaperId>("a4");
  const [pageIndex, setPageIndex] = useState(0);
  const layout = useMemo(() => inventoryLabelSheetLayout(paperId), [paperId]);
  const pageCount = Math.max(1, Math.ceil(items.length / layout.itemsPerPage));
  const visibleItems = items.slice(
    pageIndex * layout.itemsPerPage,
    (pageIndex + 1) * layout.itemsPerPage,
  );

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    if (open) {
      setPageIndex(0);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const labelCountText = t(
    "settings.inventoryOverviewLabelCount",
    "{count} labels · {perPage} per page",
    { count: items.length, perPage: layout.itemsPerPage },
  );
  const pageCountText = t(
    "settings.inventoryOverviewPageCount",
    "Page {page} of {pages}",
    { page: pageIndex + 1, pages: pageCount },
  );

  return (
    <AppModal
      zIndex={80}
      onBackdropClose={onClose}
      panelClassName="flex max-h-[calc(100dvh-3rem)] w-[min(94vw,72rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <ModalHeader
        eyebrow={t("settings.inventoryOverviewPrint", "Inventory label sheets")}
        title={t("settings.inventoryOverviewBuilderTitle", "Create inventory label sheet")}
        subtitle={t(
          "settings.inventoryOverviewBuilderSubtitle",
          "Choose the paper format, review the pages, and save a print-ready PDF.",
        )}
        closeLabel={t("common.close", "Close")}
        onClose={onClose}
      />

      <div
        id="inventory-label-sheet-builder"
        className="grid min-h-0 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)]"
      >
        <section aria-label={t("settings.inventoryOverviewPreview", "Sheet preview")}>
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-950/60 sm:p-5">
            <div
              className="relative mx-auto w-full max-w-[31rem] overflow-hidden bg-white shadow-xl ring-1 ring-slate-300"
              style={{ aspectRatio: `${layout.paper.widthMm} / ${layout.paper.heightMm}` }}
            >
              {visibleItems.map((item, index) => {
                const column = index % layout.columns;
                const row = Math.floor(index / layout.columns);
                const leftMm =
                  layout.offsetXmm +
                  column * (layout.labelWidthMm + layout.horizontalGapMm);
                const topMm =
                  layout.offsetYmm + row * (layout.labelHeightMm + layout.verticalGapMm);
                return (
                  <img
                    key={item.reference}
                    src={item.pngDataUrl}
                    alt={`${t("inventory.labelPreview", "Label preview")} ${item.reference}`}
                    className="absolute bg-white object-fill outline outline-1 outline-slate-300"
                    style={{
                      left: `${(leftMm / layout.paper.widthMm) * 100}%`,
                      top: `${(topMm / layout.paper.heightMm) * 100}%`,
                      width: `${(layout.labelWidthMm / layout.paper.widthMm) * 100}%`,
                      height: `${(layout.labelHeightMm / layout.paper.heightMm) * 100}%`,
                      imageRendering: "auto",
                    }}
                  />
                );
              })}

              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/92 px-6 text-center text-sm font-medium text-slate-500">
                  {t("settings.inventoryOverviewRendering", "Preparing label sheets...")}
                </div>
              ) : items.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-slate-500">
                  {t(
                    "settings.inventoryOverviewEmpty",
                    "No on-hand filament rolls to include.",
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              className={settingsActionButtonClass()}
              aria-label={t("settings.inventoryOverviewPreviousPage", "Previous page")}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              disabled={loading || pageIndex === 0}
            >
              ←
            </button>
            <div className="text-center">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {pageCountText}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {labelCountText}
              </div>
            </div>
            <button
              type="button"
              className={settingsActionButtonClass()}
              aria-label={t("settings.inventoryOverviewNextPage", "Next page")}
              onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
              disabled={loading || pageIndex >= pageCount - 1}
            >
              →
            </button>
          </div>
        </section>

        <section className="flex flex-col">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {t("settings.inventoryOverviewPaperFormat", "Paper format")}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">
            {INVENTORY_LABEL_SHEET_PAPER_PROFILES.map((paper) => {
              const selected = paper.id === paperId;
              const title =
                paper.id === "a4"
                  ? t("settings.inventoryOverviewPaperA4", "A4")
                  : t("settings.inventoryOverviewPaperLetter", "US Letter");
              const hint =
                paper.id === "a4"
                  ? t("settings.inventoryOverviewPaperA4Hint", "210 × 297 mm")
                  : t(
                      "settings.inventoryOverviewPaperLetterHint",
                      "8.5 × 11 in · 216 × 279 mm",
                    );
              return (
                <button
                  key={paper.id}
                  type="button"
                  aria-pressed={selected}
                  className={`rounded-lg border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    selected
                      ? "border-sky-500 bg-sky-50 text-slate-950 dark:bg-sky-950/50 dark:text-white"
                      : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200"
                  }`}
                  onClick={() => {
                    setPaperId(paper.id);
                    setPageIndex(0);
                  }}
                >
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {hint}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
            60 × 24 mm · {layout.columns} × {layout.rows} · {layout.itemsPerPage}{" "}
            {t("settings.inventoryOverviewPerPage", "labels per page")}
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
            {t(
              "settings.inventoryOverviewSingleLabelHint",
              "Need just one label? Open the roll in Inventory and choose Create QR label.",
            )}
          </div>

          <button
            type="button"
            className={`mt-4 w-full ${settingsActionButtonClass("accent")}`}
            onClick={() => void onSave(paperId)}
            disabled={loading || saving || items.length === 0}
          >
            {saving
              ? t("settings.inventoryOverviewPrintSaving", "Saving PDF...")
              : t("settings.inventoryOverviewPrintSave", "Save PDF to Downloads")}
          </button>
        </section>
      </div>
    </AppModal>
  );
}

export type SettingsInventoryLabelSheetModalProps = InventoryLabelSheetModalProps;
export const SettingsInventoryLabelSheetModal = InventoryLabelSheetModal;
