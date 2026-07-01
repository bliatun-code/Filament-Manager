export type SpoolStatus = "IN_STOCK" | "ASSIGNED" | "BORROWED" | "EMPTY" | "LOST";
export type OwnershipType = "OWNED" | "BORROWED_IN";
export type LoanDirection = "OUTBOUND" | "INBOUND";
export type LoanStatus = "ACTIVE" | "RETURNED";

const LEGACY_REMOVED_SPOOL_STATUS_TOKENS = new Set(["MISSING", "DELETED"]);

function normalizeDomainToken(value?: string | null): string {
  return (value ?? "").trim().toUpperCase().replaceAll("-", "_");
}

export function parseSpoolStatus(raw?: string | null): SpoolStatus | null {
  const status = normalizeDomainToken(raw);
  if (status === "IN_USE" || status === "ASSIGNED") {
    return "ASSIGNED";
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

export function normalizeLoanDirection(raw?: string | null): LoanDirection {
  return normalizeDomainToken(raw) === "INBOUND" ? "INBOUND" : "OUTBOUND";
}

export function normalizeLoanStatus(
  raw?: string | null,
  returnedAt?: string | null,
): LoanStatus {
  const status = normalizeDomainToken(raw);
  if (status === "RETURNED" || (returnedAt ?? "").trim().length > 0) {
    return "RETURNED";
  }
  return "ACTIVE";
}
