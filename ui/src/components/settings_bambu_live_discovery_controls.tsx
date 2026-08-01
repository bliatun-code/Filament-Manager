import type {
  BambuPrinterDiscoveryCandidate,
  BambuTlsTrustState,
  TrustedLanInterfaceOption,
} from "../lib/tauri_client";
import {
  settingsActionButtonClass,
  settingsFormControlClass,
  settingsSectionLabelClass,
} from "../lib/settings_ui_classes";

type SettingsBambuLiveDiscoveryControlsProps = {
  candidates: BambuPrinterDiscoveryCandidate[];
  dirty: boolean;
  disabled: boolean;
  hasScanned: boolean;
  interfaceAddress: string;
  interfaces: TrustedLanInterfaceOption[];
  printerSerial: string;
  scanning: boolean;
  tlsTrustState: BambuTlsTrustState;
  t: (key: string, fallback?: string) => string;
  onFind: () => void;
  onInterfaceAddressChange: (value: string) => void;
  onRecoverSavedAddress: (candidate: BambuPrinterDiscoveryCandidate) => void;
  onUseForSetup: (candidate: BambuPrinterDiscoveryCandidate) => void;
};

function samePrinterSerial(left: string, right: string) {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

export function SettingsBambuLiveDiscoveryControls({
  candidates,
  dirty,
  disabled,
  hasScanned,
  interfaceAddress,
  interfaces,
  printerSerial,
  scanning,
  tlsTrustState,
  t,
  onFind,
  onInterfaceAddressChange,
  onRecoverSavedAddress,
  onUseForSetup,
}: SettingsBambuLiveDiscoveryControlsProps) {
  const networkInputId = "settings-bambu-live-discovery-interface";
  const hintId = "settings-bambu-live-discovery-hint";
  const hasPrivateInterface = interfaces.length > 0;

  return (
    <section
      className="mt-3 rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-950/35"
      aria-labelledby="settings-bambu-live-discovery-title"
      data-desktop-visual-qa-target="settings-bambu-live-discovery"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="settings-bambu-live-discovery-title"
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            {t("settings.bambuDiscoveryTitle", "Find Bambu printer")}
          </h3>
          <p
            id={hintId}
            className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300"
          >
            {t(
              "settings.bambuDiscoveryHint",
              "Listen briefly for local Bambu printer announcements. No access code is sent.",
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 min-[720px]:grid-cols-[minmax(0,1fr)_max-content] min-[720px]:items-end">
        <label className="block" htmlFor={networkInputId}>
          <span className={settingsSectionLabelClass}>
            {t("settings.trustedLanNetworkInterface", "Network interface (IP)")}
          </span>
          <select
            id={networkInputId}
            className={`mt-1 ${settingsFormControlClass}`}
            value={interfaceAddress}
            aria-describedby={hintId}
            disabled={disabled || scanning || !hasPrivateInterface}
            onChange={(event) => onInterfaceAddressChange(event.target.value)}
          >
            {!hasPrivateInterface ? (
              <option value="">
                {t(
                  "settings.trustedLanNoInterfaces",
                  "No private IPv4 interfaces detected",
                )}
              </option>
            ) : null}
            {interfaces.map((option) => (
              <option key={`${option.name}-${option.address}`} value={option.address}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={settingsActionButtonClass("neutral")}
          disabled={disabled || scanning || !hasPrivateInterface}
          aria-describedby={hintId}
          onClick={onFind}
        >
          {scanning
            ? t("settings.bambuDiscoveryScanning", "Listening for printers...")
            : t("settings.bambuDiscoveryFind", "Find Bambu printers")}
        </button>
      </div>

      <div className="mt-3" aria-live="polite">
        {scanning ? (
          <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
            {t(
              "settings.bambuDiscoveryListeningHint",
              "This can take up to 10 seconds while the printer announces itself.",
            )}
          </p>
        ) : null}
        {!scanning && hasScanned && candidates.length === 0 ? (
          <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
            {t(
              "settings.bambuDiscoveryEmpty",
              "No Bambu printers announced themselves on this interface. Wake the printer and try again.",
            )}
          </p>
        ) : null}
        {candidates.length > 0 ? (
          <div className="space-y-2">
            {candidates.map((candidate) => {
              const sameSerial = samePrinterSerial(printerSerial, candidate.printer_serial);
              const canRecover =
                !dirty && sameSerial && tlsTrustState === "TRUSTED";
              return (
                <div
                  key={`${candidate.printer_serial}-${candidate.host}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1 text-sm text-slate-800 dark:text-slate-100">
                      <div className="font-medium">
                        {candidate.name?.trim() || candidate.host}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        {t("settings.bambuLiveHost", "Printer host / IP")}: {candidate.host}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        {t("settings.bambuLivePrinterSerial", "Printer serial")}: {" "}
                        {candidate.printer_serial}
                      </div>
                      {candidate.model?.trim() ? (
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          {t("settings.printerModel", "Printer model")}: {candidate.model}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={settingsActionButtonClass("neutral", "compact")}
                        disabled={disabled}
                        onClick={() => onUseForSetup(candidate)}
                      >
                        {t("settings.bambuDiscoveryUseForSetup", "Use for setup")}
                      </button>
                      {canRecover ? (
                        <button
                          type="button"
                          className={settingsActionButtonClass("accent", "compact")}
                          disabled={disabled}
                          onClick={() => onRecoverSavedAddress(candidate)}
                        >
                          {t(
                            "settings.bambuDiscoveryRecoverSavedAddress",
                            "Recover saved address",
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {sameSerial && !canRecover ? (
                    <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {dirty
                        ? t(
                            "settings.bambuDiscoveryUnsavedChangesHint",
                            "Save or discard other edits before recovering a saved printer address.",
                          )
                        : t(
                            "settings.bambuDiscoveryRecoveryHint",
                            "The saved address can be recovered after this printer identity is trusted.",
                          )}
                    </p>
                  ) : null}
                  {!sameSerial && printerSerial.trim() ? (
                    <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                      {t(
                        "settings.bambuDiscoveryDifferentPrinter",
                        "This is not the saved printer. You can use it only for a new setup.",
                      )}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
