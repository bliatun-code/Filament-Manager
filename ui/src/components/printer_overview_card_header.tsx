import { useI18n } from "../lib/i18n";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import { buildPrinterLiveTelemetry } from "../lib/printer_live_telemetry";
import {
  describeConfiguredPrinterSetup,
  describePrinterCapability,
} from "../lib/printer_profiles";
import { buildPrinterUsageMetrics } from "../lib/printer_usage_metrics";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { BambuLiveIntegrationEntry, PrinterOverviewRow } from "../lib/tauri_client";
import { PrinterLiveTelemetryStrip } from "./printer_live_telemetry_strip";
import { PrinterModelPreview } from "./printer_model_preview";

type LiveConnectionIndicator = {
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  label: string;
};

type PrinterOverviewCardHeaderProps = {
  printer: PrinterOverviewRow;
  hasMultiMaterial: boolean;
  liveConnectionIndicator: LiveConnectionIndicator | null;
  liveConfig: BambuLiveIntegrationEntry["config"] | null;
  resolvedTheme: ResolvedTheme;
};

const liveConnectionDotClassByTone: Record<LiveConnectionIndicator["tone"], string> = {
  neutral: "bg-slate-400/80 dark:bg-slate-500",
  info: "bg-sky-400/80 dark:bg-sky-300",
  success: "bg-emerald-500/85 dark:bg-emerald-300",
  warning: "bg-amber-500/90 dark:bg-amber-300",
  danger: "bg-rose-500/90 dark:bg-rose-300",
};

export function PrinterOverviewCardHeader({
  printer,
  hasMultiMaterial,
  liveConnectionIndicator,
  liveConfig,
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
  const liveTelemetry = buildPrinterLiveTelemetry(liveConfig, t);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="shrink-0">
          <PrinterModelPreview model={printer.printer.model} hasMultiMaterial={hasMultiMaterial} />
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="[overflow-wrap:anywhere] text-base font-semibold text-slate-900 dark:text-slate-50">
            {printer.printer.name}
          </div>
          <div className="[overflow-wrap:anywhere] text-xs leading-5 text-slate-600 dark:text-slate-300">
            {printer.printer.model} ·{" "}
            {describePrinterCapability(t, printer.printer.model, hasMultiMaterial)} ·{" "}
            {configuredSetup}
            {liveConnectionIndicator ? (
              <>
                <span className="text-slate-400 dark:text-slate-500"> · </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${liveConnectionDotClassByTone[liveConnectionIndicator.tone]}`}
                  />
                  {liveConnectionIndicator.label}
                </span>
              </>
            ) : null}
          </div>
          {liveTelemetry ? <PrinterLiveTelemetryStrip telemetry={liveTelemetry} /> : null}
        </div>
      </div>
      <div className="grid w-full grid-cols-4 gap-2 min-[1200px]:w-auto min-[1200px]:min-w-[18rem]">
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
