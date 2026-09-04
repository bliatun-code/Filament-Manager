import assert from "node:assert/strict";
import test from "node:test";

import {
  ERROR_MESSAGE_DESCRIPTORS,
  appErrorDiagnosticSummary,
  localizedAppError,
  parseAppError,
} from "./app_error.js";

test("temporarily unavailable Host responses have a localizable descriptor", () => {
  assert.deepEqual(ERROR_MESSAGE_DESCRIPTORS["common.unavailable"], [
    "errors.unavailable",
    "The service is temporarily unavailable.",
  ]);
});

test("location lifecycle errors have distinct localizable descriptors", () => {
  const expectedKeys = {
    "inventory.location.name_required": "errors.locationNameRequired",
    "inventory.location.name_too_long": "errors.locationNameTooLong",
    "inventory.location.name_conflict": "errors.locationNameConflict",
    "inventory.location.already_archived": "errors.locationAlreadyArchived",
    "inventory.location.not_archived": "errors.locationNotArchived",
    "inventory.location.archived": "errors.locationArchived",
    "inventory.location.has_references": "errors.locationHasReferences",
    "inventory.location.merge_same_id": "errors.locationMergeSameId",
    "inventory.location.parent_cycle": "errors.locationParentCycle",
    "inventory.location.merge_descendant": "errors.locationMergeDescendant",
    "inventory.location.system_owned": "errors.locationSystemOwned",
    "inventory.location.host_unsupported": "errors.locationHostUnsupported",
  };

  for (const [code, key] of Object.entries(expectedKeys)) {
    assert.equal(ERROR_MESSAGE_DESCRIPTORS[code]?.[0], key, code);
    assert.ok(ERROR_MESSAGE_DESCRIPTORS[code]?.[1], code);
  }
});

test("atomic printer slot failures use existing localized messages without raw details", () => {
  for (const [code, expectedKey] of [
    ["printers.slot_operation_invalid", "errors.invalidRequest"],
    ["printers.slot_operation_stale", "status.printerSlotFailed"],
  ]) {
    const message = localizedAppError(
      { code, message: "internal validation detail" },
      (key) => key === expectedKey ? "Oversatt melding" : "Feil nøkkel",
      "Fallback",
    );
    assert.equal(message, "Oversatt melding", code);
  }
});

test("loan business conflicts have stable localizable descriptors", () => {
  for (const code of [
    "loans.borrower_required",
    "loans.counterparty_required",
    "loans.already_active",
    "loans.already_returned",
    "loans.direction_mismatch",
    "loans.borrowed_in_cannot_lend",
    "loans.inbound_required",
  ]) {
    assert.ok(ERROR_MESSAGE_DESCRIPTORS[code]?.[0], code);
    assert.ok(ERROR_MESSAGE_DESCRIPTORS[code]?.[1], code);
  }
  assert.equal(
    ERROR_MESSAGE_DESCRIPTORS["loans.already_returned"][0],
    "errors.loanAlreadyReturned",
  );
  assert.equal(
    ERROR_MESSAGE_DESCRIPTORS["loans.direction_mismatch"][0],
    "errors.loanDirectionMismatch",
  );
});

test("legacy Hosts cannot receive a non-atomic common-details fallback", () => {
  assert.deepEqual(
    ERROR_MESSAGE_DESCRIPTORS[
      "inventory.spool.common_details_host_unsupported"
    ],
    [
      "errors.spoolCommonDetailsHostUnsupported",
      "Update the Host before saving tare weight or ownership together with roll details.",
    ],
  );
});

test("structured command errors parse from Tauri JSON strings without exposing diagnostics", () => {
  const error = new Error(
    JSON.stringify({
      code: "inventory.spool.active_loan",
      safe_detail: null,
      diagnostic_id: "fm-test-1",
    }),
  );
  assert.deepEqual(parseAppError(error), {
    code: "inventory.spool.active_loan",
    safeDetail: null,
    diagnosticId: "fm-test-1",
  });
  assert.equal(
    localizedAppError(error, (_key, fallback) => fallback, "Could not remove roll."),
    "Return the active loan before removing this roll.",
  );
  assert.equal(appErrorDiagnosticSummary(error), "Diagnostic ID: fm-test-1");
});

test("unknown and legacy errors use the localized operation fallback", () => {
  assert.equal(
    localizedAppError(new Error("database table leaked"), (_key, fallback) => fallback, "Try again."),
    "Try again.",
  );
  assert.equal(
    localizedAppError({ code: "future.code" }, (_key, fallback) => fallback, "Try again."),
    "Try again.",
  );
});

test("changed AMS estimates use the localized stable-code message", () => {
  const translated = localizedAppError(
    { code: "bambu_live.weight_estimate_changed" },
    (key, fallback) =>
      key === "errors.amsWeightEstimateChanged"
        ? "AMS-estimatet eller det eksakte rulltreffet ble endret."
        : fallback,
    "Kunne ikke oppdatere vekten.",
  );

  assert.equal(
    translated,
    "AMS-estimatet eller det eksakte rulltreffet ble endret.",
  );
  assert.doesNotMatch(translated, /bambu_live\.weight_estimate_changed/);
});

test("legacy Host capability failures use a clear localized message", () => {
  const translated = localizedAppError(
    { code: "loans.host_metadata_unsupported" },
    (key, fallback) =>
      key === "errors.loanMetadataUnsupported"
        ? "Oppdater verten før utlånsdetaljene lagres."
        : fallback,
    "Kunne ikke låne ut rullen.",
  );

  assert.equal(translated, "Oppdater verten før utlånsdetaljene lagres.");
});

test("purchase metadata capability failures explicitly require a Host upgrade", () => {
  const translated = localizedAppError(
    { code: "purchase_metadata.host_unsupported" },
    (key, fallback) =>
      key === "errors.purchaseMetadataHostUnsupported"
        ? "Oppdater verten før du lagrer innkjøpsdetaljer."
        : fallback,
    "Kunne ikke lagre innkjøpsdetaljer.",
  );

  assert.equal(translated, "Oppdater verten før du lagrer innkjøpsdetaljer.");
  assert.doesNotMatch(translated, /purchase_metadata\.host_unsupported/);
});
