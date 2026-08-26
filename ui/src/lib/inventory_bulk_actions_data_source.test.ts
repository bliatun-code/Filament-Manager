import assert from "node:assert/strict";
import test from "node:test";

import {
  InventoryBulkMutationRoutingError,
  executeInventoryBulkMutationForInventory,
  type InventoryBulkMutationContext,
} from "./inventory_bulk_actions_data_source";
import type { InventoryBulkMutationCommand } from "./inventory_bulk_actions_model";

const command: InventoryBulkMutationCommand = {
  action: "STATUS",
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
  ],
  target_status: "EMPTY",
};

function context(
  overrides: Partial<InventoryBulkMutationContext> = {},
): InventoryBulkMutationContext {
  return {
    clientHostBaseUrl: "http://host.local",
    clientHostWritePaired: true,
    clientLibraryId: "library-a",
    clientReadOnly: false,
    ...overrides,
  };
}

test("local bulk routing executes one command", async () => {
  const localCommands: InventoryBulkMutationCommand[] = [];
  let hostCalls = 0;
  const result = await executeInventoryBulkMutationForInventory(
    context(),
    command,
    {
      executeLocal: async (input) => {
        localCommands.push(input);
        return { affected_count: 1, committed: true, history_spool_count: 1 };
      },
      executeHost: async () => {
        hostCalls += 1;
        throw new Error("unexpected host call");
      },
    },
  );

  assert.deepEqual(localCommands, [command]);
  assert.equal(hostCalls, 0);
  assert.equal(result.affected_count, 1);
});

test("paired client executes one Host bulk request and never a local fallback", async () => {
  const hostCalls: unknown[][] = [];
  let localCalls = 0;
  const result = await executeInventoryBulkMutationForInventory(
    context({ clientReadOnly: true }),
    command,
    {
      executeLocal: async () => {
        localCalls += 1;
        throw new Error("unexpected local call");
      },
      executeHost: async (...args) => {
        hostCalls.push(args);
        return { affected_count: 1, committed: true, history_spool_count: 1 };
      },
    },
  );

  assert.deepEqual(hostCalls, [["http://host.local", "library-a", command]]);
  assert.equal(localCalls, 0);
  assert.equal(result.committed, true);
});

test("Host rejection propagates without sequential or local retry", async () => {
  let hostCalls = 0;
  let localCalls = 0;
  await assert.rejects(
    executeInventoryBulkMutationForInventory(
      context({ clientReadOnly: true }),
      command,
      {
        executeLocal: async () => {
          localCalls += 1;
          return { affected_count: 1, committed: true, history_spool_count: 1 };
        },
        executeHost: async () => {
          hostCalls += 1;
          throw new Error("Host rejected bulk mutation");
        },
      },
    ),
    /Host rejected bulk mutation/,
  );
  assert.equal(hostCalls, 1);
  assert.equal(localCalls, 0);
});

test("unpaired and missing-target clients fail before any write", async () => {
  for (const [overrides, code] of [
    [{ clientHostWritePaired: false }, "PAIRING_REQUIRED"],
    [{ clientHostBaseUrl: null }, "HOST_TARGET_REQUIRED"],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      executeInventoryBulkMutationForInventory(
        context({ clientReadOnly: true, ...overrides }),
        command,
        {
          executeLocal: async () => {
            calls += 1;
            throw new Error("unexpected local call");
          },
          executeHost: async () => {
            calls += 1;
            throw new Error("unexpected host call");
          },
        },
      ),
      (error: unknown) =>
        error instanceof InventoryBulkMutationRoutingError && error.code === code,
    );
    assert.equal(calls, 0);
  }
});
