import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";
import type { AppUpdateCheckResult } from "../lib/tauri_maintenance_client";

type TranslateFn = (key: string, fallback: string, params?: MessageParams) => string;

export type AppUpdateBannerProps = {
  onDismiss: () => void;
  onViewRelease: () => void;
  result: AppUpdateCheckResult;
  t: TranslateFn;
};

export function AppUpdateBanner({
  onDismiss,
  onViewRelease,
  result,
  t,
}: AppUpdateBannerProps) {
  const version = result.latest_version ?? result.latest_tag ?? "";

  return (
    <aside
      className="mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-[1500px] flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm shadow-sm dark:border-cyan-900/80 dark:bg-cyan-950/45"
      aria-label={t("settings.updates", "Updates")}
    >
      <p
        className="font-medium text-cyan-950 dark:text-cyan-100"
        aria-live="polite"
        role="status"
      >
        {t("settings.updateAvailable", "Version {version} is available.", {
          version,
        })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onViewRelease}
          className="rounded-lg border border-cyan-300 bg-white px-3 py-1.5 font-semibold text-cyan-950 transition hover:border-cyan-400 hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-cyan-800 dark:bg-slate-950/70 dark:text-cyan-100 dark:hover:bg-cyan-950"
        >
          {t("settings.viewRelease", "View release")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-3 py-1.5 font-medium text-cyan-800 transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-cyan-200 dark:hover:bg-cyan-950"
        >
          {t("settings.remindMeLater", "Later")}
        </button>
      </div>
    </aside>
  );
}
