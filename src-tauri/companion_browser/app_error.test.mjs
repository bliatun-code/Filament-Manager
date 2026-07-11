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
