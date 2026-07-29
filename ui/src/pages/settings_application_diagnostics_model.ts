import type {
  ApplicationDiagnostics,
  DiagnosticCheckStatus,
} from "../lib/tauri_client";
import type { SemanticChipTone } from "../lib/chip_styles";
import {
  formatDisplayInteger,
  formatDisplayNumber,
  type NumberDisplayLocale,
} from "../lib/number_display";

export type SettingsDiagnosticsRequestStatus = "idle" | "loading" | "success" | "error";

export type SettingsApplicationDiagnosticsState = {
  diagnostics: ApplicationDiagnostics | null;
  refreshStatus: SettingsDiagnosticsRequestStatus;
  refreshError: string | null;
  supportStatus: SettingsDiagnosticsRequestStatus;
  supportError: string | null;
};

export type SettingsApplicationDiagnosticsAction =
  | { type: "refresh_started" }
  | { type: "refresh_succeeded"; diagnostics: ApplicationDiagnostics }
  | { type: "refresh_failed"; error: string }
  | { type: "support_started" }
  | { type: "support_succeeded" }
  | { type: "support_failed"; error: string };

export const initialSettingsApplicationDiagnosticsState: SettingsApplicationDiagnosticsState = {
  diagnostics: null,
  refreshStatus: "idle",
  refreshError: null,
  supportStatus: "idle",
  supportError: null,
};

export function settingsApplicationDiagnosticsReducer(
  state: SettingsApplicationDiagnosticsState,
  action: SettingsApplicationDiagnosticsAction,
): SettingsApplicationDiagnosticsState {
  switch (action.type) {
    case "refresh_started":
      return {
        ...state,
        refreshStatus: "loading",
        refreshError: null,
      };
    case "refresh_succeeded":
      return {
        ...state,
        diagnostics: action.diagnostics,
        refreshStatus: "success",
        refreshError: null,
      };
    case "refresh_failed":
      return {
        ...state,
        refreshStatus: "error",
        refreshError: action.error,
      };
    case "support_started":
      return {
        ...state,
        supportStatus: "loading",
        supportError: null,
      };
    case "support_succeeded":
      return {
        ...state,
        supportStatus: "success",
        supportError: null,
      };
    case "support_failed":
      return {
        ...state,
        supportStatus: "error",
        supportError: action.error,
      };
  }
}

export type SettingsDiagnosticsHealth = "healthy" | "issues" | "unavailable";

export function applicationDiagnosticsHealth(
  diagnostics: ApplicationDiagnostics,
): SettingsDiagnosticsHealth {
  const database = diagnostics.database;
  if (!database.available) {
    return "unavailable";
  }
  if (
    database.schema_version !== database.supported_schema_version ||
    database.quick_check !== "ok" ||
    database.foreign_key_check !== "ok"
  ) {
    return "issues";
  }
  return "healthy";
}

export function applicationDiagnosticsTone(
  health: SettingsDiagnosticsHealth,
): SemanticChipTone {
  if (health === "healthy") {
    return "success";
  }
  if (health === "issues") {
    return "warning";
  }
  return "neutral";
}

export function diagnosticCheckTone(status: DiagnosticCheckStatus): SemanticChipTone {
  if (status === "ok") {
    return "success";
  }
  if (status === "issues_found") {
    return "warning";
  }
  return "neutral";
}

export function formatDiagnosticBytes(
  bytes: number | null,
  locale: NumberDisplayLocale = "en",
): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${formatDisplayInteger(bytes, locale)} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const fractionDigits = value >= 10 ? 0 : 1;
  return `${formatDisplayNumber(value, locale, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  })} ${units[unitIndex]}`;
}
