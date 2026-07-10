import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflowSource = readFileSync(
  new URL("./use_inventory_add_workflow.ts", import.meta.url),
  "utf8",
);
const actionsSource = readFileSync(
  new URL("./use_inventory_create_actions.ts", import.meta.url),
  "utf8",
);

test("wishlist removal cancellation clears confirmation and its global message", () => {
  const cancelStart = workflowSource.indexOf("const cancelWishlistRemove");
  const requestStart = workflowSource.indexOf("const requestWishlistRemove");
  assert.notEqual(cancelStart, -1);
  assert.notEqual(requestStart, -1);
  const cancelBlock = workflowSource.slice(cancelStart, requestStart);
  assert.match(cancelBlock, /setConfirmWishlistRemoveId\(null\)/);
  assert.match(cancelBlock, /setInfoMessage\(null\)/);

  assert.match(workflowSource, /onCancelWishlistRemove: cancelWishlistRemove/);
  assert.match(workflowSource, /onRequestWishlistRemove: requestWishlistRemove/);
  assert.match(workflowSource, /onWishlistQueryChange: handleWishlistQueryChange/);
});

test("wishlist delete action stays guarded until the matching item is confirmed", () => {
  const handlerStart = actionsSource.indexOf("async function handleDeleteWishlistItem");
  const nextHandlerStart = actionsSource.indexOf("async function handleStockFromWishlist");
  assert.notEqual(handlerStart, -1);
  assert.notEqual(nextHandlerStart, -1);
  const handlerBlock = actionsSource.slice(handlerStart, nextHandlerStart);
  const guardIndex = handlerBlock.indexOf("confirmWishlistRemoveId !== itemId");
  const writeGuardIndex = handlerBlock.indexOf("canStartWrite()");
  const deleteIndex = handlerBlock.indexOf("deleteWishlistEntry");
  assert.ok(guardIndex >= 0 && guardIndex < writeGuardIndex);
  assert.ok(writeGuardIndex < deleteIndex);
  assert.doesNotMatch(handlerBlock, /confirmRemoveTapAgain/);
});
