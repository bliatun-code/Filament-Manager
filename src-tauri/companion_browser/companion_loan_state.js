export function loanHasDeletedSpool(row) {
  return String(row?.spool_status || "").trim().toUpperCase() === "DELETED";
}

export function isLoanCurrentlyActive(row) {
  return !row?.loan?.returned_at && !loanHasDeletedSpool(row);
}

export function isActiveOutboundLoan(row) {
  const direction = String(row?.loan?.loan_direction || "OUTBOUND").trim().toUpperCase();
  const status = String(row?.loan?.loan_status || "").trim().toUpperCase();
  const currentlyActive = isLoanCurrentlyActive(row);
  return direction === "OUTBOUND" && currentlyActive && (status === "" || status === "ACTIVE");
}
