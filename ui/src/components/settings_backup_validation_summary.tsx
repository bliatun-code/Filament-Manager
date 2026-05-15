import { SettingsMetricTile } from "./settings_ui";
import type { BackupValidationStats } from "../lib/tauri_client";

type TranslateFn = (key: string, fallback: string) => string;

type SettingsBackupValidationSummaryProps = {
  hasExtraTables: boolean;
  hasMissingTables: boolean;
  hasWarnings: boolean;
  summary: BackupValidationStats;
  t: TranslateFn;
};

export function SettingsBackupValidationSummary({
  hasExtraTables,
  hasMissingTables,
  hasWarnings,
  summary,
  t,
}: SettingsBackupValidationSummaryProps) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/90 p-4 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">
          {t("settings.backupValidationSummary", "Backup validation summary")}
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            hasWarnings
              ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-200"
              : "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-400/50 dark:bg-emerald-500/20 dark:text-emerald-200"
          }`}
        >
          {hasWarnings
            ? t("settings.validationStatusWarn", "Has warnings")
            : t("settings.validationStatusOk", "Fully compatible")}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <SettingsMetricTile
          label={t("settings.validationFormat", "Format")}
          value={summary.format}
          className="bg-white/80 dark:bg-slate-900/60"
        />
        <SettingsMetricTile
          label={t("settings.validationTables", "Tables")}
          value={`${summary.present_tables}/${summary.expected_tables}`}
          className="bg-white/80 dark:bg-slate-900/60"
        />
        <SettingsMetricTile
          label={t("settings.validationRows", "Rows")}
          value={summary.total_rows}
          className="bg-white/80 dark:bg-slate-900/60"
        />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-xl border px-3 py-3 ${
            hasMissingTables
              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200"
          }`}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            {t("settings.validationMissingTables", "Missing tables")}
          </div>
          <div className="mt-1 text-xs leading-relaxed">
            {summary.missing_tables.length > 0 ? summary.missing_tables.join(", ") : "0"}
          </div>
        </div>
        <div
          className={`rounded-xl border px-3 py-3 ${
            hasExtraTables
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200"
          }`}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
            {t("settings.validationExtraTables", "Extra tables")}
          </div>
          <div className="mt-1 text-xs leading-relaxed">
            {summary.extra_tables.length > 0 ? summary.extra_tables.join(", ") : "0"}
          </div>
        </div>
      </div>
    </div>
  );
}
