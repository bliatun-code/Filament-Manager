import { semanticChipClass } from "../lib/chip_styles";
import { useI18n } from "../lib/i18n";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import {
  describeConfiguredPrinterSetup,
  describePrinterCapability,
} from "../lib/printer_profiles";
import { buildPrinterUsageMetrics } from "../lib/printer_usage_metrics";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { PrinterOverviewRow } from "../lib/tauri_client";
import { PrinterModelPreview } from "./printer_model_preview";

type LiveConnectionIndicator = {
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  label: string;
};

type PrinterOverviewCardHeaderProps = {
  printer: PrinterOverviewRow;
  hasMultiMaterial: boolean;
  liveConnectionIndicator: LiveConnectionIndicator | null;
  resolvedTheme: ResolvedTheme;
};

export function PrinterOverviewCardHeader({
  printer,
  hasMultiMaterial,
  liveConnectionIndicator,
  resolvedTheme,
}: PrinterOverviewCardHeaderProps) {
  const { t } = useI18n();
  const configuredSetup = describeConfiguredPrinterSetup(
    t,
    printer.printer.model,
    printer.slots,
  );
  const printerMetricStyle = printerBrandSurfaceStyle(
    printer.printer.model,
    "compact",
    resolvedTheme,
  );
  const usageMetrics = buildPrinterUsageMetrics(printer.usage, t);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <PrinterModelPreview model={printer.printer.model} hasMultiMaterial={hasMultiMaterial} />
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-slate-900 dark:text-slate-50">
              {printer.printer.name}
            </div>
            {liveConnectionIndicator ? (
              <span
                className={semanticChipClass(
                  liveConnectionIndicator.tone,
                  "px-2 py-0.5 text-[10px]",
                )}
              >
                {liveConnectionIndicator.label}
              </span>
            ) : null}
          </div>
          <div className="text-xs leading-5 text-slate-600 dark:text-slate-300">
            {printer.printer.model} ·{" "}
            {describePrinterCapability(t, printer.printer.model, hasMultiMaterial)} ·{" "}
            {configuredSetup}
          </div>
        </div>
      </div>
      <div className="grid w-full grid-cols-4 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[18rem]">
        {usageMetrics.map((metric) => (
          <div
            key={metric.key}
            className="rounded-lg border px-2.5 py-2 shadow-sm dark:shadow-none"
            style={printerMetricStyle}
          >
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              {metric.label}
            </div>
            <div className={`mt-0.5 text-base font-semibold ${metric.valueClassName}`}>
              {metric.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
