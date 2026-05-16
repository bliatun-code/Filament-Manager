import type { PrinterUsageRow } from "./tauri_client";

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
): PrinterUsageMetric[] {
  return [
    {
      key: "jobs",
      label: t("printers.jobs", "Jobs"),
      value: String(usage.total_jobs),
      valueClassName: "text-slate-900 dark:text-slate-50",
    },
    {
      key: "success",
      label: t("printers.success", "Success"),
      value: String(usage.successful_jobs),
      valueClassName: "text-emerald-700 dark:text-emerald-200",
    },
    {
      key: "failed",
      label: t("printers.failed", "Failed"),
      value: String(usage.failed_jobs),
      valueClassName: "text-rose-700 dark:text-rose-200",
    },
    {
      key: "used",
      label: t("printers.used", "Used"),
      value: `${usage.total_used_g} g`,
      valueClassName: "text-amber-700 dark:text-amber-200",
    },
  ];
}
