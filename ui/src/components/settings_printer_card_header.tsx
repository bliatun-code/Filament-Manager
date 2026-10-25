import { describePrinterCapability } from "../lib/printer_profiles";
import type { PrinterRow } from "../lib/tauri_client";
import { inlineStatusSignalClass, type SemanticChipTone } from "../lib/chip_styles";
import { useI18n } from "../lib/i18n";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";
import { PrinterModelPreview } from "./printer_model_preview";
import { SettingsPrinterObservedDetailsToggle } from "./settings_printer_observed_details_toggle";

type SettingsPrinterCardHeaderProps = {
  actionsLocked: boolean;
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
  observedDetailsId: string;
  printer: PrinterRow;
  tauri: boolean;
};

export function SettingsPrinterCardHeader({
  actionsLocked,
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
  observedDetailsId,
  printer,
  tauri,
}: SettingsPrinterCardHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="settings-printer-balanced-header">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PrinterModelPreview
          model={printer.model}
          hasMultiMaterial={hasMultiMaterial}
          compact
        />
        <div className="min-w-0 break-words text-sm text-slate-700 dark:text-slate-200">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{printer.name}</h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{printer.model} · {hasMultiMaterial ? `${describePrinterCapability(t, printer.model, hasMultiMaterial)} · ` : ""}{configuredSetup}</p>
          {hasLiveIntegration ? <span className={inlineStatusSignalClass(liveStatusTone, "mt-2 text-xs")}>{t("settings.bambuLiveBadge", "Live")}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!isEditing ? (
          <>
            <button
              type="button"
              className={settingsActionButtonClass("neutral", "compact")}
              onClick={onToggleEdit}
              disabled={!tauri || busy || actionsLocked}
            >
              {t("settings.reconfigure", "Reconfigure")}
            </button>
            <button
              type="button"
              className={settingsActionButtonClass(
                confirmDelete ? "danger" : "dangerQuiet",
                "compact",
              )}
              onClick={onRemove}
              disabled={!tauri || busy || actionsLocked}
            >
              {confirmDelete
                ? t("settings.confirmRemove", "Confirm remove")
                : t("common.remove", "Remove")}
            </button>
          </>
        ) : null}
      </div>
      <div className="settings-printer-observed-toggle">
        {hasLiveIntegration && !isEditing ? (
          <SettingsPrinterObservedDetailsToggle
            controlsId={observedDetailsId}
            disabled={!tauri || busy || actionsLocked}
            expanded={isExpanded}
            hideLabel={t("settings.hideObservedDetails", "Hide observed details")}
            onToggle={onToggleDetails}
            showLabel={t(
              "settings.showObservedDetails",
              "Show observed details & capture",
            )}
          />
        ) : null}
      </div>
    </div>
  );
}
