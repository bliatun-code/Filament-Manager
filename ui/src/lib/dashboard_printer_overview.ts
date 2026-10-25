import { resolvePrinterBrandTone } from "./printer_branding";
import { isOlderThanMinutes } from "./printer_live_display";
import { buildPrinterLiveTelemetry, type PrinterLiveTelemetry } from "./printer_live_telemetry";
import type { NumberDisplayLocale } from "./number_display";
import type { DashboardSyncSource } from "./dashboard_data_source";
import type { BambuLiveIntegrationSettings, PrinterOverviewRow } from "./tauri_client";

type TranslateFn = (key: string, fallback?: string) => string;

export type DashboardPrinterPresentation = {
  stateLabel: string | null;
  tone: "neutral" | "success" | "warning";
  telemetry: PrinterLiveTelemetry | null;
  progressPercent: number | null;
  jobName: string | null;
  needsTrustReview: boolean;
};

export function buildDashboardPrinterPresentation({
  printer,
  liveConfig,
  syncSource = "local",
  locale = "en",
  t,
}: {
  printer: PrinterOverviewRow;
  liveConfig: BambuLiveIntegrationSettings | null;
  syncSource?: DashboardSyncSource;
  locale?: NumberDisplayLocale;
  t: TranslateFn;
}): DashboardPrinterPresentation {
  const unavailable = (stateLabel: string | null, tone: "neutral" | "warning" = "neutral") => ({
    stateLabel,
    tone,
    telemetry: null,
    progressPercent: null,
    jobName: null,
    needsTrustReview: false,
  });

  if (resolvePrinterBrandTone(printer.printer.model) !== "bambu") {
    return unavailable(null);
  }
  // Saved host rows describe assignments, not the printer's current activity.
  if (syncSource === "client-cached" || syncSource === "client-offline") {
    return unavailable(t("dashboard.printerSavedSetup", "Saved printer setup"));
  }
  // A live client must use fresh Host settings, never local settings or slot percentages.
  if (syncSource === "client-live" && !liveConfig) {
    return unavailable(t("dashboard.printerLiveUnavailable", "Live status unavailable"));
  }
  if (!liveConfig?.enabled) {
    return unavailable(null);
  }
  if (liveConfig.tls_trust_state !== "TRUSTED") {
    return {
      ...unavailable(t("dashboard.printerTrustRequired", "Review live connection"), "warning"),
      needsTrustReview: true,
    };
  }
  const observed = liveConfig.observed_state;
  if (!observed) {
    return unavailable(t("printers.liveConnectionWaiting", "Live waiting"));
  }
  if (!observed.online || !observed.mqtt_connected) {
    return unavailable(t("dashboard.printerOffline", "Printer disconnected"), "warning");
  }
  if (isOlderThanMinutes(observed.last_seen_at, 5)) {
    return unavailable(t("dashboard.printerStale", "Live data is out of date"), "warning");
  }

  const telemetry = buildPrinterLiveTelemetry(liveConfig, t, locale);
  const rawProgress = observed.progress_percent;
  const progressPercent =
    telemetry && telemetry.state !== "idle" &&
    typeof rawProgress === "number" && Number.isFinite(rawProgress) &&
    rawProgress >= 0 && rawProgress <= 100
      ? rawProgress
      : null;
  return {
    stateLabel: telemetry?.stateLabel ?? t("printers.liveConnectionConnected", "Live connected"),
    tone: telemetry?.state === "paused" ? "warning" : "success",
    telemetry,
    progressPercent,
    jobName: telemetry && telemetry.state !== "idle"
      ? observed.subtask_name?.trim() || null
      : null,
    needsTrustReview: false,
  };
}
