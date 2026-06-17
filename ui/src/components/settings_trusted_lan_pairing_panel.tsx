import type { Locale } from "../lib/i18n";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { formatTrustedLanPairingExpiry } from "../lib/settings_utils";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";

type SettingsTrustedLanPairingPanelProps = {
  actionBusy: boolean;
  browserLabelDraft: string;
  locale: Locale;
  pairActionDisabled: boolean;
  pairingExpiresAtMs: number | null;
  pairingLabel: string | null;
  pairingLink: string | null;
  pairingQrBusy: boolean;
  pairingQrDataUrl: string | null;
  pairingQrUnavailable: boolean;
  t: (key: string, fallback: string) => string;
  onBrowserLabelChange: (value: string) => void;
  onCopyPairingLink: () => void;
  onCreatePairingLink: () => void;
};

export function SettingsTrustedLanPairingPanel({
  actionBusy,
  browserLabelDraft,
  locale,
  pairActionDisabled,
  pairingExpiresAtMs,
  pairingLabel,
  pairingLink,
  pairingQrBusy,
  pairingQrDataUrl,
  pairingQrUnavailable,
  t,
  onBrowserLabelChange,
  onCopyPairingLink,
  onCreatePairingLink,
}: SettingsTrustedLanPairingPanelProps) {
  return (
    <div className="mt-4">
      <div className="surface-subtle px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-800 dark:text-slate-100">
              {t("settings.trustedLanPairingTitle", "Browser pairing")}
            </div>
            <div className="mt-1 text-sm leading-6">
              {t(
                "settings.trustedLanPairingBody",
                "Create a short-lived link or QR for one browser.",
              )}
            </div>
            <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {t(
                "settings.trustedLanPairingNoteBody",
                "Browser-only access. This does not add any device-ingestion route.",
              )}
            </div>
          </div>
        </div>

        <div className={`mt-4 grid gap-4 ${pairingLink ? "lg:grid-cols-[1fr_220px]" : ""}`}>
          <div className="rounded-lg border border-slate-200 bg-white/85 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/55">
            <label className="block">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {t("settings.trustedLanPairingLabelInput", "Browser label")}
              </div>
              <input
                type="text"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                value={browserLabelDraft}
                disabled={pairActionDisabled}
                onChange={(event) => onBrowserLabelChange(event.target.value)}
                placeholder={t(
                  "settings.trustedLanPairingLabelPlaceholder",
                  "iPad Safari, kitchen phone, workshop MacBook...",
                )}
              />
            </label>
            <div className="mt-3">
              <button
                type="button"
                className={settingsActionButtonClass("accent")}
                disabled={pairActionDisabled}
                onClick={onCreatePairingLink}
              >
                {t("settings.trustedLanCreatePairing", "Create pairing link")}
              </button>
            </div>

            {pairingLink ? (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className={inlineStatusSignalClass("neutral", "text-xs")}>
                    {t("settings.trustedLanPairingLabelMeta", "Browser label")}:{" "}
                    {pairingLabel ?? t("settings.trustedLanPairingLabelEmpty", "No label")}
                  </span>
                  <span className={inlineStatusSignalClass("neutral", "text-xs")}>
                    {t("settings.trustedLanPairingExpiresAt", "Expires at")}:{" "}
                    {pairingExpiresAtMs
                      ? formatTrustedLanPairingExpiry(pairingExpiresAtMs, locale)
                      : t("common.loading", "Loading...")}
                  </span>
                </div>

                <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {t("settings.trustedLanLatestPairing", "Latest pairing link")}
                </div>
                <div className="mt-2 break-all rounded-lg border border-slate-200 bg-slate-50/85 px-3 py-3 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-100">
                  {pairingLink}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={settingsActionButtonClass()}
                    disabled={!pairingLink || actionBusy}
                    onClick={onCopyPairingLink}
                  >
                    {t("settings.trustedLanCopyPairing", "Copy pairing link")}
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {pairingLink ? (
            <div className="rounded-lg border border-slate-200 bg-white/85 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/55">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {t("settings.trustedLanPairingQrTitle", "Pairing QR")}
              </div>
              <div className="surface-subtle mt-3 flex min-h-[208px] items-center justify-center border-dashed p-3">
                {pairingQrDataUrl ? (
                  <img
                    src={pairingQrDataUrl}
                    alt={t("settings.trustedLanPairingQrAlt", "Trusted-LAN pairing QR")}
                    className="h-44 w-44 rounded-xl bg-white p-2 shadow-sm shadow-slate-200/60 dark:shadow-none"
                  />
                ) : (
                  <div className="max-w-[12rem] text-center text-xs leading-6 text-slate-500 dark:text-slate-400">
                    {pairingQrBusy
                      ? t("settings.trustedLanPairingQrLoading", "Building QR preview...")
                      : pairingQrUnavailable
                        ? t(
                            "settings.trustedLanPairingQrUnavailable",
                            "QR preview is unavailable in this build. The pairing link still works.",
                          )
                        : t(
                            "settings.trustedLanPairingQrHint",
                            "Create a pairing link to generate a QR preview.",
                          )}
                  </div>
                )}
              </div>
              <div className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">
                {t(
                  "settings.trustedLanPairingQrScanBody",
                  "Scan with the browser you want to pair. The link stays short-lived and single-use.",
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
