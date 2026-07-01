const LEGACY_REMOVED_SPOOL_STATUS_TOKENS = new Set(["DELETED", "MISSING"]);

export function normalizeDomainToken(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
}

export function parseSpoolStatus(value) {
  const status = normalizeDomainToken(value);
  if (status === "IN_USE" || status === "ASSIGNED") {
    return "ASSIGNED";
  }
  if (status === "IN_STOCK" || status === "BORROWED" || status === "EMPTY" || status === "LOST") {
    return status;
  }
  return null;
}

export function normalizeSpoolStatus(value) {
  return parseSpoolStatus(value) || "IN_STOCK";
}

export function normalizeEditableSpoolStatus(value) {
  const status = parseSpoolStatus(value);
  return status === "EMPTY" || status === "LOST" ? status : "IN_STOCK";
}

export function normalizeOwnershipType(value) {
  return normalizeDomainToken(value) === "BORROWED_IN" ? "BORROWED_IN" : "OWNED";
}

export function isBorrowedInOwnership(value) {
  return normalizeOwnershipType(value) === "BORROWED_IN";
}

export function isLegacyRemovedSpoolStatus(value) {
  return LEGACY_REMOVED_SPOOL_STATUS_TOKENS.has(normalizeDomainToken(value));
}

export function isSpoolStatusDeleted(value) {
  return normalizeDomainToken(value) === "DELETED";
}

export function isSpoolStatusAssigned(value) {
  return parseSpoolStatus(value) === "ASSIGNED";
}

export function isSpoolStatusEmpty(value) {
  return parseSpoolStatus(value) === "EMPTY";
}

export function isSpoolStatusEmptyOrLost(value) {
  const status = parseSpoolStatus(value);
  return status === "EMPTY" || status === "LOST";
}

export function isSpoolStatusLoanedOut(value) {
  return parseSpoolStatus(value) === "BORROWED";
}

export function isSpoolStatusUnavailableForPrinterSlot(value) {
  return (
    isSpoolStatusEmptyOrLost(value) ||
    isSpoolStatusLoanedOut(value) ||
    isLegacyRemovedSpoolStatus(value)
  );
}

export function isSpoolStatusLiveRfidCandidate(value) {
  return !isSpoolStatusUnavailableForPrinterSlot(value);
}

export function isEditableSpoolStatus(value) {
  const status = parseSpoolStatus(value);
  return status === "IN_STOCK" || status === "EMPTY" || status === "LOST";
}
