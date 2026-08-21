import test from "node:test";
import assert from "node:assert/strict";
import { commandErrorText, diagnosticErrorText, toErrorMessage } from "./error_text";

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
