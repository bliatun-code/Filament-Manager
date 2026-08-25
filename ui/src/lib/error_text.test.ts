import test from "node:test";
import assert from "node:assert/strict";
import {
  appErrorCode,
  commandErrorText,
  diagnosticErrorText,
  toErrorMessage,
} from "./error_text";

test("toErrorMessage keeps unknown technical details out of ordinary UI", () => {
  assert.equal(toErrorMessage(new Error("boom"), "Fallback"), "Fallback");
  assert.equal(toErrorMessage("plain", "Fallback"), "Fallback");
  assert.equal(toErrorMessage("", "Fallback"), "Fallback");
});

test("commandErrorText keeps the legacy call name for command handlers", () => {
  assert.equal(commandErrorText(new Error("failed"), "Could not save"), "Could not save");
});

test("structured command errors resolve safely while diagnostics stay explicit", () => {
  const error = new Error(
    JSON.stringify({
      code: "inventory.spool.active_loan",
      safe_detail: null,
      diagnostic_id: "fm-test-2",
    }),
  );
  const t = (key: string, fallback = "") =>
    key === "errors.spoolActiveLoan" ? "Returner utlånet først." : fallback;
  assert.equal(toErrorMessage(error, "Kunne ikke fjerne rullen.", t), "Returner utlånet først.");
  assert.equal(diagnosticErrorText(error), "Diagnostic ID: fm-test-2");
});

test("older Host purchase metadata capability error is localized and actionable", () => {
  const error = new Error(
    JSON.stringify({
      code: "purchase_metadata.host_unsupported",
      safe_detail: null,
      diagnostic_id: "fm-purchase-host-1",
    }),
  );
  const t = (key: string, fallback = "") =>
    key === "errors.purchaseMetadataHostUnsupported"
      ? "Oppdater verten før du lagrer kjøpsdetaljer."
      : fallback;

  assert.equal(
    toErrorMessage(error, "Kunne ikke lagre kjøpsdetaljer.", t),
    "Oppdater verten før du lagrer kjøpsdetaljer.",
  );
});

test("referenced location deletion error explains the required cleanup", () => {
  const error = new Error(
    JSON.stringify({
      code: "inventory.location.has_references",
      safe_detail: null,
      diagnostic_id: null,
    }),
  );
  const t = (key: string, fallback = "") =>
    key === "errors.locationHasReferences"
      ? "Flytt alle ruller og underlokasjoner først."
      : fallback;

  assert.equal(
    toErrorMessage(error, "Kunne ikke slette lokasjonen.", t),
    "Flytt alle ruller og underlokasjoner først.",
  );
});

test("stale filament pricing reviews use an actionable localized message", () => {
  const error = new Error(
    JSON.stringify({
      code: "filament_price_batch.stale_review",
      safe_detail: null,
      diagnostic_id: "fm-price-review-1",
    }),
  );
  const t = (key: string, fallback = "") =>
    key === "errors.filamentStandardsStaleReview"
      ? "Rullene er endret. Se gjennom prisgruppen på nytt."
      : fallback;

  assert.equal(
    toErrorMessage(error, "Kunne ikke bruke filamentprisene.", t),
    "Rullene er endret. Se gjennom prisgruppen på nytt.",
  );
});

test("structured Host capability errors expose a safe machine-readable code", () => {
  const error = new Error(
    JSON.stringify({
      code: "filament_standards.host_unsupported",
      safe_detail: null,
      diagnostic_id: "fm-standards-host-1",
    }),
  );

  assert.equal(appErrorCode(error), "filament_standards.host_unsupported");
  assert.equal(appErrorCode(new Error("network failed")), null);
});
