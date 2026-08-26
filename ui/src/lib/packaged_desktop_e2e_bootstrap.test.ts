import assert from "node:assert/strict";
import test from "node:test";

import {
  runPackagedDesktopE2eBootstrap,
  startPackagedDesktopE2eBootstrap,
} from "./packaged_desktop_e2e_bootstrap";
import {
  PackagedDesktopE2eScenarioError,
  type PackagedDesktopE2eConfiguration,
} from "./packaged_desktop_e2e_scenario";

const config: PackagedDesktopE2eConfiguration = {
  phase: "mutate",
  run_id: "packaged-e2e-bootstrap-run",
  spool_id: "packaged_e2e_spool",
  printer_id: "packaged_e2e_printer",
  slot_id: "packaged_e2e_printer_ams_1_slot_1",
  initial_weight_g: 1_000,
  updated_weight_g: 875,
  returned_weight_g: 760,
};

test("packaged desktop bootstrap is inert outside Tauri and in normal app launches", async () => {
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
      return { async runPackagedDesktopE2eScenario() {} };
    },
    async fail() {},
    reportBootstrapFailure() {},
  };

  await runPackagedDesktopE2eBootstrap(dependencies);
  assert.equal(configurationCalls, 0);
  assert.equal(scenarioLoads, 0);

  dependencies.isTauri = () => true;
  dependencies.configuration = async () => {
    configurationCalls += 1;
    return null;
  };
  await runPackagedDesktopE2eBootstrap(dependencies);
  assert.equal(configurationCalls, 1);
  assert.equal(scenarioLoads, 0);
});

test("packaged desktop bootstrap lazy-loads only an explicitly configured scenario", async () => {
  const observed: PackagedDesktopE2eConfiguration[] = [];
  await runPackagedDesktopE2eBootstrap({
    isTauri: () => true,
    configuration: async () => config,
    loadScenario: async () => ({
      async runPackagedDesktopE2eScenario(input) {
        observed.push(input);
      },
    }),
    async fail() {
      throw new Error("failure command must not run");
    },
    reportBootstrapFailure() {},
  });
  assert.deepEqual(observed, [config]);
});

test("packaged desktop bootstrap reports a failed scenario through the gated command", async () => {
  const failures: Array<Record<string, unknown>> = [];
  await runPackagedDesktopE2eBootstrap({
    isTauri: () => true,
    configuration: async () => config,
    loadScenario: async () => ({
      async runPackagedDesktopE2eScenario() {
        throw new PackagedDesktopE2eScenarioError(
          "return-spool",
          "returned weight mismatch",
        );
      },
    }),
    async fail(input) {
      failures.push(input);
    },
    reportBootstrapFailure() {},
  });
  assert.deepEqual(failures, [
    {
      phase: config.phase,
      run_id: config.run_id,
      step: "return-spool",
      message: "returned weight mismatch",
    },
  ]);
});

test("packaged desktop starter surfaces invalid gate failures without loading the scenario", async () => {
  const messages: string[] = [];
  let scenarioLoads = 0;
  startPackagedDesktopE2eBootstrap({
    isTauri: () => true,
    configuration: async () => {
      throw new Error("invalid private marker");
    },
    loadScenario: async () => {
      scenarioLoads += 1;
      return { async runPackagedDesktopE2eScenario() {} };
    },
    async fail() {},
    reportBootstrapFailure(message) {
      messages.push(message);
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(scenarioLoads, 0);
  assert.deepEqual(messages, ["invalid private marker"]);
});
