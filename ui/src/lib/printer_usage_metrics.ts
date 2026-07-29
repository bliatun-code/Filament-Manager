import {
  formatDisplayInteger,
  type NumberDisplayLocale,
} from "./number_display";
import type { PrinterUsageRow } from "./tauri_client";
import { formatGrams } from "./weight_display";

type TranslateFn = (key: string, fallback?: string) => string;

export type PrinterUsageMetric = {
  key: "jobs" | "success" | "failed" | "used";
  label: string;
  value: string;
  valueClassName: string;
};

export function buildPrinterUsageMetrics(
  usage: PrinterUsageRow,
  t: TranslateFn,
  locale: NumberDisplayLocale = "en",
): PrinterUsageMetric[] {
  return [
    {
      key: "jobs",
      label: t("printers.jobs", "Jobs"),
      value: formatDisplayInteger(usage.total_jobs, locale),
      valueClassName: "text-slate-900 dark:text-slate-50",
    },
    {
      key: "success",
      label: t("printers.success", "Success"),
      value: formatDisplayInteger(usage.successful_jobs, locale),
      valueClassName: "text-emerald-700 dark:text-emerald-200",
    },
    {
      key: "failed",
      label: t("printers.failed", "Failed"),
      value: formatDisplayInteger(usage.failed_jobs, locale),
      valueClassName: "text-rose-700 dark:text-rose-200",
    },
    {
      key: "used",
      label: t("printers.used", "Used"),
      value: formatGrams(usage.total_used_g, "zero", locale),
      valueClassName: "text-amber-700 dark:text-amber-200",
    },
  ];
}
