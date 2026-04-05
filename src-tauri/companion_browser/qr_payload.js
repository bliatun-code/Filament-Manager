const VERSIONED_PREFIX = /^v(\d+):(.*)$/i;

function normalizeRef(value) {
  const trimmed = String(value || "").trim();
  return trimmed || "";
}

function parseVersionedToken(value) {
  const trimmed = normalizeRef(value);
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(VERSIONED_PREFIX);
  if (!match) {
    return null;
  }
  const version = `v${match[1]}`;
  const ref = normalizeRef(match[2]);
  if (!ref) {
    return null;
  }
  return {
    raw: trimmed,
    version,
    ref,
  };
}

export function encodeVersionedQrRef(ref, version = "v1") {
  const normalizedRef = normalizeRef(ref);
  const normalizedVersion = String(version || "v1").trim().toLowerCase();
  if (!normalizedRef) {
    throw new Error("QR reference is required.");
  }
  if (!/^v\d+$/.test(normalizedVersion)) {
    throw new Error("QR version must use the v<number> format.");
  }
  return `${normalizedVersion}:${normalizedRef}`;
}

export function decodeQrPayload(value) {
  const trimmed = normalizeRef(value);
  if (!trimmed) {
    return null;
  }

  const versioned = parseVersionedToken(trimmed);
  if (versioned) {
    return versioned;
  }

  return {
    raw: trimmed,
    version: "legacy",
    ref: trimmed,
  };
}

export function parseQrPayload(input) {
  const trimmed = normalizeRef(input);
  if (!trimmed) {
    return null;
  }

  const direct = decodeQrPayload(trimmed);
  if (direct?.version !== "legacy") {
    return direct;
  }

  try {
    const url = new URL(trimmed);
    const spoolQr = normalizeRef(url.searchParams.get("spool_qr"));
    const qrCode = normalizeRef(url.searchParams.get("qr_code"));
    const embedded = spoolQr || qrCode;
    if (embedded) {
      const decodedEmbedded = decodeQrPayload(embedded);
      if (decodedEmbedded) {
        return {
          ...decodedEmbedded,
          raw: trimmed,
        };
      }
    }
  } catch {
    // Treat non-URL payloads as raw references.
  }

  return direct;
}
