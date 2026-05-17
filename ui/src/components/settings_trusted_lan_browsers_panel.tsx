import type { TrustedLanPairedBrowserRowModel } from "../pages/settings_companion_model";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";

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

function TrustedLanBrowserRow({
  browser,
  actionBusy,
  t,
  onRevokeBrowser,
}: {
  browser: TrustedLanPairedBrowserRowModel;
  actionBusy: boolean;
  t: (key: string, fallback: string) => string;
  onRevokeBrowser: (browserId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:bg-slate-950/55 dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            {browser.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {browser.displayName}
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                {browser.statusLabel}
              </span>
            </div>
            <TrustedLanBrowserMeta browser={browser} t={t} />
          </div>
        </div>

        <button
          type="button"
          className={settingsActionButtonClass()}
          disabled={actionBusy}
          onClick={() => onRevokeBrowser(browser.id)}
        >
          {t("settings.trustedLanRevoke", "Revoke")}
        </button>
      </div>
    </div>
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
    <div className="rounded-lg border border-slate-200/80 bg-slate-50/85 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/55">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
          {browser.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-100">
              {browser.displayName}
            </div>
            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {browser.statusLabel}
            </span>
          </div>
          <TrustedLanBrowserMeta browser={browser} revoked t={t} />
        </div>
      </div>
    </div>
  );
}

function TrustedLanBrowserMeta({
  browser,
  revoked = false,
  t,
}: {
  browser: TrustedLanPairedBrowserRowModel;
  revoked?: boolean;
  t: (key: string, fallback: string) => string;
}) {
  const chipClass = revoked
    ? "rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-950/70"
    : "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-slate-700 dark:bg-slate-900/60";

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span className={chipClass}>{browser.activityLabel}</span>
      <span className={chipClass}>{browser.pairedLabel}</span>
      {browser.originLabel ? (
        <span className={chipClass}>
          {t("settings.trustedLanOrigin", "Origin")} {browser.originLabel}
        </span>
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
  return (
    <div className="surface-subtle mt-4 px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-100">
            {t("settings.trustedLanBrowsersTitle", "Paired browsers")}
          </div>
          <div className="mt-1 text-sm leading-6">
            {t(
              "settings.trustedLanBrowsersBody",
              "Revoke a browser to stop future renewals and cut off its current sessions.",
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            {activeBrowsers.length} {t("settings.trustedLanActive", "Active")}
          </span>
          {revokedBrowsers.length > 0 ? (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-950/60 dark:text-slate-200">
              {revokedBrowsers.length} {t("settings.trustedLanRevoked", "Revoked")}
            </span>
          ) : null}
          <button
            type="button"
            className={settingsActionButtonClass()}
            disabled={actionBusy || activeBrowsers.length === 0}
            onClick={onRevokeAllBrowsers}
          >
            {t("settings.trustedLanRevokeAll", "Revoke all")}
          </button>
        </div>
      </div>

      {totalBrowserCount === 0 ? (
        <div className="surface-subtle mt-4 border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
          {t("settings.trustedLanBrowsersEmpty", "No trusted-LAN browsers have been paired yet.")}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {activeBrowsers.length === 0 ? (
            <div className="surface-subtle border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
              {t("settings.trustedLanNoActiveBrowsers", "No active browsers right now.")}
            </div>
          ) : (
            <div className="grid gap-3">
              {activeBrowsers.map((browser) => (
                <TrustedLanBrowserRow
                  key={browser.id}
                  actionBusy={actionBusy}
                  browser={browser}
                  t={t}
                  onRevokeBrowser={onRevokeBrowser}
                />
              ))}
            </div>
          )}

          {revokedBrowsers.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white/65 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/45">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                    {t("settings.trustedLanRevokedHistory", "Revoked history")}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {t(
                      "settings.trustedLanRevokedHistoryBody",
                      "Keep this tucked away unless you need to audit older browser access.",
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className={settingsActionButtonClass()}
                  onClick={onToggleRevokedBrowsers}
                >
                  {showRevokedBrowsers
                    ? t("settings.trustedLanHideRevoked", "Hide revoked")
                    : t("settings.trustedLanShowRevoked", "Show revoked")}
                </button>
              </div>

              {showRevokedBrowsers ? (
                <div className="mt-3 grid gap-3">
                  {revokedBrowsers.map((browser) => (
                    <TrustedLanRevokedBrowserRow key={browser.id} browser={browser} t={t} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
