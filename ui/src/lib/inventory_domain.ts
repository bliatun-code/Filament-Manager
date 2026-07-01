export type SpoolStatus = "IN_STOCK" | "ASSIGNED" | "BORROWED" | "EMPTY" | "LOST";
export type OwnershipType = "OWNED" | "BORROWED_IN";
export type LoanDirection = "OUTBOUND" | "INBOUND";
export type LoanStatus = "ACTIVE" | "RETURNED";

function normalizeDomainToken(value?: string | null): string {
  return (value ?? "").trim().toUpperCase().replaceAll("-", "_");
}

export function normalizeSpoolStatus(raw?: string | null): SpoolStatus {
  const status = normalizeDomainToken(raw);
  if (status === "IN_USE" || status === "ASSIGNED") {
    return "ASSIGNED";
  }
  if (status === "BORROWED" || status === "EMPTY" || status === "LOST") {
    return status;
  }
  return "IN_STOCK";
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
