import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  confirmInventoryDetailDiscard,
  requestInventoryDetailClose,
  requestInventoryDetailDiscard,
} from "./use_inventory_unsaved_changes_guard";

const source = readFileSync(
  new URL("./use_inventory_unsaved_changes_guard.ts", import.meta.url),
  "utf8",
);

test("inventory discard guard never opens a blocking browser confirm", () => {
  assert.doesNotMatch(source, /window\.confirm\s*\(/);
});

test("detail close handler never queues a React click event as deferred navigation", () => {
  let deferredValue: unknown = Symbol("not called");
  const requestDiscardThen = (afterConfirmedDiscard?: () => void) => {
    deferredValue = afterConfirmedDiscard;
    return false;
  };
  const close = (event: { type: string }) => {
    void event;
    return requestInventoryDetailClose(requestDiscardThen);
  };

  close({ type: "click" });
  assert.equal(deferredValue, undefined);
});

test("clean detail closes without prompting", () => {
  let confirmationRequests = 0;
  let discards = 0;
  const allowed = requestInventoryDetailDiscard({
    hasUnsavedChanges: false,
    onConfirmationRequired: () => {
      confirmationRequests += 1;
    },
    onDiscard: () => {
      discards += 1;
    },
  });
  assert.equal(allowed, true);
  assert.equal(confirmationRequests, 0);
  assert.equal(discards, 1);
});

test("dirty detail requests non-blocking confirmation and remains open", () => {
  let confirmationRequests = 0;
  let discards = 0;
  const allowed = requestInventoryDetailDiscard({
    hasUnsavedChanges: true,
    onConfirmationRequired: () => {
      confirmationRequests += 1;
    },
    onDiscard: () => {
      discards += 1;
    },
  });
  assert.equal(allowed, false);
  assert.equal(confirmationRequests, 1);
  assert.equal(discards, 0);
});

test("explicit confirmation discards before continuing deferred navigation", () => {
  const events: string[] = [];
  let discards = 0;
  confirmInventoryDetailDiscard({
    onDiscard: () => {
      discards += 1;
      events.push("discard");
    },
    afterDiscard: () => {
      events.push("navigate");
    },
  });
  assert.equal(discards, 1);
  assert.deepEqual(events, ["discard", "navigate"]);
});
