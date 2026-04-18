const VERSIONED_PREFIX = /^v(\d+):(.*)$/i;

function normalizeRef(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export type ParsedFilamentQrPayload = {
  raw: string;
  version: string;
  ref: string;
};

export type FilamentQrMode = "portable" | "companion";

export type BuiltFilamentQrPayload = {
  mode: FilamentQrMode;
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

export function buildPortableSpoolQrPayload(ref: string): string {
  return encodeVersionedFilamentQrRef(ref);
}

export function deriveCompanionShellUrl(
  baseUrl: string | null | undefined,
): string | null {
  const normalizedBaseUrl = normalizeRef(baseUrl);
  if (!normalizedBaseUrl) {
    return null;
  }
  try {
    const url = new URL(normalizedBaseUrl);
    const trimmedPath = url.pathname.replace(/\/+$/, "");
    if (!trimmedPath || trimmedPath === "/") {
      url.pathname = "/companion";
    } else if (!trimmedPath.endsWith("/companion")) {
      url.pathname = `${trimmedPath}/companion`;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function buildFilamentQrPayload(
  ref: string,
  options?: {
    mode?: FilamentQrMode;
    companionShellUrl?: string | null;
  },
): BuiltFilamentQrPayload {
  const portablePayload = buildPortableSpoolQrPayload(ref);
  const mode = options?.mode ?? "portable";
  if (mode === "portable") {
    return {
      mode: "portable",
      payload: portablePayload,
      target: portablePayload,
    };
  }

  const normalizedShellUrl = normalizeRef(options?.companionShellUrl);
  if (!normalizedShellUrl) {
    return {
      mode: "portable",
      payload: portablePayload,
      target: portablePayload,
    };
  }

  try {
    const shellUrl = new URL(normalizedShellUrl);
    shellUrl.searchParams.set("spool_qr", portablePayload);
    const target = shellUrl.toString();
    return {
      mode: "companion",
      payload: target,
      target,
    };
  } catch {
    return {
      mode: "portable",
      payload: portablePayload,
      target: portablePayload,
    };
  }
}

export function buildCompanionSpoolQrPayload(
  ref: string,
  companionShellUrl?: string | null,
): string {
  return buildFilamentQrPayload(ref, {
    mode: "companion",
    companionShellUrl,
  }).payload;
}
