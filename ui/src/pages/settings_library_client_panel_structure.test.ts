import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./settings_library_client_panel.tsx", import.meta.url),
  "utf8",
);

test("library client validation uses shared feedback banner tones", () => {
  assert.match(source, /FeedbackBanner/);
  assert.match(source, /librarySyncValidationFeedbackTone/);
  assert.match(source, /tone=\{librarySyncValidationFeedbackTone\(librarySyncValidation\)\}/);
  assert.doesNotMatch(source, /border-emerald-200 bg-emerald-50\/80/);
  assert.doesNotMatch(source, /border-amber-200 bg-amber-50\/80/);
  assert.doesNotMatch(source, /border-rose-200 bg-rose-50\/80/);
});

test("persisted host validation copy filters legacy transient AMS success messages", () => {
  assert.match(source, /visibleLibrarySyncValidationMessage/);
  assert.match(
    source,
    /const lastValidationMessage = visibleLibrarySyncValidationMessage\(/,
  );
  assert.doesNotMatch(
    source,
    /\{librarySyncSettings\.last_validation_message\}/,
  );
});
