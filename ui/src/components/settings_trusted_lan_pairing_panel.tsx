import { useEffect, useRef } from "react";
import type { Locale } from "../lib/i18n";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { formatTrustedLanPairingExpiry } from "../lib/settings_utils";
import {
  settingsActionButtonClass,
  settingsFormControlClass,
  settingsSectionLabelClass,
} from "../lib/settings_ui_classes";

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
  const pairingResultRef = useRef<HTMLDivElement>(null);
  const previousPairingLinkRef = useRef<string | null>(null);

  useEffect(() => {
    const isNewPairingLink = Boolean(
      pairingLink && pairingLink !== previousPairingLinkRef.current,
    );
    previousPairingLinkRef.current = pairingLink;
    if (!isNewPairingLink) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      pairingResultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      pairingResultRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pairingLink]);

  return (
    <section
      id="trusted-lan-pairing-panel"
      aria-labelledby="trusted-lan-pairing-title"
      className="mt-4 scroll-mt-24"
    >
      <div className="surface-subtle px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              id="trusted-lan-pairing-title"
              className="font-semibold text-slate-800 dark:text-slate-100"
            >
              {t("settings.trustedLanPairingTitle", "Browser pairing")}
            </h3>
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

        <div
          className={`mt-4 grid gap-4 ${
            pairingLink ? "md:grid-cols-[minmax(0,1fr)_260px]" : ""
          }`}
        >
          <div className="rounded-lg border border-slate-200 bg-white/85 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/55">
            <form
              aria-busy={actionBusy}
              onSubmit={(event) => {
                event.preventDefault();
                if (!pairActionDisabled) {
                  onCreatePairingLink();
                }
              }}
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_max-content] md:items-start">
                <label className="block">
                  <div className={settingsSectionLabelClass}>
                    {t("settings.trustedLanPairingLabelInput", "Browser label")}
                  </div>
                  <input
                    type="text"
                    aria-describedby="trusted-lan-pairing-label-hint"
                    className={`mt-2 ${settingsFormControlClass}`}
                    value={browserLabelDraft}
                    disabled={pairActionDisabled}
                    onChange={(event) => onBrowserLabelChange(event.target.value)}
                    placeholder={t(
                      "settings.trustedLanPairingLabelPlaceholder",
                      "iPad Safari, kitchen phone, workshop MacBook...",
                    )}
                  />
                  <div
                    id="trusted-lan-pairing-label-hint"
                    className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400"
                  >
                    {t(
                      "settings.trustedLanPairingLabelHint",
                      "Optional. This keeps the paired-browser list readable later.",
                    )}
                  </div>
                </label>
                <button
                  type="submit"
                  className={`${settingsActionButtonClass(
                    pairingLink ? "neutral" : "accent",
                  )} md:mt-[26px]`}
                  disabled={pairActionDisabled}
                >
                  {pairingLink
                    ? t("settings.trustedLanCreateAnotherPairing", "Create another link")
                    : t("settings.trustedLanCreatePairing", "Create pairing link")}
                </button>
              </div>
            </form>

            {pairingLink ? (
              <div
                ref={pairingResultRef}
                tabIndex={-1}
                aria-labelledby="trusted-lan-pairing-result-title"
                className="mt-4 border-t border-slate-200 pt-4 outline-none dark:border-slate-700"
              >
                <div
                  id="trusted-lan-pairing-result-title"
                  role="status"
                  aria-live="polite"
                  className="font-semibold text-slate-800 dark:text-slate-100"
                >
                  {t("settings.trustedLanPairingReady", "Pairing link ready")}
                </div>
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

                <div className={`mt-4 ${settingsSectionLabelClass}`}>
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
              </div>
            ) : null}
          </div>

          {pairingLink ? (
            <div
              aria-busy={pairingQrBusy}
              className="rounded-lg border border-slate-200 bg-white/85 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/55"
            >
              <div className={settingsSectionLabelClass}>
                {t("settings.trustedLanPairingQrTitle", "Pairing QR")}
              </div>
              <div className="surface-subtle mt-3 flex min-h-[208px] items-center justify-center border-dashed p-3">
                {pairingQrDataUrl ? (
                  <img
                    src={pairingQrDataUrl}
                    alt={t("settings.trustedLanPairingQrAlt", "Trusted-LAN pairing QR")}
                    className="h-auto w-full max-w-44 rounded-xl bg-white p-2 shadow-sm shadow-slate-200/60 dark:shadow-none"
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
    </section>
  );
}
