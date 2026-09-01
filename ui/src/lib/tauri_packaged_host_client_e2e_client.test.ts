import assert from "node:assert/strict";
import test from "node:test";

import {
  completePackagedHostClientE2e,
  failPackagedHostClientE2e,
  failPackagedHostClientE2eBootstrap,
  getPackagedHostClientE2eConfiguration,
  hostPackagedHostClientE2eReadyAndWaitForStop,
} from "./tauri_packaged_host_client_e2e_client";

test("packaged Host-Client Tauri client uses only the dedicated gated commands", async () => {
  const previousWindow = globalThis.window;
  const calls: Array<{ command: string; payload?: Record<string, unknown> }> = [];
  globalThis.window = {
    __TAURI__: {
      invoke: async <T>(command: string, payload?: Record<string, unknown>) => {
        calls.push({ command, payload });
        return null as T;
      },
    },
  } as unknown as Window & typeof globalThis;

  const hostInput = {
    role: "host" as const,
    phase: "generation-1" as const,
    run_id: "run-1",
    library_id: "library-1",
    base_url: "http://host.local:4278",
    pairing_url: "http://host.local:4278/pair#opaque",
  };
  const completion = {
    role: "client" as const,
    phase: "cleanup" as const,
    run_id: "run-1",
    auth_cleared: true as const,
  };
  const failure = {
    role: "client" as const,
    phase: "cleanup" as const,
    run_id: "run-1",
    step: "clear-client-auth",
    message: "The Client authentication cleanup failed.",
    failure_kind: "scenario" as const,
  };

  try {
    await getPackagedHostClientE2eConfiguration();
    await hostPackagedHostClientE2eReadyAndWaitForStop(hostInput);
    await completePackagedHostClientE2e(completion);
    await failPackagedHostClientE2e(failure);
    await failPackagedHostClientE2eBootstrap();
  } finally {
    globalThis.window = previousWindow;
  }

  assert.deepEqual(calls, [
    {
      command: "get_packaged_host_client_e2e_configuration",
      payload: undefined,
    },
    {
      command: "host_packaged_host_client_e2e_ready_and_wait_for_stop",
      payload: { input: hostInput },
    },
    {
      command: "complete_packaged_host_client_e2e",
      payload: { input: completion },
    },
    {
      command: "fail_packaged_host_client_e2e",
      payload: { input: failure },
    },
    {
      command: "fail_packaged_host_client_e2e_bootstrap",
      payload: undefined,
    },
  ]);
});
