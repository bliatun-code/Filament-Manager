import { describePrinterCapability } from "../lib/printer_profiles";
import type { PrinterRow } from "../lib/tauri_client";
import { inlineStatusSignalClass, type SemanticChipTone } from "../lib/chip_styles";
import { useI18n } from "../lib/i18n";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";
import { PrinterModelPreview } from "./printer_model_preview";

type SettingsPrinterCardHeaderProps = {
  busy: boolean;
  configuredSetup: string;
  confirmDelete: boolean;
  hasLiveIntegration: boolean;
  hasMultiMaterial: boolean;
  isEditing: boolean;
  isExpanded: boolean;
  liveStatusTone: SemanticChipTone;
  onRemove: () => void;
  onToggleDetails: () => void;
  onToggleEdit: () => void;
  printer: PrinterRow;
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
  liveStatusTone,
  onRemove,
  onToggleDetails,
  onToggleEdit,
  printer,
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
                liveStatusTone,
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
            className={settingsActionButtonClass("neutral", "compact")}
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
          className={settingsActionButtonClass(isEditing ? "accent" : "neutral", "compact")}
          onClick={onToggleEdit}
          disabled={!tauri || busy}
        >
          {isEditing ? t("common.close", "Close") : t("settings.reconfigure", "Reconfigure")}
        </button>
        <button
          type="button"
          className={settingsActionButtonClass(confirmDelete ? "danger" : "dangerQuiet", "compact")}
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
