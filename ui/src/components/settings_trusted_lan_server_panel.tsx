import type {
  TrustedLanCompanionModel,
} from "../pages/settings_companion_model";
import type { TrustedLanInterfaceOption } from "../lib/tauri_client";
import { SettingsMetricTile } from "./settings_ui";
import {
  settingsActionButtonClass,
  settingsFormControlClass,
  settingsSectionLabelClass,
} from "../lib/settings_ui_classes";

type SettingsTrustedLanServerPanelProps = {
  actionBusy: boolean;
  companionModel: TrustedLanCompanionModel;
  interfaceAddressDraft: string;
  interfaces: TrustedLanInterfaceOption[];
  networkDirty: boolean;
  portDraft: string;
  showNetworkEditor: boolean;
  showNetworkSummary: boolean;
  tauri: boolean;
  t: (key: string, fallback: string) => string;
  onInterfaceAddressChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onSaveNetwork: () => void;
  onToggleNetworkEditor: () => void;
  onToggleNetworkSummary: () => void;
};

export function SettingsTrustedLanServerPanel({
  actionBusy,
  companionModel,
  interfaceAddressDraft,
  interfaces,
  networkDirty,
  portDraft,
  showNetworkEditor,
  showNetworkSummary,
  tauri,
  t,
  onInterfaceAddressChange,
  onPortChange,
  onSaveNetwork,
  onToggleNetworkEditor,
  onToggleNetworkSummary,
}: SettingsTrustedLanServerPanelProps) {
  return (
    <div className="surface-subtle space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-100">
            {t("settings.trustedLanServerTitle", "Web app server")}
          </div>
          <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t(
              "settings.trustedLanCompactNetworkHint",
              "The web app runs on one selected private LAN interface. Open the network details only when you need them.",
            )}
          </div>
        </div>
        <button
          type="button"
          aria-controls="trusted-lan-network-details"
          aria-expanded={showNetworkSummary}
          onClick={() => {
            if (showNetworkSummary && showNetworkEditor) {
              onToggleNetworkEditor();
            }
            onToggleNetworkSummary();
          }}
          className={settingsActionButtonClass("neutral")}
          disabled={!tauri || actionBusy}
        >
          {showNetworkSummary
            ? t("settings.trustedLanHideNetworkDetails", "Hide network details")
            : t("settings.trustedLanNetworkDetails", "Network details")}
        </button>
      </div>

      {companionModel.localNameWarning ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <span className="font-semibold">
            {t(
              "settings.trustedLanLocalNameUnavailable",
              "Stable local address unavailable",
            )}
          </span>{" "}
          {companionModel.localNameWarning}
        </div>
      ) : null}

      {showNetworkSummary ? (
        <div id="trusted-lan-network-details" className="scroll-mt-24 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className={settingsSectionLabelClass}>
              {t("settings.trustedLanNetworkDetails", "Network details")}
            </div>
            <button
              type="button"
              aria-controls="trusted-lan-network-editor"
              aria-expanded={showNetworkEditor}
              onClick={onToggleNetworkEditor}
              className={settingsActionButtonClass("neutral")}
              disabled={!tauri || actionBusy}
            >
              {showNetworkEditor
                ? t("settings.trustedLanCloseNetworkEditor", "Close editor")
                : t("settings.trustedLanEditNetwork", "Edit network")}
            </button>
          </div>
          {showNetworkEditor ? (
            <form
              id="trusted-lan-network-editor"
              className="surface-subtle scroll-mt-24 px-4 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!companionModel.configActionDisabled && networkDirty) {
                  onSaveNetwork();
                }
              }}
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_150px_max-content] md:items-end">
                <label className="block">
                  <div className={settingsSectionLabelClass}>
                    {t("settings.trustedLanNetworkInterface", "Network interface (IP)")}
                  </div>
                  <select
                    aria-describedby="trusted-lan-network-safety-note"
                    className={`mt-2 ${settingsFormControlClass}`}
                    value={interfaceAddressDraft}
                    disabled={companionModel.configActionDisabled}
                    onChange={(event) => onInterfaceAddressChange(event.target.value)}
                  >
                    {interfaces.length === 0 ? (
                      <option value="">
                        {t("settings.trustedLanNoInterfaces", "No private IPv4 interfaces detected")}
                      </option>
                    ) : null}
                    {interfaces.map((option) => (
                      <option key={`${option.name}-${option.address}`} value={option.address}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <div className={settingsSectionLabelClass}>
                    {t("settings.trustedLanWebappPort", "Web app port")}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    aria-describedby="trusted-lan-network-safety-note"
                    className={`mt-2 ${settingsFormControlClass}`}
                    value={portDraft}
                    disabled={companionModel.configActionDisabled}
                    onChange={(event) => onPortChange(event.target.value)}
                  />
                </label>

                <button
                  type="submit"
                  className={settingsActionButtonClass("accent")}
                  disabled={companionModel.configActionDisabled || !networkDirty}
                >
                  {t("settings.trustedLanSave", "Save network")}
                </button>

                <div
                  id="trusted-lan-network-safety-note"
                  className="text-xs leading-5 text-slate-600 md:col-span-3 dark:text-slate-300"
                >
                  {t(
                    "settings.trustedLanBindBody",
                    "Binds to one explicit private interface. Never 0.0.0.0.",
                  )}
                </div>
              </div>
            </form>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
              <SettingsMetricTile
                className="sm:col-span-2"
                label={t("settings.trustedLanStableAddress", "Stable local address")}
                value={companionModel.stableAddressValue}
                hint={companionModel.stableAddressHint}
              />
              <SettingsMetricTile
                className="sm:col-span-2"
                label={t("settings.trustedLanDirectAddress", "Current direct address")}
                value={companionModel.directAddressValue}
                hint={companionModel.directAddressHint}
              />
              <SettingsMetricTile
                label={t("settings.trustedLanInterface", "Selected interface")}
                value={companionModel.interfaceValue}
              />
              <SettingsMetricTile
                label={t("settings.trustedLanWebappPort", "Web app port")}
                value={companionModel.portValue}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
