const VERSIONED_PREFIX = /^v(\d+):(.*)$/i;

function normalizeRef(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export type ParsedFilamentQrPayload = {
  raw: string;
  version: string;
  ref: string;
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

export function buildCompanionSpoolQrPayload(
  ref: string,
  companionShellUrl?: string | null,
): string {
  const encodedRef = encodeVersionedFilamentQrRef(ref);
  const normalizedShellUrl = normalizeRef(companionShellUrl);
  if (!normalizedShellUrl) {
    return encodedRef;
  }
  try {
    const shellUrl = new URL(normalizedShellUrl);
    shellUrl.searchParams.set("spool_qr", encodedRef);
    return shellUrl.toString();
  } catch {
    return encodedRef;
  }
}
