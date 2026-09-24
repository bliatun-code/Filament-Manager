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
  // The native renewal boundary still returns this fixed legacy sentinel.
  // Match it exactly; arbitrary transport text must remain out of normal UI.
  const message = error instanceof Error ? error.message : error;
  if (message === "Desktop client session renewal returned 401. Pairing is no longer valid.") {
    return `${t("settings.librarySyncClientAuthNeedsRepair", "Re-pair required")}. ${t("nav.settings", "Settings")} → ${t("settings.tabLibrary", "Library & web app")}: ${t(
      "settings.librarySyncClientAuthHint",
      "Paste a short-lived pairing link from the host to unlock protected desktop sync actions.",
    )}`;
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
