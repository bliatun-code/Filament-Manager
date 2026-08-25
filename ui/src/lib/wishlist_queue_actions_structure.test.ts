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
const detailActionsSource = readFileSync(
  new URL("./use_inventory_spool_detail_actions.ts", import.meta.url),
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

  assert.match(workflowSource, /onCancelDeleteItem: cancelWishlistRemove/);
  assert.match(workflowSource, /onRequestDeleteItem: requestWishlistRemove/);
  assert.match(workflowSource, /onQueryChange: handleWishlistQueryChange/);
});

test("purchase entry closes registration UI and reveals the visible queue after creation", () => {
  assert.match(workflowSource, /setEntryPurpose\(options\.purpose \?\? "STOCK"\)/);
  assert.match(workflowSource, /openAddModal\(\{ purpose: "PURCHASE" \}\)/);
  assert.match(workflowSource, /onAddPurchase: openPurchaseModal/);
  assert.match(workflowSource, /onWishlistItemCreated: finishPurchaseEntry/);
  assert.match(
    workflowSource,
    /finishPurchaseEntry[\s\S]*resetWishlistQueue\("WISHLIST"\)[\s\S]*onOpenPurchaseQueue\(\)/,
  );
  assert.match(actionsSource, /await reloadWishlist\(\)[\s\S]*onWishlistItemCreated\(\)/);
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

test("wishlist receipt action forwards optional purchase metadata and reports success", () => {
  const handlerStart = actionsSource.indexOf("async function handleStockFromWishlist");
  assert.notEqual(handlerStart, -1);
  const handlerBlock = actionsSource.slice(handlerStart);
  assert.match(handlerBlock, /purchaseMetadata\?: PurchaseReceiptMetadata/);
  assert.match(handlerBlock, /purchase_metadata: purchaseMetadata/);
  assert.match(handlerBlock, /return true/);
  assert.match(handlerBlock, /catch \(stockError\)[\s\S]*return false/);
  assert.match(handlerBlock, /commandErrorText\([\s\S]*stockError[\s\S]*,[\s\S]*t[\s\S]*\)/);
});

test("purchase receipt and later detail writes both localize structured Host errors", () => {
  const saveStart = detailActionsSource.indexOf(
    "async function handleSaveSpoolCommonDetails",
  );
  const ownershipStart = detailActionsSource.indexOf(
    "async function handleSaveSpoolOwnership",
  );
  assert.ok(saveStart >= 0 && ownershipStart > saveStart);
  const saveBlock = detailActionsSource.slice(saveStart, ownershipStart);

  assert.match(saveBlock, /purchase_metadata: purchaseMetadata\.value/);
  assert.match(
    saveBlock,
    /purchase_price_batch_locked: parsed\.value\.purchasePriceBatchLocked/,
  );
  assert.match(
    saveBlock,
    /catch \(updateError\)[\s\S]*commandErrorText\([\s\S]*updateError[\s\S]*,[\s\S]*t[\s\S]*\)/,
  );
});
