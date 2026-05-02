import type { Locale } from "./i18n";

export function parsePositiveInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function parseNonNegativeInt(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatTrustedLanPairingExpiry(expiresAtMs: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(expiresAtMs);
}

export function formatSettingsDateTime(raw: string, locale: Locale): string {
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function formatDiagnosticJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }
  if (typeof error === "string" && error.trim()) {
    return `${fallback} (${error})`;
  }
  return fallback;
}

export function isFullBackupValidationFormat(format?: string | null): boolean {
  const normalized = (format ?? "").trim().toUpperCase();
  return normalized === "FULL_BACKUP" || normalized === "FILAMENT-MANAGER-BACKUP-V1";
}

export function extractBaseUrlFromPairingInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.searchParams.get("pairing")) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}
