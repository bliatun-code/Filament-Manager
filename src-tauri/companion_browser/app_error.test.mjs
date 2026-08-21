import assert from "node:assert/strict";
import test from "node:test";

import {
  appErrorDiagnosticSummary,
  localizedAppError,
  parseAppError,
} from "./app_error.js";

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
