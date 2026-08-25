import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardActionItems,
  dashboardPurchaseCandidateKey,
  findOpenPurchaseDuplicate,
} from "./dashboard_action_model";
import { normalizeLoanDetailsRow } from "./loan_row_normalization";
import { normalizeSpoolWithMasterRows } from "./spool_row_normalization";
import type {
  SpoolLoanDetailsRow,
  SpoolWithMasterRow,
  WishlistItemRow,
} from "./tauri_client";

function spool(
  id: string,
  overrides: {
    masterId?: string;
    remainingG?: number;
    thresholdG?: number;
  } = {},
): SpoolWithMasterRow {
  const masterId = overrides.masterId ?? "master-basic-gray";
  return {
    low_stock_threshold_g: overrides.thresholdG ?? 200,
    master: {
      color_name: masterId.includes("black") ? "Black" : "Gray",
      default_weight: 1_000,
      filament_name: "Basic",
      hex_color: masterId.includes("black") ? "#000000" : "#808080",
      id: masterId,
      material: "PLA",
      product_url: null,
      vendor: "Bambu Lab",
    },
    spool: {
      current_weight_g: overrides.remainingG ?? 150,
      id,
      initial_weight_g: 1_000,
      master_id: masterId,
      ownership_type: "OWNED",
      remaining_g: overrides.remainingG ?? 150,
      status: "IN_STOCK",
    },
  };
}

function loan(
  id: string,
  expectedReturnAt: string,
  overrides: Partial<SpoolLoanDetailsRow["loan"]> = {},
): SpoolLoanDetailsRow {
  return {
    color_name: "Gray",
    filament_name: "Basic",
    loan: {
      borrower_name: "Ada",
      consumed_grams: null,
      counterparty_contact: "ada@example.test",
      counterparty_name: "Ada Lovelace",
      counterparty_note: null,
      expected_return_at: expectedReturnAt,
      grams_out: 600,
      id,
      lent_at: "2026-08-01 10:00:00",
      lent_note: null,
      loan_direction: "OUTBOUND",
      loan_status: "ACTIVE",
      return_note: null,
      returned_at: null,
      returned_grams: null,
      spool_id: `spool-${id}`,
      ...overrides,
    },
    material: "PLA",
    spool_remaining_g: 600,
    spool_status: "BORROWED",
    vendor: "Bambu Lab",
  };
}

function wishlist(
  id: string,
  overrides: Partial<WishlistItemRow> = {},
): WishlistItemRow {
  return {
    color_name: "Gray",
    created_at: "2026-08-10 12:00:00",
    filament_name: "Basic",
    id,
    master_id: "master-basic-gray",
    material: "PLA",
    note: null,
    quantity: 1,
    status: "WISHLIST",
    updated_at: "2026-08-18 12:00:00",
    vendor: "Bambu Lab",
    ...overrides,
  };
}

test("dashboard actions group unresolved low stock by master", () => {
  const actions = buildDashboardActionItems({
    bambuLiveAttention: [],
    loans: [],
    now: new Date("2026-08-21T12:00:00.000Z"),
    spoolRows: normalizeSpoolWithMasterRows([
      spool("spool-b", { remainingG: 120 }),
      spool("spool-a", { remainingG: 80 }),
      spool("healthy", { remainingG: 500 }),
    ]),
    today: "2026-08-21",
    wishlist: [wishlist("wish-received", { status: "RECEIVED" })],
  });

  assert.equal(actions.length, 1);
  const lowStock = actions.find((item) => item.kind === "LOW_STOCK");
  assert.ok(lowStock && lowStock.kind === "LOW_STOCK");
  assert.deepEqual(lowStock.spoolIds, ["spool-a", "spool-b"]);
  assert.equal(lowStock.spoolCount, 2);
  assert.equal(lowStock.lowestRemainingG, 80);
  assert.equal(lowStock.thresholdG, 200);
  assert.deepEqual(lowStock.age, {
    basis: "DETECTED_NOW",
    elapsedDays: null,
    value: null,
  });
  assert.equal(lowStock.duplicate, null);
});

test("low-stock product identity stays stable across weight and spool membership changes", () => {
  const buildLowStock = (rows: SpoolWithMasterRow[]) => {
    const action = buildDashboardActionItems({
      bambuLiveAttention: [],
      loans: [],
      now: new Date("2026-08-21T12:00:00.000Z"),
      spoolRows: normalizeSpoolWithMasterRows(rows),
      today: "2026-08-21",
      wishlist: [],
    }).find((item) => item.kind === "LOW_STOCK");
    assert.ok(action && action.kind === "LOW_STOCK");
    return action;
  };

  const before = buildLowStock([
    spool("spool-a", { remainingG: 80 }),
    spool("spool-b", { remainingG: 120 }),
  ]);
  const after = buildLowStock([
    spool("spool-c", { remainingG: 40 }),
  ]);

  assert.equal(after.candidate.productKey, before.candidate.productKey);
  assert.equal(after.id, before.id);
  assert.notDeepEqual(after.spoolIds, before.spoolIds);
  assert.notEqual(after.lowestRemainingG, before.lowestRemainingG);
});

test("an open purchase mitigates low stock and ON_ORDER produces only its receive action", () => {
  const spoolRows = normalizeSpoolWithMasterRows([
    spool("spool-low", { remainingG: 80 }),
  ]);
  const common = {
    bambuLiveAttention: [],
    loans: [],
    now: new Date("2026-08-21T12:00:00.000Z"),
    spoolRows,
    today: "2026-08-21",
  };

  assert.deepEqual(
    buildDashboardActionItems({
      ...common,
      wishlist: [wishlist("wish-open", { status: "WISHLIST" })],
    }),
    [],
  );
  const ordered = buildDashboardActionItems({
    ...common,
    wishlist: [wishlist("wish-order", { status: "ON_ORDER" })],
  });
  assert.deepEqual(ordered.map((item) => item.kind), ["ON_ORDER"]);
  assert.equal(ordered[0]?.id, "on-order:wish-order");
});

test("purchase duplicate resolution prefers master id, then normalized product identity", () => {
  const candidate = {
    colorName: " Space   Gray ",
    filamentName: " Basic ",
    masterId: "master-current",
    material: " pla ",
    productKey: "unused",
    vendor: " Bambu   Lab ",
  };
  const identityRow = wishlist("identity", {
    color_name: "space gray",
    filament_name: "BASIC",
    master_id: "different-master",
    material: "PLA",
    status: "ON_ORDER",
    vendor: "bambu lab",
  });
  const masterRow = wishlist("master", {
    color_name: "Different",
    master_id: "master-current",
    status: "WISHLIST",
  });

  assert.deepEqual(
    findOpenPurchaseDuplicate(candidate, [identityRow, masterRow]),
    { itemId: "master", match: "MASTER_ID", status: "WISHLIST" },
  );
  assert.deepEqual(findOpenPurchaseDuplicate(candidate, [identityRow]), {
    itemId: "identity",
    match: "IDENTITY",
    status: "ON_ORDER",
  });
  assert.equal(
    findOpenPurchaseDuplicate(candidate, [
      { ...identityRow, status: "RECEIVED" },
    ]),
    null,
  );
  assert.equal(
    dashboardPurchaseCandidateKey({ ...candidate, masterId: null }),
    "product:BAMBU LAB\u001fPLA\u001fBASIC\u001fSPACE GRAY",
  );
});

test("dashboard actions use calendar due dates, real order timestamps, and honest fallbacks", () => {
  const actions = buildDashboardActionItems({
    bambuLiveAttention: [
      {
        printerId: "printer-1",
        printerName: "Workshop X1C",
        trustState: "CHANGED",
      },
    ],
    loans: [
      normalizeLoanDetailsRow(loan("overdue", "2026-08-18")),
      normalizeLoanDetailsRow(loan("today", "2026-08-21")),
      normalizeLoanDetailsRow(
        loan("returned", "2026-08-01", {
          loan_status: "RETURNED",
          returned_at: "2026-08-15 10:00:00",
        }),
      ),
    ],
    now: new Date("2026-08-21T12:00:00.000Z"),
    spoolRows: [],
    today: "2026-08-21",
    wishlist: [
      wishlist("ordered-valid", {
        status: "ON_ORDER",
        updated_at: "2026-08-18 12:00:00",
      }),
      wishlist("ordered-created", {
        created_at: "2026-08-19 12:00:00",
        master_id: "master-black",
        status: "ON_ORDER",
        updated_at: "invalid",
      }),
      wishlist("ordered-unknown", {
        created_at: "invalid",
        master_id: "master-blue",
        status: "ON_ORDER",
        updated_at: "invalid",
      }),
    ],
  });

  assert.deepEqual(
    actions.map((item) => item.kind),
    ["OVERDUE_LOAN", "ON_ORDER", "ON_ORDER", "ON_ORDER", "BAMBU_TRUST"],
  );
  const overdue = actions[0];
  assert.ok(overdue && overdue.kind === "OVERDUE_LOAN");
  assert.deepEqual(overdue.age, {
    basis: "EXPECTED_RETURN_AT",
    elapsedDays: 3,
    value: "2026-08-18",
  });
  assert.equal(overdue.borrowerName, "Ada Lovelace");

  const validOrder = actions.find(
    (item) => item.kind === "ON_ORDER" && item.itemId === "ordered-valid",
  );
  assert.deepEqual(validOrder?.age, {
    basis: "UPDATED_AT",
    elapsedDays: 3,
    value: "2026-08-18 12:00:00",
  });
  const createdOrder = actions.find(
    (item) => item.kind === "ON_ORDER" && item.itemId === "ordered-created",
  );
  assert.deepEqual(createdOrder?.age, {
    basis: "CREATED_AT",
    elapsedDays: 2,
    value: "2026-08-19 12:00:00",
  });
  const unknownOrder = actions.find(
    (item) => item.kind === "ON_ORDER" && item.itemId === "ordered-unknown",
  );
  assert.deepEqual(unknownOrder?.age, {
    basis: "DETECTED_NOW",
    elapsedDays: null,
    value: null,
  });
  assert.deepEqual(actions.at(-1)?.age, {
    basis: "DETECTED_NOW",
    elapsedDays: null,
    value: null,
  });
});
