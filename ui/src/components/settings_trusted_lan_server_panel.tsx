import type {
  TrustedLanCompanionModel,
} from "../pages/settings_companion_model";
import type { TrustedLanInterfaceOption } from "../lib/tauri_client";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";

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
    <div className="space-y-4 rounded-lg border border-slate-200/80 bg-white/70 px-4 py-4 dark:border-slate-700/70 dark:bg-slate-950/35">
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleNetworkSummary}
            className={settingsActionButtonClass(showNetworkSummary ? "accent" : "neutral")}
            disabled={!tauri || actionBusy}
          >
            {showNetworkSummary
              ? t("settings.trustedLanHideNetworkSummary", "Hide network")
              : t("settings.trustedLanShowNetwork", "Show network")}
          </button>
          <button
            type="button"
            onClick={onToggleNetworkEditor}
            className={settingsActionButtonClass(showNetworkEditor ? "accent" : "neutral")}
            disabled={!tauri || actionBusy}
          >
            {showNetworkEditor
              ? t("settings.trustedLanHideNetwork", "Hide network")
              : t("settings.trustedLanEditNetwork", "Edit network")}
          </button>
        </div>
      </div>

      {showNetworkSummary ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-950/50">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              {t("settings.trustedLanInterface", "Selected interface")}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {companionModel.interfaceValue}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-700/70 dark:bg-slate-950/50">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              {t("settings.trustedLanPort", "Port")}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              :{companionModel.portValue}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-white/80 px-4 py-3 sm:col-span-2 dark:border-slate-700/70 dark:bg-slate-950/50">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              {t("settings.trustedLanShellUrl", "LAN URL")}
            </div>
            <div className="mt-2 break-all text-sm font-medium text-slate-800 dark:text-slate-100">
              {companionModel.shellUrlValue}
            </div>
          </div>
        </div>
      ) : null}

      {showNetworkEditor ? (
        <div className="rounded-lg border border-slate-200/80 bg-white/78 px-4 py-4 shadow-sm shadow-slate-200/20 dark:border-white/12 dark:bg-slate-950/35 dark:shadow-none">
          <div className="grid gap-4">
            <label className="block">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">
                {t("settings.trustedLanInterfaceSelect", "Private interface")}
              </div>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white/85 px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
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

            <div className="grid gap-3 sm:grid-cols-[140px_auto] sm:items-end">
              <label className="block">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">
                  {t("settings.trustedLanPortInput", "Listener port")}
                </div>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white/85 px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
                  value={portDraft}
                  disabled={companionModel.configActionDisabled}
                  onChange={(event) => onPortChange(event.target.value)}
                />
              </label>

              <button
                type="button"
                className={settingsActionButtonClass("accent")}
                disabled={companionModel.configActionDisabled || !networkDirty}
                onClick={onSaveNetwork}
              >
                {t("settings.trustedLanSave", "Save network")}
              </button>
            </div>

            <div className="text-xs leading-5 text-slate-600 dark:text-slate-300">
              {t(
                "settings.trustedLanBindBody",
                "Binds to one explicit private interface. Never 0.0.0.0.",
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
