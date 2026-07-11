import type { Locale } from "../lib/i18n";
import type { TrustedLanPairedBrowser } from "../lib/tauri_client";
import type { TrustedLanCompanionStatusTone } from "./settings_companion_model";

type TranslateFn = (key: string, fallback: string) => string;

export type TrustedLanPairedBrowserRowModel = {
  id: string;
  displayName: string;
  initials: string;
  statusLabel: string;
  statusTone: TrustedLanCompanionStatusTone;
  activityLabel: string;
  activityDateTime: string | null;
  pairedLabel: string;
  pairedDateTime: string | null;
  originLabel: string | null;
  revoked: boolean;
};

export type TrustedLanPairedBrowserListModel = {
  activeRows: TrustedLanPairedBrowserRowModel[];
  revokedRows: TrustedLanPairedBrowserRowModel[];
};

type BuildTrustedLanPairedBrowserListInput = {
  browsers: TrustedLanPairedBrowser[];
  locale: Locale;
  t: TranslateFn;
  nowMs?: number;
};

function trustedLanLocale(locale: Locale): string {
  return locale === "nb" ? "nb-NO" : "en-US";
}

function parseTimestampMs(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = Date.parse(withTimezone);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAbsoluteTimestamp(
  value: string | null | undefined,
  locale: Locale,
  t: TranslateFn,
): string {
  const timestampMs = parseTimestampMs(value);
  if (timestampMs === null) {
    return t("common.unknown", "Unknown");
  }
  return new Intl.DateTimeFormat(trustedLanLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestampMs);
}

function timestampDateTime(value?: string | null): string | null {
  const timestampMs = parseTimestampMs(value);
  return timestampMs === null ? null : new Date(timestampMs).toISOString();
}

function formatRelativeTimestamp(
  value: string | null | undefined,
  locale: Locale,
  nowMs: number,
  t: TranslateFn,
): string {
  const timestampMs = parseTimestampMs(value);
  if (timestampMs === null) {
    return t("common.unknown", "Unknown");
  }

  const elapsedMinutes = Math.max(0, Math.floor((nowMs - timestampMs) / 60000));
  if (elapsedMinutes < 1) {
    return t("common.justNow", "just now");
  }
  if (elapsedMinutes < 60) {
    return t("common.minutesAgo", "{count} min ago").replace(
      "{count}",
      String(elapsedMinutes),
    );
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return t("common.hoursAgo", "{count} h ago").replace("{count}", String(elapsedHours));
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return t("common.daysShort", "{count} d ago").replace("{count}", String(elapsedDays));
  }

  return formatAbsoluteTimestamp(value, locale, t);
}

function summarizeOrigin(origin?: string | null): string | null {
  const value = origin?.trim() ?? "";
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.host || value;
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/$/, "") || value;
  }
}

function buildBrowserInitials(displayName: string): string {
  const parts = displayName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return "WB";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function browserSortTimestamp(browser: TrustedLanPairedBrowser): number {
  return (
    parseTimestampMs(browser.revoked_at) ??
    parseTimestampMs(browser.last_seen_at) ??
    parseTimestampMs(browser.paired_at) ??
    0
  );
}

export function findNewTrustedLanActiveBrowserIds(
  previousBrowsers: TrustedLanPairedBrowser[],
  nextBrowsers: TrustedLanPairedBrowser[],
): string[] {
  const previousActiveIds = new Set(
    previousBrowsers
      .filter((browser) => !browser.revoked_at)
      .map((browser) => browser.id),
  );
  return nextBrowsers
    .filter((browser) => !browser.revoked_at && !previousActiveIds.has(browser.id))
    .map((browser) => browser.id);
}

export function buildTrustedLanPairedBrowserListModel(
  input: BuildTrustedLanPairedBrowserListInput,
): TrustedLanPairedBrowserListModel {
  const { browsers, locale, t, nowMs = Date.now() } = input;

  const toRowModel = (browser: TrustedLanPairedBrowser): TrustedLanPairedBrowserRowModel => {
    const revoked = Boolean(browser.revoked_at);
    const lastSeenAtMs = parseTimestampMs(browser.last_seen_at);
    const recentlyActive =
      !revoked &&
      lastSeenAtMs !== null &&
      Math.max(0, nowMs - lastSeenAtMs) < 24 * 60 * 60 * 1000;
    const displayName =
      browser.display_name?.trim() || t("settings.trustedLanUnnamedBrowser", "Paired browser");
    const statusLabel = revoked
      ? t("settings.trustedLanRevoked", "Revoked")
      : recentlyActive
        ? t("settings.trustedLanRecentlyActive", "Recently active")
        : t("settings.trustedLanAuthorized", "Authorized");
    const activityLabel = revoked
      ? `${t("settings.trustedLanRevoked", "Revoked")} ${formatAbsoluteTimestamp(
          browser.revoked_at,
          locale,
          t,
        )}`
      : browser.last_seen_at
        ? `${t("settings.trustedLanLastSeen", "Last seen")} ${formatRelativeTimestamp(
            browser.last_seen_at,
            locale,
            nowMs,
            t,
          )}`
        : t("settings.trustedLanBrowserWaiting", "Waiting for first renewal");

    return {
      id: browser.id,
      displayName,
      initials: buildBrowserInitials(displayName),
      statusLabel,
      statusTone: recentlyActive ? "live" : "idle",
      activityLabel,
      activityDateTime: timestampDateTime(
        revoked ? browser.revoked_at : browser.last_seen_at,
      ),
      pairedLabel: `${t("settings.trustedLanPairedAt", "Paired")} ${formatAbsoluteTimestamp(
        browser.paired_at,
        locale,
        t,
      )}`,
      pairedDateTime: timestampDateTime(browser.paired_at),
      originLabel: summarizeOrigin(browser.last_origin),
      revoked,
    };
  };

  const activeRows = browsers
    .filter((browser) => !browser.revoked_at)
    .sort((left, right) => browserSortTimestamp(right) - browserSortTimestamp(left))
    .map(toRowModel);

  const revokedRows = browsers
    .filter((browser) => Boolean(browser.revoked_at))
    .sort((left, right) => browserSortTimestamp(right) - browserSortTimestamp(left))
    .map(toRowModel);

  return {
    activeRows,
    revokedRows,
  };
}
