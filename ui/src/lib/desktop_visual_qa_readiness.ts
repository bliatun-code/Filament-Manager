import { parseDateTimeMs } from "./date_time";
import { buildPrinterLiveTelemetry } from "./printer_live_telemetry";
import type { BambuLiveIntegrationEntry } from "./tauri_client";

type TranslateFn = (key: string, fallback?: string) => string;

export const DESKTOP_VISUAL_QA_PRINTER_LIVE_READINESS_TOKEN =
  "printer-live-telemetry" as const;

export function hasFreshPrinterLiveTelemetry(
  integrations: Record<string, BambuLiveIntegrationEntry["config"]>,
  observedAfterMs: number,
  t: TranslateFn,
): boolean {
  return Object.values(integrations).some((config) => {
    const observed = config.observed_state;
    const observedAtMs = parseDateTimeMs(observed?.last_seen_at);
    return Boolean(
      config.enabled &&
        observed?.online &&
        observed.mqtt_connected &&
        observedAtMs != null &&
        observedAtMs > observedAfterMs &&
        buildPrinterLiveTelemetry(config, t),
    );
  });
}
