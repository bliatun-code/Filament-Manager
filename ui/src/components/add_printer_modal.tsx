import { useEffect, useState } from "react";
import type { PrinterFormCapacity } from "../lib/printer_form_model";
import type { BambuTlsTrustAction } from "../lib/tauri_client";
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
import { ModalFormField, ModalHeader } from "./modal_chrome";
import { modalPanelClassName } from "./modal_panel_class";
import { PrinterModelPreview } from "./printer_model_preview";
import { SettingsBambuLiveSecurityControls } from "./settings_bambu_live_security_controls";

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
  bambuLiveAvailable: boolean;
  newBambuLiveEnabled: boolean;
  newBambuLiveHost: string;
  newBambuLiveAccessCode: string;
  newBambuLivePrinterSerial: string;
  newBambuLiveTlsCertificateFingerprint: string | null;
  newBambuLiveTlsSpkiFingerprint: string | null;
  newBambuLiveTlsTrustAction: BambuTlsTrustAction;
  onClose: () => void;
  onSelectPrinterModel: (model: string) => void;
  onPrinterNameChange: (name: string) => void;
  onAmsUnitsChange: (units: string) => void;
  onSlotsPerUnitChange: (slotsPerUnit: string) => void;
  onBambuLiveEnabledChange: (enabled: boolean) => void;
  onBambuLiveHostChange: (host: string) => void;
  onBambuLiveAccessCodeChange: (accessCode: string) => void;
  onBambuLivePrinterSerialChange: (serial: string) => void;
  onBambuLiveIdentityCheck: () => void;
  onBambuLiveTlsTrustActionChange: (action: BambuTlsTrustAction) => void;
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
  bambuLiveAvailable,
  newBambuLiveEnabled,
  newBambuLiveHost,
  newBambuLiveAccessCode,
  newBambuLivePrinterSerial,
  newBambuLiveTlsCertificateFingerprint,
  newBambuLiveTlsSpkiFingerprint,
  newBambuLiveTlsTrustAction,
  onClose,
  onSelectPrinterModel,
  onPrinterNameChange,
  onAmsUnitsChange,
  onSlotsPerUnitChange,
  onBambuLiveEnabledChange,
  onBambuLiveHostChange,
  onBambuLiveAccessCodeChange,
  onBambuLivePrinterSerialChange,
  onBambuLiveIdentityCheck,
  onBambuLiveTlsTrustActionChange,
  onAddPrinter,
}: AddPrinterModalProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<"PRINTER" | "LIVE">("PRINTER");
  useEffect(() => {
    if (!bambuLiveAvailable) {
      setStep("PRINTER");
      onBambuLiveEnabledChange(false);
    }
  }, [bambuLiveAvailable, onBambuLiveEnabledChange]);
  const liveIdentityReady = Boolean(newBambuLiveTlsCertificateFingerprint && newBambuLiveTlsSpkiFingerprint);

  return (
    <AppModal closeOnBackdrop onBackdropClose={onClose} panelClassName={modalPanelClassName("lg", "p-0")}>
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
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span aria-current={step === "PRINTER" ? "step" : undefined}>1. {t("nav.printers", "Printer")}</span>
            {bambuLiveAvailable ? (
              <>
                <span>→</span>
                <span aria-current={step === "LIVE" ? "step" : undefined}>
                  2. {t("settings.bambuLiveTitle", "Bambu Live")}
                </span>
              </>
            ) : null}
          </div>
          {step === "PRINTER" ? (
            <div className="surface-card space-y-4">
              <ModalFormField label={t("settings.selectPrinterModel", "Select printer model")}>
                <select
                  value={newPrinterModel}
                  onChange={(event) => onSelectPrinterModel(event.target.value)}
                  className={modalFormInputClassName}
                  disabled={!tauri || busy || printerModels.length === 0}
                >
                  <option value="">{t("settings.selectPrinterModel", "Select printer model")}</option>
                  {printerModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </ModalFormField>

              <ModalFormField label={t("settings.printerName", "Printer name")}>
                <input
                  type="text"
                  value={newPrinterName}
                  onChange={(event) => onPrinterNameChange(event.target.value)}
                  placeholder={t("settings.printerName", "Printer name")}
                  className={modalFormInputClassName}
                  disabled={!tauri || busy}
                />
              </ModalFormField>

              <div className="grid grid-cols-2 gap-3">
                <ModalFormField label={multiMaterialUnitsInputLabel(t, newPrinterModel || "")}>
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
                </ModalFormField>
                <ModalFormField label={multiMaterialSlotsInputLabel(t, newPrinterModel || "")}>
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
                </ModalFormField>
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
                  {describePrinterCapability(t, newPrinterModel || "", newPrinterCapacity.hasMultiMaterial)}
                </div>
              </div>
            </div>
          ) : (
            <div className="surface-card space-y-4" data-testid="add-printer-bambu-live-step">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {t("settings.bambuLiveTitle", "Bambu Live")}
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {t(
                    "settings.bambuLiveAddHint",
                    "Connect now to see live printer status, AMS slots, temperatures, and print usage. You can also skip this and configure it later.",
                  )}
                </p>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={newBambuLiveEnabled}
                  onChange={(event) => onBambuLiveEnabledChange(event.target.checked)}
                  disabled={busy}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t("settings.bambuLiveEnable", "Enable Bambu Live")}
                  </span>
                  <span className="block text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {t("settings.bambuLiveLocalOnly", "Connects directly to the printer on your local network.")}
                  </span>
                </span>
              </label>
              {newBambuLiveEnabled ? (
                <>
                  <div className="grid gap-3 min-[720px]:grid-cols-2">
                    <ModalFormField label={t("settings.bambuLiveHost", "Printer host / IP")}>
                      <input
                        type="text"
                        value={newBambuLiveHost}
                        onChange={(event) => onBambuLiveHostChange(event.target.value)}
                        className={modalFormInputClassName}
                        disabled={busy}
                        required
                      />
                    </ModalFormField>
                    <ModalFormField label={t("settings.bambuLivePrinterSerial", "Printer serial")}>
                      <input
                        type="text"
                        value={newBambuLivePrinterSerial}
                        onChange={(event) => onBambuLivePrinterSerialChange(event.target.value)}
                        className={modalFormInputClassName}
                        disabled={busy}
                        required
                        autoCapitalize="characters"
                        spellCheck={false}
                      />
                    </ModalFormField>
                  </div>
                  <SettingsBambuLiveSecurityControls
                    accessCode={newBambuLiveAccessCode}
                    accessCodeAction={newBambuLiveAccessCode.trim() ? "REPLACE" : "KEEP"}
                    accessCodeConfigured={false}
                    accessCodeInputId="add-printer-bambu-live-access-code"
                    canCheckIdentity={Boolean(newBambuLiveHost.trim() && newBambuLivePrinterSerial.trim())}
                    disabled={busy}
                    liveEnabled
                    noteId="add-printer-bambu-live-note"
                    readOnlyHostManaged={false}
                    tlsCertificateFingerprint={newBambuLiveTlsCertificateFingerprint}
                    tlsIdentityReady={liveIdentityReady}
                    tlsTrustAction={newBambuLiveTlsTrustAction}
                    tlsTrustState="UNPAIRED"
                    t={t}
                    onAccessCodeActionChange={() => {}}
                    onAccessCodeChange={onBambuLiveAccessCodeChange}
                    onCheckIdentity={onBambuLiveIdentityCheck}
                    onTlsTrustActionChange={onBambuLiveTlsTrustActionChange}
                  />
                  <p id="add-printer-bambu-live-note" className="text-xs text-slate-500 dark:text-slate-400">
                    {t(
                      "settings.bambuLiveCredentialsNote",
                      "Access codes are stored in this operating system's secure credential store.",
                    )}
                  </p>
                </>
              ) : null}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <ModalActionButton
              type="button"
              onClick={step === "LIVE" ? () => setStep("PRINTER") : onClose}
              disabled={busy}
            >
              {step === "LIVE" ? t("common.back", "Back") : t("common.close", "Close")}
            </ModalActionButton>
            <ModalActionButton
              type="button"
              variant="solid"
              onClick={step === "PRINTER" && bambuLiveAvailable ? () => setStep("LIVE") : onAddPrinter}
              disabled={
                !tauri ||
                busy ||
                !newPrinterModel ||
                !newPrinterName.trim() ||
                (step === "LIVE" &&
                  newBambuLiveEnabled &&
                  (!newBambuLiveHost.trim() ||
                    !newBambuLiveAccessCode.trim() ||
                    !newBambuLivePrinterSerial.trim() ||
                    !liveIdentityReady ||
                    newBambuLiveTlsTrustAction !== "TRUST_CURRENT"))
              }
            >
              {step === "PRINTER" && bambuLiveAvailable
                ? t("common.continue", "Continue")
                : newBambuLiveEnabled
                  ? t("settings.addPrinterWithLive", "Add printer with Live")
                  : t("settings.addPrinter", "Add printer")}
            </ModalActionButton>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
