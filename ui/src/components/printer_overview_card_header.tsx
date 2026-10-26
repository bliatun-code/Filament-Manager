import { useI18n } from "../lib/i18n";
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
}: PrinterOverviewCardHeaderProps) {
  const { locale, t } = useI18n();
  const configuredSetup = describeConfiguredPrinterSetup(
    t,
    printer.printer.model,
    printer.slots,
  );
  const usageMetrics = buildPrinterUsageMetrics(printer.usage, t, locale);
  const liveTelemetry = buildPrinterLiveTelemetry(liveConfig, t, locale);

  return (
    <div className="printer-balanced-header">
      <div className="printer-balanced-identity">
        <div className="shrink-0">
          <PrinterModelPreview model={printer.printer.model} hasMultiMaterial={hasMultiMaterial} compact />
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
                <span aria-hidden="true" className="text-slate-400 dark:text-slate-500"> · </span>
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
        </div>
      </div>
      <div className="printer-balanced-metrics">
        {usageMetrics.map((metric) => (
          <div
            key={metric.key}
            className="printer-balanced-metric"
          >
            <div className="printer-metric-label">
              {metric.label}
            </div>
            <div className="printer-metric-value">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      {liveTelemetry ? (
        <div className="printer-balanced-telemetry">
          <PrinterLiveTelemetryStrip telemetry={liveTelemetry} />
        </div>
      ) : null}
    </div>
  );
}
