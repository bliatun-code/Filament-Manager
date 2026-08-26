import {
  appErrorDiagnosticSummary,
  localizedAppError,
  parseAppError,
} from "../../../src-tauri/companion_browser/app_error.js";
import type { I18nContextValue } from "./i18n";

export function toErrorMessage(
  error: unknown,
  fallback: string,
  t?: I18nContextValue["t"],
): string {
  if (!t) {
    return fallback;
  }
  return localizedAppError(
    error,
    (key, messageFallback) => t(key, messageFallback),
    fallback,
  );
}

export const commandErrorText = toErrorMessage;

export function createAppError(code: string): Error {
  return new Error(
    JSON.stringify({ code, safe_detail: null, diagnostic_id: null }),
  );
}

export function appErrorCode(error: unknown): string | null {
  return parseAppError(error)?.code ?? null;
}

export function diagnosticErrorText(error: unknown): string {
  return appErrorDiagnosticSummary(error);
}
