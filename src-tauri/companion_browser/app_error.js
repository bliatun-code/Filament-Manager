export const ERROR_MESSAGE_DESCRIPTORS = Object.freeze({
  "common.invalid_request": ["errors.invalidRequest", "The request could not be completed."],
  "common.unauthorized": ["errors.unauthorized", "Authentication is required."],
  "common.forbidden": ["errors.forbidden", "This action is not allowed."],
  "common.not_found": ["errors.notFound", "The requested record was not found."],
  "common.unavailable": [
    "errors.unavailable",
    "The service is temporarily unavailable.",
  ],
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
  "inventory.location.name_required": [
    "errors.locationNameRequired",
    "Location name is required.",
  ],
  "inventory.location.name_too_long": [
    "errors.locationNameTooLong",
    "Location names can contain at most 120 characters.",
  ],
  "inventory.location.name_conflict": [
    "errors.locationNameConflict",
    "An active location already uses this name.",
  ],
  "inventory.location.already_archived": [
    "errors.locationAlreadyArchived",
    "This location is already archived.",
  ],
  "inventory.location.not_archived": [
    "errors.locationNotArchived",
    "This location is already active.",
  ],
  "inventory.location.archived": [
    "errors.locationArchived",
    "Restore this location before using it or assigning rolls to it.",
  ],
  "inventory.location.merge_same_id": [
    "errors.locationMergeSameId",
    "Choose two different locations to merge.",
  ],
  "inventory.location.parent_cycle": [
    "errors.locationParentCycle",
    "A location cannot be moved beneath itself or one of its descendants.",
  ],
  "inventory.location.merge_descendant": [
    "errors.locationMergeDescendant",
    "A location cannot be merged into one of its descendants.",
  ],
  "inventory.location.system_owned": [
    "errors.locationSystemOwned",
    "This location is managed by the printer or loan workflow.",
  ],
  "inventory.location.host_unsupported": [
    "errors.locationHostUnsupported",
    "Update the Host before managing location objects.",
  ],
  "inventory.bulk.invalid_expected_count": [
    "errors.inventoryBulkInvalidExpectedCount",
    "The bulk review is invalid. Reload inventory and review the action again.",
  ],
  "inventory.bulk.empty_selection": [
    "errors.inventoryBulkEmptySelection",
    "Select at least one roll for the bulk action.",
  ],
  "inventory.bulk.blank_spool_id": [
    "errors.inventoryBulkInvalidSelection",
    "The selected rolls are invalid. Clear the selection and choose them again.",
  ],
  "inventory.bulk.duplicate_spool_id": [
    "errors.inventoryBulkInvalidSelection",
    "The selected rolls are invalid. Clear the selection and choose them again.",
  ],
  "inventory.bulk.stale_snapshot": [
    "errors.inventoryBulkStaleReview",
    "The selected rolls changed. Reload inventory and review the bulk action again.",
  ],
  "inventory.bulk.affected_count_mismatch": [
    "errors.inventoryBulkStaleReview",
    "The selected rolls changed. Reload inventory and review the bulk action again.",
  ],
  "inventory.bulk.invalid_location_target": [
    "errors.inventoryBulkInvalidLocationTarget",
    "Choose an active inventory location and review the move again.",
  ],
  "inventory.bulk.invalid_status_target": [
    "errors.inventoryBulkInvalidStatusTarget",
    "Choose an allowed inventory status and review the action again.",
  ],
  "inventory.bulk.removed_spool": [
    "errors.inventoryBulkRemovedSpool",
    "A selected roll was removed. Reload inventory and review the action again.",
  ],
  "inventory.bulk.printer_slot_controlled": [
    "errors.inventoryBulkPrinterSlotControlled",
    "A selected roll is loaded in a printer. Use printer-slot actions or remove it from the selection.",
  ],
  "inventory.bulk.active_loan": [
    "errors.inventoryBulkActiveLoan",
    "A selected roll has an active loan. Return it or remove it from the selection.",
  ],
  "inventory.bulk.write_conflict": [
    "errors.inventoryBulkStaleReview",
    "The selected rolls changed. Reload inventory and review the bulk action again.",
  ],
  "loans.expected_return_invalid": [
    "errors.loanExpectedReturnInvalid",
    "Choose a valid expected return date.",
  ],
  "loans.borrower_required": [
    "status.loanBorrowerRequired",
    "Enter a borrower name before creating a loan.",
  ],
  "loans.counterparty_required": [
    "status.borrowedInOwnerRequired",
    "Enter who the borrowed-in spool is borrowed from.",
  ],
  "loans.already_active": [
    "errors.loanAlreadyActive",
    "This roll already has an active loan.",
  ],
  "loans.already_returned": [
    "errors.loanAlreadyReturned",
    "This loan was already returned with different return details.",
  ],
  "loans.direction_mismatch": [
    "errors.loanDirectionMismatch",
    "Use the return action for this loan direction.",
  ],
  "loans.borrowed_in_cannot_lend": [
    "errors.borrowedInCannotLend",
    "A borrowed-in roll cannot be loaned out.",
  ],
  "loans.inbound_required": [
    "errors.inboundLoanRequired",
    "This action is only available for borrowed-in rolls.",
  ],
  "loans.host_metadata_unsupported": [
    "errors.loanMetadataUnsupported",
    "Update the host before saving loan contact details or an expected return date.",
  ],
  "inventory.spool.common_details_host_unsupported": [
    "errors.spoolCommonDetailsHostUnsupported",
    "Update the Host before saving tare weight or ownership together with roll details.",
  ],
  "wishlist.receive.quantity_invalid": [
    "errors.wishlistReceiveQuantityInvalid",
    "Choose a quantity of at least one roll.",
  ],
  "wishlist.receive.already_received": [
    "errors.wishlistReceiveAlreadyReceived",
    "This wishlist item has already been received. Refresh the wishlist.",
  ],
  "wishlist.receive.quantity_exceeds_remaining": [
    "errors.wishlistReceiveQuantityExceedsRemaining",
    "The quantity exceeds the number of rolls still expected. Refresh the wishlist.",
  ],
  "wishlist.status.invalid": [
    "errors.wishlistStatusInvalid",
    "Choose a valid wishlist status.",
  ],
  "wishlist.status.received_requires_receipt": [
    "errors.wishlistStatusReceivedRequiresReceipt",
    "Receive the remaining rolls through the stock-receipt action.",
  ],
  "purchase_metadata.host_unsupported": [
    "errors.purchaseMetadataHostUnsupported",
    "Update the Host before saving purchase details.",
  ],
  "purchase_metadata.price_invalid": [
    "errors.purchasePriceInvalid",
    "Enter a valid purchase price of zero or more.",
  ],
  "purchase_metadata.currency_invalid": [
    "errors.purchaseCurrencyInvalid",
    "Enter a valid three-letter purchase currency.",
  ],
  "purchase_metadata.currency_required": [
    "errors.purchaseCurrencyRequired",
    "Purchase currency is required when a purchase price is set.",
  ],
  "purchase_metadata.price_required": [
    "errors.purchasePriceRequired",
    "Purchase price is required when a purchase currency is set.",
  ],
  "purchase_metadata.date_invalid": [
    "errors.purchaseDateInvalid",
    "Enter a valid purchase date.",
  ],
  "purchase_metadata.batch_code_too_long": [
    "errors.purchaseBatchCodeTooLong",
    "The purchase batch code is too long.",
  ],
  "purchase_metadata.supplier_reference_too_long": [
    "errors.purchaseSupplierReferenceTooLong",
    "The supplier reference is too long.",
  ],
  "purchase_metadata.type_invalid": [
    "errors.purchaseMetadataTypeInvalid",
    "The purchase details have an invalid format. Review them and try again.",
  ],
  "purchase_price_protection.lock_invalid": [
    "errors.purchasePriceProtectionLockInvalid",
    "The imported price-protection value must be true or false.",
  ],
  "purchase_price_protection.source_invalid": [
    "errors.purchasePriceProtectionSourceInvalid",
    "The imported price source must be MANUAL, STANDARD_BATCH, or empty.",
  ],
  "filament_standards.host_unsupported": [
    "errors.filamentStandardsHostUnsupported",
    "Update the Host before using filament pricing standards.",
  ],
  "filament_standards.role_unresolved": [
    "errors.filamentStandardsRoleUnresolved",
    "Wait for the library role to finish loading, then try again.",
  ],
  "filament_standards.host_managed": [
    "errors.filamentStandardsHostManaged",
    "Manage library-wide filament defaults on the Host desktop app.",
  ],
  "filament_standards.not_loaded": [
    "errors.filamentStandardsNotLoaded",
    "Wait for filament standards to finish loading, then try again.",
  ],
  "filament_price_batch.stale_review": [
    "errors.filamentStandardsStaleReview",
    "The selected rolls changed. Review the filament price group again.",
  ],
  "filament_price_batch.group_required": [
    "errors.filamentBatchGroupRequired",
    "Choose a filament price group.",
  ],
  "filament_price_batch.empty_selection": [
    "errors.filamentBatchEmptySelection",
    "Select at least one roll for this price update.",
  ],
  "filament_price_batch.blank_spool_id": [
    "errors.filamentBatchInvalidSelection",
    "The selected rolls are invalid. Review the filament price group again.",
  ],
  "filament_price_batch.duplicate_spool_id": [
    "errors.filamentBatchInvalidSelection",
    "The selected rolls are invalid. Review the filament price group again.",
  ],
  "filament_price_batch.invalid_historical_fill": [
    "errors.filamentBatchInvalidHistoricalFill",
    "Historical missing-price fill is only available for an owned, unpriced historical roll in Only missing prices mode.",
  ],
  "filament_standards.currency_invalid": [
    "errors.filamentStandardsCurrencyInvalid",
    "Enter a valid three-letter purchase currency.",
  ],
  "filament_standards.price_invalid": [
    "errors.filamentStandardsPriceInvalid",
    "Enter a valid filament price of zero or more.",
  ],
  "filament_standards.version_unsupported": [
    "errors.filamentStandardsInvalid",
    "The saved filament standards are no longer valid. Reload and review them.",
  ],
  "filament_standards.nominal_weight_invalid": [
    "errors.filamentStandardsInvalid",
    "The saved filament standards are no longer valid. Reload and review them.",
  ],
  "filament_standards.group_key_mismatch": [
    "errors.filamentStandardsInvalid",
    "The saved filament standards are no longer valid. Reload and review them.",
  ],
  "filament_standards.duplicate_group": [
    "errors.filamentStandardsInvalid",
    "The saved filament standards are no longer valid. Reload and review them.",
  ],
  "filament_standards.group_component_invalid": [
    "errors.filamentStandardsInvalid",
    "The saved filament standards are no longer valid. Reload and review them.",
  ],
  "filament_standards.group_missing": [
    "errors.filamentStandardsStaleReview",
    "The selected rolls changed. Review the filament price group again.",
  ],
  "filament_standards.group_metadata_stale": [
    "errors.filamentStandardsStaleReview",
    "The selected rolls changed. Review the filament price group again.",
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
