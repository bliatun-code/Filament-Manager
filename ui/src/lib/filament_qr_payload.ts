import {
  deriveCompanionShellUrl,
  isStableLocalCompanionBaseUrl,
} from "./companion_url";

export {
  deriveCompanionShellUrl,
  isStableLocalCompanionBaseUrl,
} from "./companion_url";

const VERSIONED_PREFIX = /^v(\d+):(.*)$/i;

function normalizeRef(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function parseCompanionShellUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname.replace(/\/+$/, "") !== "/companion" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export type ParsedFilamentQrPayload = {
  raw: string;
  version: string;
  ref: string;
};

export type BuiltFilamentQrPayload = {
  payload: string;
  target: string;
};

export function encodeVersionedFilamentQrRef(
  ref: string,
  version = "v1",
): string {
  const normalizedRef = normalizeRef(ref);
  const normalizedVersion = normalizeRef(version).toLowerCase();
  if (!normalizedRef) {
    throw new Error("QR reference is required.");
  }
  if (!/^v\d+$/.test(normalizedVersion)) {
    throw new Error("QR version must use the v<number> format.");
  }
  return `${normalizedVersion}:${normalizedRef}`;
}

export function decodeFilamentQrPayload(
  payload: string | null | undefined,
): ParsedFilamentQrPayload | null {
  const trimmed = normalizeRef(payload);
  if (!trimmed) {
    return null;
  }
  const versionedMatch = trimmed.match(VERSIONED_PREFIX);
  if (versionedMatch) {
    const ref = normalizeRef(versionedMatch[2]);
    if (!ref) {
      return null;
    }
    return {
      raw: trimmed,
      version: `v${versionedMatch[1]}`,
      ref,
    };
  }
  return {
    raw: trimmed,
    version: "legacy",
    ref: trimmed,
  };
}

export function parseFilamentQrPayload(
  payload: string | null | undefined,
): ParsedFilamentQrPayload | null {
  const trimmed = normalizeRef(payload);
  if (!trimmed) {
    return null;
  }
  const direct = decodeFilamentQrPayload(trimmed);
  if (direct?.version !== "legacy") {
    return direct;
  }

  try {
    const parsedUrl = new URL(trimmed);
    const embeddedPayload =
      normalizeRef(parsedUrl.searchParams.get("spool_qr")) ||
      normalizeRef(parsedUrl.searchParams.get("qr_code"));
    if (embeddedPayload) {
      const decodedEmbedded = decodeFilamentQrPayload(embeddedPayload);
      if (decodedEmbedded) {
        return {
          ...decodedEmbedded,
          raw: trimmed,
        };
      }
    }
  } catch {
    // Non-URL payloads are valid legacy references.
  }

  return direct;
}

export function resolvePreferredCompanionShellUrl(options?: {
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
  trustedLanShellUrl?: string | null;
}): string | null {
  if (options?.clientReadOnly) {
    const clientShellUrl = isStableLocalCompanionBaseUrl(options.clientHostBaseUrl)
      ? deriveCompanionShellUrl(options.clientHostBaseUrl)
      : null;
    return clientShellUrl;
  }
  return normalizeRef(options?.trustedLanShellUrl) || null;
}

export function buildFilamentQrPayload(
  ref: string,
  options?: {
    companionShellUrl?: string | null;
  },
): BuiltFilamentQrPayload {
  const embeddedPayload = encodeVersionedFilamentQrRef(ref);
  const normalizedShellUrl = normalizeRef(options?.companionShellUrl);
  if (!normalizedShellUrl) {
    throw new Error("Companion QR link is unavailable.");
  }

  const shellUrl = parseCompanionShellUrl(normalizedShellUrl);
  if (!shellUrl) {
    throw new Error("Companion QR link is invalid.");
  }
  shellUrl.searchParams.set("spool_qr", embeddedPayload);
  const target = shellUrl.toString();
  return {
    payload: target,
    target,
  };
}

export function buildCompanionSpoolQrPayload(
  ref: string,
  companionShellUrl?: string | null,
): string {
  return buildFilamentQrPayload(ref, {
    companionShellUrl,
  }).payload;
}
