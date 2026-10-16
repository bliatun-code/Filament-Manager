import { dashboardOverviewStyles } from "../lib/dashboard_overview_styles";
import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import { printerBrandSurfaceStyle, resolvePrinterBrandTone } from "../lib/printer_branding";
import { buildDashboardPrinterPresentation } from "../lib/dashboard_printer_overview";
import type { DashboardSyncSource } from "../lib/dashboard_data_source";
import { hasConfiguredMultiMaterial } from "../lib/printer_profiles";
import type { BambuLiveIntegrationEntry, PrinterOverviewRow } from "../lib/tauri_client";
import type { ResolvedTheme } from "../lib/theme_mode";
import { PrinterModelPreview } from "./printer_model_preview";
import { PrinterSlotSummaryStrip } from "./printer_slot_summary_strip";

export type DashboardPrinterOverviewProps = {
  printers: PrinterOverviewRow[];
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  resolvedTheme: ResolvedTheme;
  syncSource?: DashboardSyncSource;
  onOpenPrinters?: () => void;
  onOpenBambuLiveSettings?: (printerId: string) => void;
};

const brandAccents = { bambu: "#00B140", prusa: "#F97316", generic: "#94A3B8" };
const stateToneClasses = {
  neutral: "border-slate-300/70 bg-white/60 text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300",
  success: "border-emerald-500/30 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/50 dark:text-emerald-200",
  warning: "border-amber-500/40 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/50 dark:text-amber-200",
};

export function DashboardPrinterOverview({
  printers,
  bambuLiveIntegrations,
  resolvedTheme,
  syncSource = "local",
  onOpenPrinters,
  onOpenBambuLiveSettings,
}: DashboardPrinterOverviewProps) {
  const { t, locale } = useI18n();
  const [, refreshFreshness] = useState(0);
  const hasLocalObservation = syncSource === "local" && printers.some((printer) => {
    const config = bambuLiveIntegrations[printer.printer.id];
    return config?.enabled && config.observed_state?.last_seen_at;
  });
  useEffect(() => {
    if (!hasLocalObservation) return;
    // Age out telemetry even when revision polling finds no new library data.
    // This clock only redraws visible cards and makes no network requests.
    const refresh = () => {
      if (!document.hidden) refreshFreshness((value) => value + 1);
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [hasLocalObservation]);
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      {printers.map((printer) => {
        const liveConfig = bambuLiveIntegrations[printer.printer.id] ?? null;
        const presentation = buildDashboardPrinterPresentation({
          printer, liveConfig, syncSource, t, locale,
        });
        const accent = brandAccents[resolvePrinterBrandTone(printer.printer.model)];
        const { borderColor, ...brandSurface } = printerBrandSurfaceStyle(printer.printer.model, "card", resolvedTheme);
        const assignedSlots = printer.slots.filter((slot) => Boolean(slot.spool_id));
        const hasProgress = presentation.progressPercent != null;
        return (
          <article
            key={printer.printer.id}
            className={`${dashboardOverviewStyles.card} border-l-4 p-4`}
            style={{
              ...brandSurface,
              borderTopColor: borderColor,
              borderRightColor: borderColor,
              borderBottomColor: borderColor,
              borderLeftColor: accent,
            }}
            aria-label={printer.printer.name}
          >
            <div className="flex items-start gap-3">
              <PrinterModelPreview
                model={printer.printer.model}
                hasMultiMaterial={hasConfiguredMultiMaterial(printer.slots)}
                compact
              />
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-base font-semibold text-slate-900 dark:text-slate-50">
                  {printer.printer.name}
                </h3>
                <p className={`mt-0.5 break-words text-xs ${dashboardOverviewStyles.muted}`}>
                  {printer.printer.model}
                </p>
                <span className={`mt-2 inline-flex max-w-full rounded-md border px-2 py-1 text-xs font-medium ${stateToneClasses[presentation.tone]}`}>
                  {presentation.stateLabel}
                </span>
              </div>
            </div>
            {presentation.jobName || hasProgress ? (
              <div className="mt-4">
                <div className="flex items-end justify-between gap-3 text-xs text-slate-700 dark:text-slate-200">
                  <span className="min-w-0 break-words">{presentation.jobName}</span>
                  {hasProgress ? <span className="shrink-0 font-semibold tabular-nums">{presentation.telemetry?.progressLabel}</span> : null}
                </div>
                {hasProgress ? (
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80"
                    role="progressbar"
                    aria-label={`${printer.printer.name} · ${t("dashboard.printerPrintProgress", "Print progress")}`}
                    aria-valuenow={presentation.progressPercent ?? undefined}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="h-full rounded-full" style={{ width: `${presentation.progressPercent}%`, backgroundColor: accent }} />
                  </div>
                ) : null}
              </div>
            ) : null}
            {presentation.telemetry?.remainingLabel || presentation.telemetry?.nozzleTempLabel ? (
              <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 text-xs ${dashboardOverviewStyles.muted}`}>
                <span>{presentation.telemetry.remainingLabel ? t("dashboard.printerRemaining", "{time} remaining", { time: presentation.telemetry.remainingLabel }) : null}</span>
                {presentation.telemetry.nozzleTempLabel ? <span>{t("printers.liveTelemetryNozzle", "Nozzle")} {presentation.telemetry.nozzleTempLabel}</span> : null}
              </div>
            ) : null}
            <div className="mt-4 border-t border-slate-200/70 pt-3 dark:border-slate-700/70">
              <p className={`mb-2 text-[11px] font-medium ${dashboardOverviewStyles.subtle}`}>
                {t("dashboard.printerAssignedFilament", "Assigned filament")}
              </p>
              {assignedSlots.length > 0 ? (
                <PrinterSlotSummaryStrip model={printer.printer.model} slots={assignedSlots} findSpoolById={() => null} />
              ) : <p className={`text-xs ${dashboardOverviewStyles.subtle}`}>{t("dashboard.printerNoAssignedFilament", "No rolls assigned")}</p>}
            </div>
            <div className={`mt-3 ${dashboardOverviewStyles.between}`}>
              {resolvePrinterBrandTone(printer.printer.model) === "bambu" && syncSource === "local" && !liveConfig?.enabled ? (
                <span className={`text-xs ${dashboardOverviewStyles.subtle}`}>{t("dashboard.printerLiveDisabled", "Live connection is not enabled")}</span>
              ) : null}
              {presentation.needsTrustReview && onOpenBambuLiveSettings ? (
                <button type="button" className="btn-secondary text-xs" onClick={() => onOpenBambuLiveSettings(printer.printer.id)}>
                  {t("dashboard.printerTrustRequired", "Review live connection")}
                </button>
              ) : null}
              {onOpenPrinters ? (
                <button type="button" className={`ml-auto ${dashboardOverviewStyles.action}`} onClick={onOpenPrinters}>
                  {t("dashboard.printerOpen", "Open printers")} <span aria-hidden="true">→</span>
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
