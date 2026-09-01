import assert from "node:assert/strict";
import test from "node:test";

import {
  runPackagedHostClientE2eBootstrap,
  startPackagedHostClientE2eBootstrap,
} from "./packaged_host_client_e2e_bootstrap";
import { PackagedHostClientE2eScenarioError } from "./packaged_host_client_e2e_scenario";
import type { PackagedHostClientE2eConfiguration } from "./tauri_packaged_host_client_e2e_client";

const config: PackagedHostClientE2eConfiguration = {
  role: "client",
  phase: "cleanup",
  run_id: "packaged-host-client-bootstrap-run",
  listen_port: 42_780,
  library_id: "library-1",
  spool_id: "spool-1",
  host_initial_weight_g: 1_000,
  paired_weight_g: 875,
  recovered_weight_g: 760,
  client_shadow_weight_g: 333,
  base_url: null,
  pairing_url: null,
  target_generation: null,
};

test("packaged Host-Client bootstrap is inert outside Tauri and normal launches", async () => {
  let configurationCalls = 0;
  let scenarioLoads = 0;
  const dependencies = {
    isTauri: () => false,
    async configuration() {
      configurationCalls += 1;
      return config;
    },
    async loadScenario() {
      scenarioLoads += 1;
      return { async runPackagedHostClientE2eScenario() {} };
    },
    async fail() {},
    async failBootstrap() {},
    reportBootstrapFailure() {},
  };

  await runPackagedHostClientE2eBootstrap(dependencies);
  assert.equal(configurationCalls, 0);
  assert.equal(scenarioLoads, 0);

  dependencies.isTauri = () => true;
  dependencies.configuration = async () => {
    configurationCalls += 1;
    return null;
  };
  await runPackagedHostClientE2eBootstrap(dependencies);
  assert.equal(configurationCalls, 1);
  assert.equal(scenarioLoads, 0);
});

test("packaged Host-Client bootstrap reports only safe scenario failures", async () => {
  const failures: Array<Record<string, unknown>> = [];
  await runPackagedHostClientE2eBootstrap({
    isTauri: () => true,
    configuration: async () => config,
    loadScenario: async () => ({
      async runPackagedHostClientE2eScenario() {
        throw new Error("secret pairing URL: http://host.local/pair#token");
      },
    }),
    async fail(input) {
      failures.push(input);
    },
    async failBootstrap() {},
    reportBootstrapFailure() {},
  });
  assert.deepEqual(failures, [
    {
      role: "client",
      phase: "cleanup",
      run_id: config.run_id,
      step: "scenario",
      message: "Packaged Host-Client E2E scenario failed.",
      failure_kind: "scenario",
    },
  ]);

  failures.length = 0;
  await runPackagedHostClientE2eBootstrap({
    isTauri: () => true,
    configuration: async () => config,
    loadScenario: async () => ({
      async runPackagedHostClientE2eScenario() {
        throw new PackagedHostClientE2eScenarioError(
          "clear-client-auth",
          "The Client authentication cleanup failed.",
        );
      },
    }),
    async fail(input) {
      failures.push(input);
    },
    async failBootstrap() {},
    reportBootstrapFailure() {},
  });
  assert.equal(failures[0]?.message, "The Client authentication cleanup failed.");
  assert.equal(failures[0]?.failure_kind, "scenario");

  failures.length = 0;
  await runPackagedHostClientE2eBootstrap({
    isTauri: () => true,
    configuration: async () => ({
      ...config,
      role: "host",
      phase: "generation-1",
    }),
    loadScenario: async () => ({
      async runPackagedHostClientE2eScenario() {
        throw new PackagedHostClientE2eScenarioError(
          "enable-host-runtime",
          "The Host runtime could not bind its private QA port.",
          "port-in-use",
        );
      },
    }),
    async fail(input) {
      failures.push(input);
    },
    async failBootstrap() {},
    reportBootstrapFailure() {},
  });
  assert.equal(failures[0]?.failure_kind, "port-in-use");
});

test("packaged Host-Client starter redacts configuration bootstrap errors", async () => {
  const messages: string[] = [];
  let bootstrapFailures = 0;
  startPackagedHostClientE2eBootstrap({
    isTauri: () => true,
    configuration: async () => {
      throw new Error("private path and token");
    },
    async loadScenario() {
      return { async runPackagedHostClientE2eScenario() {} };
    },
    async fail() {},
    async failBootstrap() {
      bootstrapFailures += 1;
    },
    reportBootstrapFailure(message) {
      messages.push(message);
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(bootstrapFailures, 1);
  assert.deepEqual(messages, []);
});

test("packaged Host-Client starter safely reports a bootstrap-failure write error", async () => {
  const messages: string[] = [];
  startPackagedHostClientE2eBootstrap({
    isTauri: () => true,
    configuration: async () => {
      throw new Error("private path and token");
    },
    async loadScenario() {
      return { async runPackagedHostClientE2eScenario() {} };
    },
    async fail() {},
    async failBootstrap() {
      throw new Error("private command failure");
    },
    reportBootstrapFailure(message) {
      messages.push(message);
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(messages, ["Packaged Host-Client E2E bootstrap failed."]);
});
