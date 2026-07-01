import type { PrinterFormCapacity } from "../lib/printer_form_model";
import {
  describePrinterCapability,
  multiMaterialSlotsInputLabel,
  multiMaterialUnitsInputLabel,
  type PrinterModelProfile,
} from "../lib/printer_profiles";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import type { ResolvedTheme } from "../lib/theme_mode";
import { useI18n } from "../lib/i18n";
import { AppModal } from "./app_modal";
import { modalFormInputClassName } from "./form_control_class";
import { ModalActionButton } from "./modal_action_button";
import { ModalHeader } from "./modal_chrome";
import { modalPanelClassName } from "./modal_panel_class";
import { PrinterModelPreview } from "./printer_model_preview";

type AddPrinterModalProps = {
  busy: boolean;
  tauri: boolean;
  printerModels: string[];
  resolvedTheme: ResolvedTheme;
  newPrinterModel: string;
  newPrinterName: string;
  newAmsUnits: string;
  newSlotsPerUnit: string;
  selectedModelProfile: PrinterModelProfile;
  newPrinterCapacity: PrinterFormCapacity;
  onClose: () => void;
  onSelectPrinterModel: (model: string) => void;
  onPrinterNameChange: (name: string) => void;
  onAmsUnitsChange: (units: string) => void;
  onSlotsPerUnitChange: (slotsPerUnit: string) => void;
  onAddPrinter: () => void;
};

export function AddPrinterModal({
  busy,
  tauri,
  printerModels,
  resolvedTheme,
  newPrinterModel,
  newPrinterName,
  newAmsUnits,
  newSlotsPerUnit,
  selectedModelProfile,
  newPrinterCapacity,
  onClose,
  onSelectPrinterModel,
  onPrinterNameChange,
  onAmsUnitsChange,
  onSlotsPerUnitChange,
  onAddPrinter,
}: AddPrinterModalProps) {
  const { t } = useI18n();

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={onClose}
      panelClassName={modalPanelClassName("lg", "p-0")}
    >
      <div>
        <ModalHeader
          eyebrow={t("nav.printers", "Printers")}
          title={t("settings.addPrinter", "Add printer")}
          subtitle={t(
            "settings.columnsHint",
            "Choose model, name and multi-material capacity. EXT stays available automatically.",
          )}
          onClose={onClose}
          closeLabel={t("common.close", "Close")}
          disabled={busy}
          className="px-6 py-5"
        />

        <div className="space-y-4 px-6 py-6">
          <div className="surface-card space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t("settings.selectPrinterModel", "Select printer model")}
              </label>
              <select
                value={newPrinterModel}
                onChange={(event) => onSelectPrinterModel(event.target.value)}
                className={modalFormInputClassName}
                disabled={!tauri || busy || printerModels.length === 0}
              >
                <option value="">
                  {t("settings.selectPrinterModel", "Select printer model")}
                </option>
                {printerModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t("settings.printerName", "Printer name")}
              </label>
              <input
                type="text"
                value={newPrinterName}
                onChange={(event) => onPrinterNameChange(event.target.value)}
                placeholder={t("settings.printerName", "Printer name")}
                className={modalFormInputClassName}
                disabled={!tauri || busy}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {multiMaterialUnitsInputLabel(t, newPrinterModel || "")}
                </label>
                <input
                  type="number"
                  min={0}
                  max={selectedModelProfile.maxUnits}
                  value={newAmsUnits}
                  onChange={(event) => onAmsUnitsChange(event.target.value)}
                  className={modalFormInputClassName}
                  title={multiMaterialUnitsInputLabel(t, newPrinterModel || "")}
                  disabled={!tauri || busy || selectedModelProfile.maxUnits === 0}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {multiMaterialSlotsInputLabel(t, newPrinterModel || "")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedModelProfile.maxSlotsPerUnit}
                  value={newSlotsPerUnit}
                  onChange={(event) => onSlotsPerUnitChange(event.target.value)}
                  className={modalFormInputClassName}
                  title={multiMaterialSlotsInputLabel(t, newPrinterModel || "")}
                  disabled={!tauri || busy || selectedModelProfile.maxUnits === 0}
                />
              </div>
            </div>

            <div
              className="surface-subtle flex items-center gap-3 p-3"
              style={printerBrandSurfaceStyle(newPrinterModel || null, "compact", resolvedTheme)}
            >
              <PrinterModelPreview
                model={newPrinterModel || "Printer"}
                hasMultiMaterial={newPrinterCapacity.hasMultiMaterial}
                compact
              />
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {describePrinterCapability(
                  t,
                  newPrinterModel || "",
                  newPrinterCapacity.hasMultiMaterial,
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <ModalActionButton
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              {t("common.close", "Close")}
            </ModalActionButton>
            <ModalActionButton
              type="button"
              variant="solid"
              onClick={onAddPrinter}
              disabled={!tauri || busy || !newPrinterModel || !newPrinterName.trim()}
            >
              {t("settings.addPrinter", "Add printer")}
            </ModalActionButton>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
