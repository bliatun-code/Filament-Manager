import { describePrinterCapability } from "../lib/printer_profiles";
import type { PrinterRow } from "../lib/tauri_client";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { useI18n } from "../lib/i18n";
import { PrinterModelPreview } from "./printer_model_preview";

type SettingsPrinterCardHeaderProps = {
  busy: boolean;
  configuredSetup: string;
  confirmDelete: boolean;
  hasLiveIntegration: boolean;
  hasMultiMaterial: boolean;
  isEditing: boolean;
  isExpanded: boolean;
  onRemove: () => void;
  onToggleDetails: () => void;
  onToggleEdit: () => void;
  printer: PrinterRow;
  reviewTrayCount: number;
  tauri: boolean;
};

export function SettingsPrinterCardHeader({
  busy,
  configuredSetup,
  confirmDelete,
  hasLiveIntegration,
  hasMultiMaterial,
  isEditing,
  isExpanded,
  onRemove,
  onToggleDetails,
  onToggleEdit,
  printer,
  reviewTrayCount,
  tauri,
}: SettingsPrinterCardHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <PrinterModelPreview
          model={printer.model}
          hasMultiMaterial={hasMultiMaterial}
          compact
        />
        <div className="text-sm text-slate-700 dark:text-slate-200">
          <span className="font-semibold text-slate-900 dark:text-slate-50">
            {printer.name}
          </span>{" "}
          {hasLiveIntegration ? (
            <span
              className={inlineStatusSignalClass(
                reviewTrayCount > 0 ? "warning" : "neutral",
                "text-[11px]",
              )}
            >
              {t("settings.bambuLiveBadge", "Live")}
            </span>
          ) : null}{" "}
          · {printer.model} · {describePrinterCapability(t, printer.model, hasMultiMaterial)} ·{" "}
          {configuredSetup}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasLiveIntegration ? (
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
            onClick={onToggleDetails}
            disabled={!tauri}
          >
            {isExpanded
              ? t("settings.hideObservedDetails", "Hide observed details")
              : t("settings.showObservedDetails", "Show observed details & capture")}
          </button>
        ) : null}
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
            isEditing
              ? "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100"
              : "border-slate-200 text-slate-700 dark:border-slate-500 dark:text-slate-200"
          }`}
          onClick={onToggleEdit}
          disabled={!tauri || busy}
        >
          {isEditing ? t("common.close", "Close") : t("settings.reconfigure", "Reconfigure")}
        </button>
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
            confirmDelete
              ? "border-rose-500 bg-rose-600 text-white dark:border-rose-400 dark:bg-rose-500 dark:text-slate-900"
              : "border-rose-200 text-rose-700 dark:border-rose-500/50 dark:text-rose-300"
          }`}
          onClick={onRemove}
          disabled={!tauri || busy}
        >
          {confirmDelete
            ? t("settings.confirmRemove", "Confirm remove")
            : t("common.remove", "Remove")}
        </button>
      </div>
    </div>
  );
}
