import assert from "node:assert/strict";
import test from "node:test";

import { requestInventoryDetailDiscard } from "./use_inventory_unsaved_changes_guard";

test("clean detail closes without prompting", () => {
  let prompts = 0;
  let discards = 0;
  const allowed = requestInventoryDetailDiscard({
    hasUnsavedChanges: false,
    message: "Discard?",
    confirmDiscard: () => {
      prompts += 1;
      return false;
    },
    onDiscard: () => {
      discards += 1;
    },
  });
  assert.equal(allowed, true);
  assert.equal(prompts, 0);
  assert.equal(discards, 1);
});

test("dirty detail remains open when discard is cancelled", () => {
  let discards = 0;
  const allowed = requestInventoryDetailDiscard({
    hasUnsavedChanges: true,
    message: "Discard?",
    confirmDiscard: () => false,
    onDiscard: () => {
      discards += 1;
    },
  });
  assert.equal(allowed, false);
  assert.equal(discards, 0);
});

test("dirty detail discards only after explicit confirmation", () => {
  let receivedMessage = "";
  let discards = 0;
  const allowed = requestInventoryDetailDiscard({
    hasUnsavedChanges: true,
    message: "You have unsaved changes.",
    confirmDiscard: (message) => {
      receivedMessage = message;
      return true;
    },
    onDiscard: () => {
      discards += 1;
    },
  });
  assert.equal(allowed, true);
  assert.equal(receivedMessage, "You have unsaved changes.");
  assert.equal(discards, 1);
});
