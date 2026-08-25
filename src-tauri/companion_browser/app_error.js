const ERROR_MESSAGE_DESCRIPTORS = Object.freeze({
  "common.invalid_request": ["errors.invalidRequest", "The request could not be completed."],
  "common.unauthorized": ["errors.unauthorized", "Authentication is required."],
  "common.forbidden": ["errors.forbidden", "This action is not allowed."],
  "common.not_found": ["errors.notFound", "The requested record was not found."],
  "common.internal": ["errors.internal", "Something went wrong. Try again."],
  "inventory.spool.active_loan": [
    "errors.spoolActiveLoan",
    "Return the active loan before removing this roll.",
  ],
  "inventory.spool.loaded_edit_blocked": [
    "errors.loadedSpoolEditBlocked",
    "Use the printer-slot actions to edit a loaded roll.",
  ],
  "inventory.spool.loaned_edit_blocked": [
    "errors.loanedSpoolEditBlocked",
    "Return the loan before editing this roll's status or location.",
  ],
  "inventory.spool.status_edit_limited": [
    "errors.spoolStatusEditLimited",
    "Browser edits are limited to in-stock, empty, or lost rolls.",
  ],
  "inventory.location.has_references": [
    "errors.locationHasReferences",
    "Move every roll and child location before deleting this location.",
  ],
  "loans.expected_return_invalid": [
    "errors.loanExpectedReturnInvalid",
    "Choose a valid expected return date.",
  ],
  "loans.host_metadata_unsupported": [
    "errors.loanMetadataUnsupported",
    "Update the host before saving loan contact details or an expected return date.",
  ],
  "purchase_metadata.host_unsupported": [
    "errors.purchaseMetadataHostUnsupported",
    "Update the Host before saving purchase details.",
  ],
  "export.invalid_payload": ["errors.exportInvalidPayload", "The generated export is invalid."],
  "export.downloads_unavailable": [
    "errors.downloadsUnavailable",
    "The Downloads folder is unavailable.",
  ],
  "export.write_failed": ["errors.exportWriteFailed", "The export could not be saved."],
  "bambu_live.weight_estimate_changed": [
    "errors.amsWeightEstimateChanged",
    "The AMS estimate or exact roll match changed. Reopen Update weight and try again.",
  ],
});

function parseJsonObject(value) {
  if (typeof value !== "string" || !value.trim().startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function errorCandidate(error) {
  if (error && typeof error === "object" && typeof error.code === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const messageCandidate = parseJsonObject(error.message);
    if (messageCandidate) {
      return messageCandidate;
    }
  }
  return parseJsonObject(error);
}

export function parseAppError(error) {
  const candidate = errorCandidate(error);
  const code = String(candidate?.code || "").trim();
  if (!code || !/^[a-z][a-z0-9_.-]+$/.test(code)) {
    return null;
  }
  const safeDetail =
    typeof candidate.safe_detail === "string" && candidate.safe_detail.trim()
      ? candidate.safe_detail.trim()
      : null;
  const diagnosticId =
    typeof candidate.diagnostic_id === "string" && candidate.diagnostic_id.trim()
      ? candidate.diagnostic_id.trim()
      : null;
  return { code, safeDetail, diagnosticId };
}

export function localizedAppError(error, translate, fallback) {
  const parsed = parseAppError(error);
  const descriptor = parsed ? ERROR_MESSAGE_DESCRIPTORS[parsed.code] : null;
  if (!descriptor) {
    return fallback;
  }
  return translate(descriptor[0], descriptor[1]);
}

export function appErrorDiagnosticSummary(error) {
  const parsed = parseAppError(error);
  if (parsed?.diagnosticId) {
    return `Diagnostic ID: ${parsed.diagnosticId}`;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return "";
}
