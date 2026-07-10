import { useState } from "react";
import type { TrustedLanPairedBrowserRowModel } from "../pages/settings_companion_model";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";
import { SettingsNotice } from "./settings_ui";

type SettingsTrustedLanBrowsersPanelProps = {
  activeBrowsers: TrustedLanPairedBrowserRowModel[];
  actionBusy: boolean;
  revokedBrowsers: TrustedLanPairedBrowserRowModel[];
  showRevokedBrowsers: boolean;
  t: (key: string, fallback: string) => string;
  totalBrowserCount: number;
  onRevokeAllBrowsers: () => void;
  onRevokeBrowser: (browserId: string) => void;
  onToggleRevokedBrowsers: () => void;
};

type TrustedLanRevokeConfirmation =
  | { kind: "all" }
  | { kind: "browser"; browserId: string }
  | null;

function TrustedLanBrowserRow({
  browser,
  actionBusy,
  confirming,
  revokeRequestDisabled,
  t,
  onCancelRevoke,
  onConfirmRevoke,
  onRequestRevoke,
}: {
  browser: TrustedLanPairedBrowserRowModel;
  actionBusy: boolean;
  confirming: boolean;
  revokeRequestDisabled: boolean;
  t: (key: string, fallback: string) => string;
  onCancelRevoke: () => void;
  onConfirmRevoke: () => void;
  onRequestRevoke: () => void;
}) {
  const recentlyActive = browser.statusTone === "live";
  const revokeAriaLabel = t(
    "settings.trustedLanRevokeBrowserAria",
    "Revoke browser access for {name}",
  ).replace("{name}", browser.displayName);
  const confirmAriaLabel = t(
    "settings.trustedLanConfirmRevokeBrowserAria",
    "Confirm revoking browser access for {name}",
  ).replace("{name}", browser.displayName);
  const cancelAriaLabel = t(
    "settings.trustedLanCancelRevokeBrowserAria",
    "Cancel revoking browser access for {name}",
  ).replace("{name}", browser.displayName);

  return (
    <li className="rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-950/55 dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${
              recentlyActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
            }`}
          >
            {browser.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {browser.displayName}
              </div>
              <span
                className={inlineStatusSignalClass(
                  recentlyActive ? "success" : "neutral",
                )}
              >
                {browser.statusLabel}
              </span>
            </div>
            <TrustedLanBrowserMeta browser={browser} t={t} />
          </div>
        </div>

        {!confirming ? (
          <button
            type="button"
            aria-label={revokeAriaLabel}
            className={settingsActionButtonClass("dangerQuiet")}
            disabled={revokeRequestDisabled}
            onClick={onRequestRevoke}
          >
            {t("settings.trustedLanRevoke", "Revoke")}
          </button>
        ) : null}
      </div>

      {confirming ? (
        <div className="mt-3">
          <SettingsNotice tone="danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 leading-5" role="alert">
                {t(
                  "settings.trustedLanConfirmRevokeBrowser",
                  "Revoke access for {name}? Its current sessions will be closed, and the browser must be paired again.",
                ).replace("{name}", browser.displayName)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label={confirmAriaLabel}
                  className={settingsActionButtonClass("danger", "compact")}
                  disabled={actionBusy}
                  onClick={onConfirmRevoke}
                >
                  {t("settings.trustedLanConfirmRevokeAction", "Confirm revoke")}
                </button>
                <button
                  type="button"
                  aria-label={cancelAriaLabel}
                  className={settingsActionButtonClass("neutral", "compact")}
                  onClick={onCancelRevoke}
                >
                  {t("settings.trustedLanCancelRevokeAction", "Cancel")}
                </button>
              </div>
            </div>
          </SettingsNotice>
        </div>
      ) : null}
    </li>
  );
}

function TrustedLanRevokedBrowserRow({
  browser,
  t,
}: {
  browser: TrustedLanPairedBrowserRowModel;
  t: (key: string, fallback: string) => string;
}) {
  return (
    <li className="rounded-lg border border-slate-200/80 bg-slate-50/85 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/55">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
          {browser.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-100">
              {browser.displayName}
            </div>
            <span className={inlineStatusSignalClass("neutral")}>
              {browser.statusLabel}
            </span>
          </div>
          <TrustedLanBrowserMeta browser={browser} t={t} />
        </div>
      </div>
    </li>
  );
}

function TrustedLanBrowserMeta({
  browser,
  t,
}: {
  browser: TrustedLanPairedBrowserRowModel;
  t: (key: string, fallback: string) => string;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
      <span>
        {browser.activityDateTime ? (
          <time dateTime={browser.activityDateTime}>{browser.activityLabel}</time>
        ) : (
          browser.activityLabel
        )}
      </span>
      <span className="text-slate-300 dark:text-slate-600">·</span>
      <span>
        {browser.pairedDateTime ? (
          <time dateTime={browser.pairedDateTime}>{browser.pairedLabel}</time>
        ) : (
          browser.pairedLabel
        )}
      </span>
      {browser.originLabel ? (
        <>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>
            {t("settings.trustedLanOrigin", "Origin")} {browser.originLabel}
          </span>
        </>
      ) : null}
    </div>
  );
}

export function SettingsTrustedLanBrowsersPanel({
  activeBrowsers,
  actionBusy,
  revokedBrowsers,
  showRevokedBrowsers,
  t,
  totalBrowserCount,
  onRevokeAllBrowsers,
  onRevokeBrowser,
  onToggleRevokedBrowsers,
}: SettingsTrustedLanBrowsersPanelProps) {
  const [revokeConfirmation, setRevokeConfirmation] =
    useState<TrustedLanRevokeConfirmation>(null);
  const confirmingAll = revokeConfirmation?.kind === "all";
  const revokeRequestDisabled = actionBusy || revokeConfirmation !== null;
  const revokeAllAriaLabel = t(
    "settings.trustedLanRevokeAllAria",
    "Revoke access for all {count} authorized browsers",
  ).replace("{count}", String(activeBrowsers.length));

  const confirmRevokeAll = () => {
    onRevokeAllBrowsers();
    setRevokeConfirmation(null);
  };

  return (
    <section
      id="trusted-lan-browsers-panel"
      aria-labelledby="trusted-lan-browsers-title"
      className="surface-subtle mt-4 scroll-mt-24 px-4 py-4 text-sm text-slate-600 dark:text-slate-300"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="trusted-lan-browsers-title"
            className="font-semibold text-slate-800 dark:text-slate-100"
          >
            {t("settings.trustedLanBrowsersTitle", "Paired browsers")}
          </h3>
          <div className="mt-1 text-sm leading-6">
            {t(
              "settings.trustedLanBrowsersBody",
              "Revoke a browser to stop future renewals and cut off its current sessions.",
            )}
          </div>
        </div>
        <div className="flex items-center gap-2" aria-live="polite">
          <span className={inlineStatusSignalClass("neutral", "text-xs")}>
            {activeBrowsers.length} {t("settings.trustedLanAuthorized", "Authorized")}
          </span>
          {revokedBrowsers.length > 0 ? (
            <span className={inlineStatusSignalClass("neutral", "text-xs")}>
              {revokedBrowsers.length} {t("settings.trustedLanRevoked", "Revoked")}
            </span>
          ) : null}
          {!confirmingAll ? (
            <button
              type="button"
              aria-label={revokeAllAriaLabel}
              className={settingsActionButtonClass("dangerQuiet")}
              disabled={revokeRequestDisabled || activeBrowsers.length === 0}
              onClick={() => setRevokeConfirmation({ kind: "all" })}
            >
              {t("settings.trustedLanRevokeAllWithCount", "Revoke all ({count})").replace(
                "{count}",
                String(activeBrowsers.length),
              )}
            </button>
          ) : null}
        </div>
      </div>

      {confirmingAll ? (
        <div className="mt-3">
          <SettingsNotice tone="danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 leading-5" role="alert">
                {t(
                  "settings.trustedLanConfirmRevokeAll",
                  "Revoke access for all authorized browsers ({count})? Their current sessions will be closed, and every browser must be paired again.",
                ).replace("{count}", String(activeBrowsers.length))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label={t(
                    "settings.trustedLanConfirmRevokeAllAria",
                    "Confirm revoking access for all authorized browsers",
                  )}
                  className={settingsActionButtonClass("danger", "compact")}
                  disabled={actionBusy || activeBrowsers.length === 0}
                  onClick={confirmRevokeAll}
                >
                  {t("settings.trustedLanConfirmRevokeAllAction", "Confirm revoke all")}
                </button>
                <button
                  type="button"
                  aria-label={t(
                    "settings.trustedLanCancelRevokeAllAria",
                    "Cancel revoking access for all authorized browsers",
                  )}
                  className={settingsActionButtonClass("neutral", "compact")}
                  onClick={() => setRevokeConfirmation(null)}
                >
                  {t("settings.trustedLanCancelRevokeAction", "Cancel")}
                </button>
              </div>
            </div>
          </SettingsNotice>
        </div>
      ) : null}

      {totalBrowserCount === 0 ? (
        <div className="surface-subtle mt-4 border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
          {t("settings.trustedLanBrowsersEmpty", "No trusted-LAN browsers have been paired yet.")}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {activeBrowsers.length === 0 ? (
            <div className="surface-subtle border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
              {t("settings.trustedLanNoActiveBrowsers", "No authorized browsers right now.")}
            </div>
          ) : (
            <ul className="grid list-none gap-3 p-0">
              {activeBrowsers.map((browser) => (
                <TrustedLanBrowserRow
                  key={browser.id}
                  actionBusy={actionBusy}
                  browser={browser}
                  confirming={
                    revokeConfirmation?.kind === "browser" &&
                    revokeConfirmation.browserId === browser.id
                  }
                  revokeRequestDisabled={revokeRequestDisabled}
                  t={t}
                  onCancelRevoke={() => setRevokeConfirmation(null)}
                  onConfirmRevoke={() => {
                    onRevokeBrowser(browser.id);
                    setRevokeConfirmation(null);
                  }}
                  onRequestRevoke={() =>
                    setRevokeConfirmation({ kind: "browser", browserId: browser.id })
                  }
                />
              ))}
            </ul>
          )}

          {revokedBrowsers.length > 0 ? (
            <section
              aria-labelledby="trusted-lan-revoked-history-title"
              className="rounded-lg border border-slate-200 bg-white/65 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/45"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4
                    id="trusted-lan-revoked-history-title"
                    className="font-semibold text-slate-800 dark:text-slate-100"
                  >
                    {t("settings.trustedLanRevokedHistory", "Revoked history")}
                  </h4>
                  <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {t(
                      "settings.trustedLanRevokedHistoryBody",
                      "Keep this tucked away unless you need to audit older browser access.",
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-controls="trusted-lan-revoked-browser-list"
                  aria-expanded={showRevokedBrowsers}
                  className={settingsActionButtonClass()}
                  onClick={onToggleRevokedBrowsers}
                >
                  {(showRevokedBrowsers
                    ? t("settings.trustedLanHideRevoked", "Hide {count} revoked")
                    : t("settings.trustedLanShowRevoked", "Show {count} revoked")
                  ).replace("{count}", String(revokedBrowsers.length))}
                </button>
              </div>

              {showRevokedBrowsers ? (
                <ul
                  id="trusted-lan-revoked-browser-list"
                  tabIndex={revokedBrowsers.length > 5 ? 0 : undefined}
                  className="mt-3 grid max-h-[420px] list-none gap-3 overflow-auto p-0 pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                >
                  {revokedBrowsers.map((browser) => (
                    <TrustedLanRevokedBrowserRow key={browser.id} browser={browser} t={t} />
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
