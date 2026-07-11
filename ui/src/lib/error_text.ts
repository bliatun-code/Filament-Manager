import {
  appErrorDiagnosticSummary,
  localizedAppError,
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

export function diagnosticErrorText(error: unknown): string {
  return appErrorDiagnosticSummary(error);
}
