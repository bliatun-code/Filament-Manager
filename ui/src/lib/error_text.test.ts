import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appErrorCode,
  commandErrorText,
  diagnosticErrorText,
  toErrorMessage,
} from "./error_text";

const locationBackendSource = readFileSync(
  new URL("../../../src/backend/database_locations.rs", import.meta.url),
  "utf8",
);

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

test("inventory import price-protection errors use translated guidance", () => {
  const error = new Error(
    JSON.stringify({
      code: "purchase_price_protection.lock_invalid",
      safe_detail: null,
      diagnostic_id: null,
    }),
  );
  const t = (key: string, fallback = "") =>
    key === "errors.purchasePriceProtectionLockInvalid"
      ? "Der importierte Preisschutzwert muss wahr oder falsch sein."
      : fallback;

  assert.equal(
    toErrorMessage(error, "Die Datei konnte nicht importiert werden.", t),
    "Der importierte Preisschutzwert muss wahr oder falsch sein.",
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

test("every user-facing backend location error is a parseable app-error code", () => {
  const backendCodes = new Set(
    [...locationBackendSource.matchAll(/"(inventory\.location\.[a-z0-9_.-]+)"/g)].map(
      (match) => match[1],
    ),
  );
  const expectedCodes = [
    "inventory.location.name_required",
    "inventory.location.name_too_long",
    "inventory.location.name_conflict",
    "inventory.location.already_archived",
    "inventory.location.not_archived",
    "inventory.location.archived",
    "inventory.location.has_references",
    "inventory.location.merge_same_id",
    "inventory.location.parent_cycle",
    "inventory.location.merge_descendant",
    "inventory.location.system_owned",
  ];

  assert.deepEqual([...backendCodes].sort(), [...expectedCodes].sort());
  for (const code of backendCodes) {
    assert.equal(
      appErrorCode(JSON.stringify({ code, safe_detail: null, diagnostic_id: null })),
      code,
    );
  }
});
