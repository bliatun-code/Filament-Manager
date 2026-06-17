import { isOlderThanMinutes } from "./printer_live_display";
import type { BambuLiveIntegrationSettings } from "./tauri_client";

type TranslateFn = (key: string, fallback?: string) => string;

export type PrinterLiveTelemetryState = "printing" | "preparing" | "paused" | "active" | "idle";

export type PrinterLiveHumidityTelemetry = {
  index: number;
  letter: string;
  label: string;
  toneLabel: string;
  scale: Array<{ letter: string; active: boolean }>;
};

export type PrinterLiveTelemetry = {
  state: PrinterLiveTelemetryState;
  stateLabel: string;
  progressLabel: string | null;
  remainingLabel: string | null;
  nozzleTempLabel: string | null;
  bedTempLabel: string | null;
  humidity: PrinterLiveHumidityTelemetry | null;
  amsTempLabel: string | null;
};

const HUMIDITY_LETTERS = ["A", "B", "C", "D", "E"] as const;

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatTemperature(value: number | null | undefined): string | null {
  const parsed = finiteNumber(value);
  if (parsed == null) {
    return null;
  }
  return `${Math.round(parsed)} C`;
}

function formatAmsTemperature(value: number | null | undefined): string | null {
  const parsed = finiteNumber(value);
  if (parsed == null || parsed < -20 || parsed > 80) {
    return null;
  }
  return formatTemperature(parsed);
}

function formatPercent(value: number | null | undefined): string | null {
  const parsed = finiteNumber(value);
  if (parsed == null) {
    return null;
  }
  return `${Math.max(0, Math.min(100, Math.round(parsed)))}%`;
}

function formatRemainingMinutes(value: number | null | undefined, t: TranslateFn): string | null {
  const parsed = finiteNumber(value);
  if (parsed == null || parsed < 0) {
    return null;
  }
  const minutes = Math.round(parsed);
  if (minutes < 60) {
    return `${minutes} ${t("common.minutes", "min")}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} ${t("common.hoursShort", "h")}`;
  }
  return `${hours} ${t("common.hoursShort", "h")} ${remainingMinutes} ${t("common.minutes", "min")}`;
}

export function normalizeAmsHumidityIndex(value: number | null | undefined): number | null {
  const parsed = finiteNumber(value);
  if (parsed == null) {
    return null;
  }
  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > HUMIDITY_LETTERS.length) {
    return null;
  }
  // Bambu Studio draws AMS humidity levels from hum_level5 to hum_level1
  // under its Dry -> Wet scale, so the raw firmware level is inverted.
  return HUMIDITY_LETTERS.length + 1 - rounded;
}

export function formatAmsHumidityLetter(value: number | null | undefined): string | null {
  const index = normalizeAmsHumidityIndex(value);
  return index == null ? null : HUMIDITY_LETTERS[index - 1];
}

function humidityToneLabel(index: number, t: TranslateFn): string {
  if (index <= 2) {
    return t("printers.liveHumidityDry", "Dry");
  }
  if (index === 3) {
    return t("printers.liveHumidityMiddle", "Mid");
  }
  return t("printers.liveHumidityWet", "Wet");
}

function buildHumidityTelemetry(
  value: number | null | undefined,
  t: TranslateFn,
): PrinterLiveHumidityTelemetry | null {
  const index = normalizeAmsHumidityIndex(value);
  if (index == null) {
    return null;
  }
  const letter = HUMIDITY_LETTERS[index - 1];
  return {
    index,
    letter,
    label: `${t("printers.liveTelemetryAmsHumidity", "AMS humidity")} ${letter}`,
    toneLabel: humidityToneLabel(index, t),
    scale: HUMIDITY_LETTERS.map((candidate, candidateIndex) => ({
      letter: candidate,
      active: candidateIndex + 1 <= index,
    })),
  };
}

function normalizeGcodeState(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function isTerminalGcodeState(value: string): boolean {
  return ["FINISH", "FINISHED", "IDLE", "FAILED", "STOP", "STOPPED", "CANCELLED"].includes(value);
}

function isIdlePrintType(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "idle";
}

function derivePrinterState(
  liveConfig: BambuLiveIntegrationSettings,
): PrinterLiveTelemetryState {
  const observed = liveConfig.observed_state;
  const gcodeState = normalizeGcodeState(observed?.gcode_state);
  const nozzleTemp = finiteNumber(observed?.nozzle_temp_c);
  const printCapableNozzle = nozzleTemp != null && nozzleTemp >= 200;
  const activeProgress =
    observed?.progress_percent != null || observed?.remaining_minutes != null;

  if (isTerminalGcodeState(gcodeState)) {
    return "idle";
  }
  if (gcodeState === "RUNNING" || (printCapableNozzle && activeProgress)) {
    return "printing";
  }
  if (gcodeState === "PAUSE" || gcodeState === "PAUSED") {
    return "paused";
  }
  if (gcodeState === "PREPARE" || gcodeState === "SLICING") {
    return "preparing";
  }
  if (isIdlePrintType(observed?.print_type) && !printCapableNozzle) {
    return "idle";
  }
  if (activeProgress) {
    return "active";
  }
  return "idle";
}

function stateLabel(state: PrinterLiveTelemetryState, t: TranslateFn): string {
  switch (state) {
    case "printing":
      return t("printers.liveTelemetryPrinting", "Printing");
    case "preparing":
      return t("printers.liveTelemetryPreparing", "Preparing");
    case "paused":
      return t("printers.liveTelemetryPaused", "Paused");
    case "active":
      return t("printers.liveTelemetryActive", "Active");
    case "idle":
      return t("printers.liveTelemetryIdle", "Idle");
  }
}

export function buildPrinterLiveTelemetry(
  liveConfig: BambuLiveIntegrationSettings | null,
  t: TranslateFn,
): PrinterLiveTelemetry | null {
  const observed = liveConfig?.observed_state ?? null;
  if (!liveConfig?.enabled || !observed || isOlderThanMinutes(observed.last_seen_at, 5)) {
    return null;
  }

  const state = derivePrinterState(liveConfig);
  const showProgressDetails = state !== "idle";
  const telemetry: PrinterLiveTelemetry = {
    state,
    stateLabel: stateLabel(state, t),
    progressLabel: showProgressDetails ? formatPercent(observed.progress_percent) : null,
    remainingLabel: showProgressDetails ? formatRemainingMinutes(observed.remaining_minutes, t) : null,
    nozzleTempLabel: formatTemperature(observed.nozzle_temp_c),
    bedTempLabel: formatTemperature(observed.bed_temp_c),
    humidity: buildHumidityTelemetry(observed.ams_humidity_index, t),
    amsTempLabel: formatAmsTemperature(observed.ams_temperature_c),
  };

  const hasLiveDetails =
    telemetry.state !== "idle" ||
    telemetry.nozzleTempLabel != null ||
    telemetry.bedTempLabel != null ||
    telemetry.humidity != null ||
    telemetry.amsTempLabel != null;

  return hasLiveDetails ? telemetry : null;
}
