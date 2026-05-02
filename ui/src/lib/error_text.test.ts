import test from "node:test";
import assert from "node:assert/strict";
import { commandErrorText, toErrorMessage } from "./error_text";

test("toErrorMessage appends useful error details", () => {
  assert.equal(toErrorMessage(new Error("boom"), "Fallback"), "Fallback (boom)");
  assert.equal(toErrorMessage("plain", "Fallback"), "Fallback (plain)");
  assert.equal(toErrorMessage("", "Fallback"), "Fallback");
});

test("commandErrorText keeps the legacy call name for command handlers", () => {
  assert.equal(commandErrorText(new Error("failed"), "Could not save"), "Could not save (failed)");
});
