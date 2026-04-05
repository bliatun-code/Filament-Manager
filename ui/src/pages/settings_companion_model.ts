import type { Locale } from "../lib/i18n";
import type {
  TrustedLanCompanionStatus,
  TrustedLanInterfaceOption,
  TrustedLanPairedBrowser,
} from "../lib/tauri_client";

type TranslateFn = (key: string, fallback: string) => string;
export type TrustedLanCompanionStatusTone = "live" | "idle" | "warn";

type BuildTrustedLanCompanionModelInput = {
  trustedLanStatus: TrustedLanCompanionStatus | null;
  statusLoading: boolean;
  actionBusy: boolean;
  t: TranslateFn;
};

export type TrustedLanCompanionModel = {
  enabled: boolean;
  reachable: boolean;
  statusTone: TrustedLanCompanionStatusTone;
  statusPillLabel: string;
  statusLabel: string;
  statusHint: string;
  interfaceValue: string;
  interfaceHint: string;
  portValue: string;
  portHint: string;
  shellUrlValue: string;
  shellUrlHint: string;
  authLabel: string;
  authHint: string;
  pairActionDisabled: boolean;
  configActionDisabled: boolean;
};

export type TrustedLanPairedBrowserRowModel = {
  id: string;
  displayName: string;
  initials: string;
  statusLabel: string;
  statusTone: TrustedLanCompanionStatusTone;
  activityLabel: string;
  pairedLabel: string;
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
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAbsoluteTimestamp(value: string | null | undefined, locale: Locale): string {
  const timestampMs = parseTimestampMs(value);
  if (timestampMs === null) {
    return locale === "nb" ? "Ukjent" : "Unknown";
  }
  return new Intl.DateTimeFormat(trustedLanLocale(locale), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestampMs);
}

function formatRelativeTimestamp(
  value: string | null | undefined,
  locale: Locale,
  nowMs: number,
): string {
  const timestampMs = parseTimestampMs(value);
  if (timestampMs === null) {
    return locale === "nb" ? "Ukjent" : "Unknown";
  }

  const elapsedMinutes = Math.max(0, Math.floor((nowMs - timestampMs) / 60000));
  if (elapsedMinutes < 1) {
    return locale === "nb" ? "akkurat nå" : "just now";
  }
  if (elapsedMinutes < 60) {
    return locale === "nb" ? `${elapsedMinutes} min siden` : `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return locale === "nb" ? `${elapsedHours} t siden` : `${elapsedHours} hr ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return locale === "nb" ? `${elapsedDays} d siden` : `${elapsedDays} d ago`;
  }

  return formatAbsoluteTimestamp(value, locale);
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

export function resolveTrustedLanInterfaceAddressDraft(
  trustedLanStatus: TrustedLanCompanionStatus | null,
  interfaces: TrustedLanInterfaceOption[],
): string {
  const selectedAddress = trustedLanStatus?.selected_interface_address?.trim() ?? "";
  if (selectedAddress) {
    return selectedAddress;
  }
  return interfaces[0]?.address ?? "";
}

export function buildTrustedLanCompanionModel(
  input: BuildTrustedLanCompanionModelInput,
): TrustedLanCompanionModel {
  const { trustedLanStatus, statusLoading, actionBusy, t } = input;
  const status = trustedLanStatus;
  const enabled = Boolean(trustedLanStatus?.enabled);
  const reachable = Boolean(trustedLanStatus?.running && trustedLanStatus?.shell_reachable);
  const statusTone: TrustedLanCompanionStatusTone = !status || !status.enabled
    ? "idle"
    : reachable
      ? "live"
      : "warn";
  let statusPillLabel: string;
  let statusLabel: string;
  if (!status) {
    statusPillLabel = statusLoading
      ? t("settings.trustedLanStateChecking", "Checking")
      : t("settings.trustedLanStateOff", "Off");
    statusLabel = statusLoading
      ? t("common.loading", "Loading...")
      : t("common.unknown", "Unknown");
  } else if (!status.enabled) {
    statusPillLabel = t("settings.trustedLanStateOff", "Off");
    statusLabel = t("settings.trustedLanStatusDisabled", "Disabled by default");
  } else if (reachable) {
    statusPillLabel = t("settings.trustedLanStateLive", "Live");
    statusLabel = t("settings.companionStatusRunning", "Running");
  } else {
    statusPillLabel = statusLoading
      ? t("settings.trustedLanStateChecking", "Checking")
      : t("settings.trustedLanStateNeedsAttention", "Check");
    statusLabel = status.running
      ? statusLoading
        ? t("settings.trustedLanStatusStarting", "Starting...")
        : t("settings.companionStatusUnreachable", "Not responding")
      : t("settings.companionStatusStopped", "Not running");
  }

  const statusHint =
    trustedLanStatus?.health_error ??
    trustedLanStatus?.last_error ??
    (!trustedLanStatus?.enabled
      ? t(
          "settings.trustedLanStatusHintDisabled",
          "Trusted-LAN access stays off until you explicitly enable it from the desktop app.",
        )
      : reachable
        ? t(
            "settings.trustedLanStatusHintRunning",
            "Trusted-LAN companion is listening on the selected private interface.",
          )
      : t(
          "settings.trustedLanStatusHintEnabled",
          "Trusted-LAN mode binds only to one explicitly selected private interface.",
        ));

  const interfaceName = trustedLanStatus?.selected_interface_name?.trim() ?? "";
  const interfaceAddress = trustedLanStatus?.selected_interface_address?.trim() ?? "";
  const interfaceValue =
    interfaceName && interfaceAddress
      ? `${interfaceName} (${interfaceAddress})`
      : interfaceAddress || interfaceName || t("settings.trustedLanInterfaceNotSelected", "Not selected");

  const interfaceHint =
    trustedLanStatus?.bind_address ??
    (enabled
      ? t(
          "settings.trustedLanInterfaceHintEnabled",
          "Trusted-LAN mode will bind to one private interface only, not to all interfaces.",
        )
      : t(
          "settings.trustedLanInterfaceHintDisabled",
          "No LAN interface is exposed while trusted-LAN mode is disabled.",
        ));

  const shellUrlValue =
    trustedLanStatus?.shell_url?.trim() ||
    t("settings.trustedLanUrlUnavailable", "Not available until trusted-LAN mode is enabled");

  const shellUrlHint = trustedLanStatus?.shell_url
    ? t(
        "settings.trustedLanUrlHintEnabled",
        "This exact LAN URL will later be used for browser pairing on your trusted network.",
      )
    : t(
        "settings.trustedLanUrlHintDisabled",
        "No LAN URL is exposed while trusted-LAN mode stays disabled.",
      );

  const authLabel =
    trustedLanStatus?.auth_mode === "pairing-session"
      ? t("settings.trustedLanAuthPairing", "Per-browser pairing")
      : trustedLanStatus?.auth_mode ?? t("common.unknown", "Unknown");

  return {
    enabled,
    reachable,
    statusTone,
    statusPillLabel,
    statusLabel,
    statusHint,
    interfaceValue,
    interfaceHint,
    portValue: String(trustedLanStatus?.listen_port ?? 4278),
    portHint: t(
      "settings.trustedLanPortHint",
      "Use a fixed port so pairing links and exact host/origin checks stay predictable.",
    ),
    shellUrlValue,
    shellUrlHint,
    authLabel,
    authHint: t(
      "settings.trustedLanAuthHint",
      "Trusted-LAN browsers use per-browser pairing, HttpOnly cookies, session renewal, and CSRF protection.",
    ),
    pairActionDisabled:
      statusLoading || actionBusy || !enabled || !reachable || !trustedLanStatus?.shell_url,
    configActionDisabled: statusLoading || actionBusy,
  };
}

export function buildTrustedLanPairedBrowserListModel(
  input: BuildTrustedLanPairedBrowserListInput,
): TrustedLanPairedBrowserListModel {
  const { browsers, locale, t, nowMs = Date.now() } = input;

  const toRowModel = (browser: TrustedLanPairedBrowser): TrustedLanPairedBrowserRowModel => {
    const revoked = Boolean(browser.revoked_at);
    const displayName =
      browser.display_name?.trim() || t("settings.trustedLanUnnamedBrowser", "Paired browser");
    const statusLabel = revoked
      ? t("settings.trustedLanRevoked", "Revoked")
      : t("settings.trustedLanActive", "Active");
    const activityLabel = revoked
      ? `${t("settings.trustedLanRevoked", "Revoked")} ${formatAbsoluteTimestamp(
          browser.revoked_at,
          locale,
        )}`
      : browser.last_seen_at
        ? `${t("settings.trustedLanLastSeen", "Last seen")} ${formatRelativeTimestamp(
            browser.last_seen_at,
            locale,
            nowMs,
          )}`
        : t("settings.trustedLanBrowserWaiting", "Waiting for first renewal");

    return {
      id: browser.id,
      displayName,
      initials: buildBrowserInitials(displayName),
      statusLabel,
      statusTone: revoked ? "idle" : "live",
      activityLabel,
      pairedLabel: `${t("settings.trustedLanPairedAt", "Paired")} ${formatAbsoluteTimestamp(
        browser.paired_at,
        locale,
      )}`,
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
