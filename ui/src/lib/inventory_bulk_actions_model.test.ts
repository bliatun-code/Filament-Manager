import assert from "node:assert/strict";
import test from "node:test";

import {
  INVENTORY_BULK_MUTATION_EXECUTION_CONTRACT,
  buildInventoryBulkDataPlan,
  buildInventoryBulkMutationPlan,
  clearInventoryBulkSelection,
  confirmInventoryBulkMutation,
  createInventoryBulkSelection,
  deselectVisibleInventoryBulkSpools,
  inventoryBulkMutationReceiptMatchesPlan,
  inventoryBulkSelectAllState,
  reconcileInventoryBulkSelection,
  resolveInventoryBulkDataPlanRows,
  selectVisibleInventoryBulkSpools,
  toggleInventoryBulkSelection,
  type InventoryBulkMutationPlan,
  type InventoryBulkPlanResult,
  type InventoryBulkSpoolSnapshot,
} from "./inventory_bulk_actions_model";
import type { SpoolStatus } from "./shared_contracts.generated";

function snapshot(
  spoolId: string,
  overrides: Partial<InventoryBulkSpoolSnapshot> = {},
): InventoryBulkSpoolSnapshot {
  return {
    activeLoan: false,
    assignedToPrinter: false,
    homeLocationId: "location-a",
    locationId: "location-a",
    spoolId,
    status: "IN_STOCK",
    ...overrides,
  };
}

function unwrapPlan(
  result: InventoryBulkPlanResult<InventoryBulkMutationPlan>,
): InventoryBulkMutationPlan {
  if (!result.ok) {
    assert.fail(`expected a plan, received ${JSON.stringify(result.issues)}`);
  }
  return result.plan;
}

function issueCodes(
  result: InventoryBulkPlanResult<unknown>,
): string[] {
  if (result.ok) {
    assert.fail("expected validation issues");
  }
  return result.issues.map((issue) => issue.code);
}

test("selection helpers keep a deterministic unique multi-selection across visible filters", () => {
  let selection = createInventoryBulkSelection([" spool-b ", "spool-a", "spool-b", ""]);
  assert.deepEqual(selection.spoolIds, ["spool-b", "spool-a"]);

  selection = toggleInventoryBulkSelection(selection, "spool-c", true);
  selection = toggleInventoryBulkSelection(selection, "spool-a", false);
  assert.deepEqual(selection.spoolIds, ["spool-b", "spool-c"]);

  selection = selectVisibleInventoryBulkSpools(selection, ["spool-a", "spool-d"]);
  assert.deepEqual(selection.spoolIds, ["spool-b", "spool-c", "spool-a", "spool-d"]);
  assert.equal(inventoryBulkSelectAllState(selection, ["spool-a", "spool-d"]), "ALL");
  assert.equal(inventoryBulkSelectAllState(selection, ["spool-a", "spool-e"]), "SOME");
  assert.equal(inventoryBulkSelectAllState(selection, ["spool-e"]), "NONE");

  selection = deselectVisibleInventoryBulkSpools(selection, ["spool-a", "spool-d"]);
  assert.deepEqual(selection.spoolIds, ["spool-b", "spool-c"]);

  const reconciled = reconcileInventoryBulkSelection(selection, ["spool-c", "spool-z"]);
  assert.deepEqual(reconciled.selection.spoolIds, ["spool-c"]);
  assert.deepEqual(reconciled.removedSpoolIds, ["spool-b"]);
  assert.deepEqual(clearInventoryBulkSelection().spoolIds, []);
});

test("MOVE review reports selected, affected, and unchanged counts and freezes every precondition", () => {
  const result = buildInventoryBulkMutationPlan({
    action: "MOVE",
    selectedSpoolIds: ["spool-c", "spool-a", "spool-b"],
    snapshots: [
      snapshot("spool-a", { locationId: "location-a" }),
      snapshot("spool-b", {
        homeLocationId: "location-b",
        locationId: "location-b",
        status: "EMPTY",
      }),
      snapshot("spool-c", {
        homeLocationId: "location-b",
        locationId: "location-b",
        status: "LOST",
      }),
    ],
    targetLocation: { archived: false, id: "location-b", name: "Shelf B" },
  });
  const plan = unwrapPlan(result);

  assert.equal(plan.action, "MOVE");
  assert.equal(plan.selectedCount, 3);
  assert.equal(plan.affectedCount, 1);
  assert.equal(plan.unchangedCount, 2);
  assert.deepEqual(plan.selectedSpoolIds, ["spool-a", "spool-b", "spool-c"]);
  assert.deepEqual(plan.affectedSpoolIds, ["spool-a"]);
  assert.deepEqual(plan.unchangedSpoolIds, ["spool-b", "spool-c"]);
  assert.equal(plan.requiredHistoryEventType, "LOCATION_UPDATED");
  assert.equal(plan.targetLabel, "Shelf B");
  assert.deepEqual(plan.command, {
    action: "MOVE",
    expected_affected_count: 1,
    spools: [
      {
        expected_active_loan: false,
        expected_assigned_to_printer: false,
        expected_home_location_id: "location-a",
        expected_location_id: "location-a",
        expected_status: "IN_STOCK",
        spool_id: "spool-a",
      },
      {
        expected_active_loan: false,
        expected_assigned_to_printer: false,
        expected_home_location_id: "location-b",
        expected_location_id: "location-b",
        expected_status: "EMPTY",
        spool_id: "spool-b",
      },
      {
        expected_active_loan: false,
        expected_assigned_to_printer: false,
        expected_home_location_id: "location-b",
        expected_location_id: "location-b",
        expected_status: "LOST",
        spool_id: "spool-c",
      },
    ],
    target_location_id: "location-b",
  });
});

test("STATUS review only counts real changes and uses the same manual-edit business rules", () => {
  const plan = unwrapPlan(
    buildInventoryBulkMutationPlan({
      action: "STATUS",
      selectedSpoolIds: ["stock", "empty", "lost"],
      snapshots: [
        snapshot("stock", { status: "IN_STOCK" }),
        snapshot("empty", { status: "EMPTY" }),
        snapshot("lost", { status: "LOST" }),
      ],
      targetStatus: " empty ",
    }),
  );

  assert.equal(plan.action, "STATUS");
  assert.equal(plan.selectedCount, 3);
  assert.equal(plan.affectedCount, 2);
  assert.equal(plan.unchangedCount, 1);
  assert.deepEqual(plan.affectedSpoolIds, ["lost", "stock"]);
  assert.deepEqual(plan.unchangedSpoolIds, ["empty"]);
  assert.equal(plan.requiredHistoryEventType, "STATUS_UPDATED");
  assert.equal(plan.command.action, "STATUS");
  if (plan.command.action === "STATUS") {
    assert.equal(plan.command.target_status, "EMPTY");
    assert.equal(plan.command.expected_affected_count, 2);
  }
});

test("manual bulk mutations reject every affected printer-, loan-, and removal-controlled spool", () => {
  const snapshots = [
    snapshot("assigned-status", { status: "ASSIGNED" }),
    snapshot("assigned-slot", { assignedToPrinter: true }),
    snapshot("borrowed-status", { status: "BORROWED" }),
    snapshot("active-loan", { activeLoan: true }),
    snapshot("removed", { status: "DELETED" }),
  ];
  const result = buildInventoryBulkMutationPlan({
    action: "STATUS",
    selectedSpoolIds: snapshots.map((row) => row.spoolId),
    snapshots,
    targetStatus: "EMPTY",
  });

  assert.deepEqual(issueCodes(result), [
    "ACTIVE_LOAN",
    "PRINTER_SLOT_CONTROLLED",
    "REMOVED_SPOOL",
  ]);
  if (!result.ok) {
    assert.deepEqual(result.issues[0]?.spoolIds, ["active-loan", "borrowed-status"]);
    assert.deepEqual(result.issues[1]?.spoolIds, ["assigned-slot", "assigned-status"]);
    assert.deepEqual(result.issues[2]?.spoolIds, ["removed"]);
  }
});

test("MOVE applies the same placement locks to affected rows but permits locked no-ops", () => {
  const changedLocked = buildInventoryBulkMutationPlan({
    action: "MOVE",
    selectedSpoolIds: ["assigned", "borrowed"],
    snapshots: [
      snapshot("assigned", { assignedToPrinter: true, locationId: "location-a" }),
      snapshot("borrowed", { activeLoan: true, locationId: "location-a" }),
    ],
    targetLocation: { archived: false, id: "location-b", name: "Shelf B" },
  });
  assert.deepEqual(issueCodes(changedLocked), [
    "ACTIVE_LOAN",
    "PRINTER_SLOT_CONTROLLED",
  ]);

  const mixed = unwrapPlan(
    buildInventoryBulkMutationPlan({
      action: "MOVE",
      selectedSpoolIds: ["assigned", "stock"],
      snapshots: [
        snapshot("assigned", {
          assignedToPrinter: true,
          homeLocationId: "location-b",
          locationId: "location-b",
        }),
        snapshot("stock", { locationId: "location-a" }),
      ],
      targetLocation: { archived: false, id: "location-b", name: "Shelf B" },
    }),
  );
  assert.deepEqual(mixed.affectedSpoolIds, ["stock"]);
  assert.deepEqual(mixed.unchangedSpoolIds, ["assigned"]);
});

test("MOVE treats a stale home location as affected even when current already matches", () => {
  const plan = unwrapPlan(
    buildInventoryBulkMutationPlan({
      action: "MOVE",
      selectedSpoolIds: ["spool-a"],
      snapshots: [
        snapshot("spool-a", {
          homeLocationId: "location-a",
          locationId: "location-b",
        }),
      ],
      targetLocation: { archived: false, id: "location-b", name: "Shelf B" },
    }),
  );

  assert.equal(plan.affectedCount, 1);
  assert.equal(plan.unchangedCount, 0);
  assert.deepEqual(plan.affectedSpoolIds, ["spool-a"]);
});

test("invalid, stale, duplicate, empty, and no-op requests fail closed without a command", () => {
  const invalidTarget = buildInventoryBulkMutationPlan({
    action: "STATUS",
    selectedSpoolIds: ["spool-a"],
    snapshots: [snapshot("spool-a")],
    targetStatus: "ASSIGNED",
  });
  assert.deepEqual(issueCodes(invalidTarget), ["UNSUPPORTED_STATUS_TARGET"]);

  const archivedLocation = buildInventoryBulkMutationPlan({
    action: "MOVE",
    selectedSpoolIds: ["spool-a"],
    snapshots: [snapshot("spool-a")],
    targetLocation: { archived: true, id: "", name: "Old shelf" },
  });
  assert.ok(issueCodes(archivedLocation).includes("BLANK_LOCATION_ID"));
  assert.ok(issueCodes(archivedLocation).includes("ARCHIVED_LOCATION"));

  const staleDuplicate = buildInventoryBulkMutationPlan({
    action: "STATUS",
    selectedSpoolIds: ["spool-a", "spool-a", "missing"],
    snapshots: [snapshot("spool-a"), snapshot("spool-a")],
    targetStatus: "EMPTY",
  });
  assert.ok(issueCodes(staleDuplicate).includes("DUPLICATE_SPOOL_ID"));
  assert.ok(issueCodes(staleDuplicate).includes("DUPLICATE_SNAPSHOT"));
  assert.ok(issueCodes(staleDuplicate).includes("STALE_SELECTION"));

  const invalidSnapshot = buildInventoryBulkDataPlan({
    action: "EXPORT",
    selectedSpoolIds: ["spool-a"],
    snapshots: [snapshot("spool-a", { status: "SIDEWAYS" as SpoolStatus })],
  });
  assert.deepEqual(issueCodes(invalidSnapshot), ["INVALID_SNAPSHOT_STATUS"]);

  const empty = buildInventoryBulkDataPlan({
    action: "LABELS",
    selectedSpoolIds: [],
    snapshots: [],
  });
  assert.deepEqual(issueCodes(empty), ["EMPTY_SELECTION"]);

  const noChange = buildInventoryBulkMutationPlan({
    action: "STATUS",
    selectedSpoolIds: ["spool-a"],
    snapshots: [snapshot("spool-a", { status: "EMPTY" })],
    targetStatus: "EMPTY",
  });
  assert.deepEqual(issueCodes(noChange), ["NO_CHANGES"]);
});

test("LABELS and EXPORT preserve the exact selected set without status-based filtering", () => {
  const snapshots = [
    snapshot("stock", { status: "IN_STOCK" }),
    snapshot("empty", { status: "EMPTY" }),
    snapshot("lost", { status: "LOST" }),
  ];
  for (const action of ["LABELS", "EXPORT"] as const) {
    const result = buildInventoryBulkDataPlan({
      action,
      selectedSpoolIds: ["lost", "stock", "empty"],
      snapshots,
    });
    if (!result.ok) {
      assert.fail(JSON.stringify(result.issues));
    }
    assert.equal(result.plan.action, action);
    assert.equal(result.plan.selectedCount, 3);
    assert.deepEqual(result.plan.spoolIds, ["empty", "lost", "stock"]);
  }
});

test("data plans resolve exact rows in plan order and fail instead of silently shrinking", () => {
  const result = buildInventoryBulkDataPlan({
    action: "EXPORT",
    selectedSpoolIds: ["spool-b", "spool-a"],
    snapshots: [snapshot("spool-a"), snapshot("spool-b")],
  });
  if (!result.ok) {
    assert.fail(JSON.stringify(result.issues));
  }

  assert.deepEqual(
    resolveInventoryBulkDataPlanRows(result.plan, [
      { id: "spool-b", value: 2 },
      { id: "spool-a", value: 1 },
      { id: "spool-c", value: 3 },
    ]),
    {
      ok: true,
      rows: [
        { id: "spool-a", value: 1 },
        { id: "spool-b", value: 2 },
      ],
    },
  );
  assert.deepEqual(
    resolveInventoryBulkDataPlanRows(result.plan, [{ id: "spool-a" }]),
    { error: "STALE_SELECTION", ok: false, spoolIds: ["spool-b"] },
  );
  assert.deepEqual(
    resolveInventoryBulkDataPlanRows(result.plan, [
      { id: "spool-a" },
      { id: "spool-a" },
      { id: "spool-b" },
    ]),
    { error: "DUPLICATE_ROW", ok: false, spoolIds: ["spool-a"] },
  );
  assert.deepEqual(
    resolveInventoryBulkDataPlanRows(
      { ...result.plan, selectedCount: 1 },
      [{ id: "spool-a" }, { id: "spool-b" }],
    ),
    {
      error: "INVALID_PLAN",
      ok: false,
      spoolIds: ["spool-a", "spool-b"],
    },
  );
});

test("second-step confirmation revalidates the complete frozen review", () => {
  const input = {
    action: "STATUS" as const,
    selectedSpoolIds: ["spool-a", "spool-b"],
    snapshots: [snapshot("spool-a"), snapshot("spool-b")],
    targetStatus: "EMPTY",
  };
  const reviewed = unwrapPlan(buildInventoryBulkMutationPlan(input));
  const unchanged = buildInventoryBulkMutationPlan(input);
  const confirmed = confirmInventoryBulkMutation(reviewed, unchanged);
  assert.equal(confirmed.ok, true);
  if (confirmed.ok) {
    assert.deepEqual(confirmed.command, reviewed.command);
  }

  const changedSnapshot = buildInventoryBulkMutationPlan({
    ...input,
    snapshots: [
      snapshot("spool-a", { homeLocationId: "location-c" }),
      snapshot("spool-b"),
    ],
  });
  assert.deepEqual(confirmInventoryBulkMutation(reviewed, changedSnapshot), {
    error: "STALE_REVIEW",
    ok: false,
  });

  const changedSelection = buildInventoryBulkMutationPlan({
    ...input,
    selectedSpoolIds: ["spool-a"],
  });
  assert.deepEqual(confirmInventoryBulkMutation(reviewed, changedSelection), {
    error: "STALE_REVIEW",
    ok: false,
  });
});

test("success receipts must prove one committed atomic result and history coverage", () => {
  const plan = unwrapPlan(
    buildInventoryBulkMutationPlan({
      action: "STATUS",
      selectedSpoolIds: ["spool-a", "spool-b"],
      snapshots: [snapshot("spool-a"), snapshot("spool-b", { status: "EMPTY" })],
      targetStatus: "EMPTY",
    }),
  );
  assert.deepEqual(INVENTORY_BULK_MUTATION_EXECUTION_CONTRACT, {
    backendTransactionCount: 1,
    historyRequirement: "ACTION_EVENT_PER_AFFECTED_SPOOL",
    partialMutationAllowed: false,
    stalePreconditionPolicy: "ABORT_BEFORE_WRITE",
  });
  assert.equal(
    inventoryBulkMutationReceiptMatchesPlan(plan, {
      affected_count: 1,
      committed: true,
      history_spool_count: 1,
    }),
    true,
  );
  assert.equal(
    inventoryBulkMutationReceiptMatchesPlan(plan, {
      affected_count: 1,
      committed: true,
      history_spool_count: 0,
    }),
    false,
  );
  assert.equal(
    inventoryBulkMutationReceiptMatchesPlan(plan, {
      affected_count: 1,
      committed: false,
      history_spool_count: 1,
    }),
    false,
  );
});
