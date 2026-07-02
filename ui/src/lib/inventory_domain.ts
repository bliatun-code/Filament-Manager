export type SpoolStatus = "IN_STOCK" | "ASSIGNED" | "BORROWED" | "EMPTY" | "LOST";
export type OwnershipType = "OWNED" | "BORROWED_IN";
export type LoanDirection = "OUTBOUND" | "INBOUND";
export type LoanStatus = "ACTIVE" | "RETURNED" | "LOST" | "CANCELLED";

const LEGACY_REMOVED_SPOOL_STATUS_TOKENS = new Set(["MISSING", "DELETED"]);

function normalizeDomainToken(value?: string | null): string {
  return (value ?? "").trim().toUpperCase().replace(/[-\s]+/g, "_");
}

export function parseSpoolStatus(raw?: string | null): SpoolStatus | null {
  const status = normalizeDomainToken(raw);
  if (status === "IN_USE" || status === "ASSIGNED") {
    return "ASSIGNED";
  }
  if (status === "LOANED_OUT" || status === "LOANED") {
    return "BORROWED";
  }
  if (status === "BORROWED" || status === "EMPTY" || status === "LOST") {
    return status;
  }
  if (status === "IN_STOCK") {
    return "IN_STOCK";
  }
  return null;
}

export function normalizeSpoolStatus(raw?: string | null): SpoolStatus {
  const status = parseSpoolStatus(raw);
  if (status) {
    return status;
  }
  return "IN_STOCK";
}

export function isSpoolStatusOnHand(raw?: string | null): boolean {
  const status = parseSpoolStatus(raw);
  return status === "IN_STOCK" || status === "ASSIGNED";
}

export function isSpoolStatusAssigned(raw?: string | null): boolean {
  return parseSpoolStatus(raw) === "ASSIGNED";
}

export function isSpoolStatusLoanable(raw?: string | null): boolean {
  return parseSpoolStatus(raw) === "IN_STOCK";
}

export function isSpoolStatusEmptyOrLost(raw?: string | null): boolean {
  const status = parseSpoolStatus(raw);
  return status === "EMPTY" || status === "LOST";
}

export function isSpoolStatusEmpty(raw?: string | null): boolean {
  return parseSpoolStatus(raw) === "EMPTY";
}

export function isSpoolStatusDeleted(raw?: string | null): boolean {
  return normalizeDomainToken(raw) === "DELETED";
}

export function isSpoolStatusUnavailableForSlot(raw?: string | null): boolean {
  const status = parseSpoolStatus(raw);
  return (
    status === "EMPTY" ||
    status === "LOST" ||
    status === "BORROWED" ||
    LEGACY_REMOVED_SPOOL_STATUS_TOKENS.has(normalizeDomainToken(raw))
  );
}

export function isSpoolStatusRfidMatchable(raw?: string | null): boolean {
  const status = parseSpoolStatus(raw);
  return (
    status !== "LOST" &&
    status !== "BORROWED" &&
    !LEGACY_REMOVED_SPOOL_STATUS_TOKENS.has(normalizeDomainToken(raw))
  );
}

export function isSpoolStatusMetadataMatchable(raw?: string | null): boolean {
  return isSpoolStatusRfidMatchable(raw) && parseSpoolStatus(raw) !== "EMPTY";
}

export function normalizeOwnershipType(raw?: string | null): OwnershipType {
  return normalizeDomainToken(raw) === "BORROWED_IN" ? "BORROWED_IN" : "OWNED";
}

export function isBorrowedInOwnership(raw?: string | null): boolean {
  return normalizeOwnershipType(raw) === "BORROWED_IN";
}

export function normalizeLoanDirection(raw?: string | null): LoanDirection {
  const direction = normalizeDomainToken(raw);
  if (direction === "INBOUND" || direction === "IN_BOUND") {
    return "INBOUND";
  }
  return "OUTBOUND";
}

export function normalizeLoanStatus(
  raw?: string | null,
  returnedAt?: string | null,
): LoanStatus {
  const status = normalizeDomainToken(raw);
  if (status === "RETURNED" || (returnedAt ?? "").trim().length > 0) {
    return "RETURNED";
  }
  if (status === "LOST" || status === "CANCELLED") {
    return status;
  }
  return "ACTIVE";
}
