import assert from "node:assert/strict";
import test from "node:test";

import {
  PackagedHostClientE2eScenarioError,
  runPackagedHostClientE2eScenario,
  type PackagedHostClientE2eCompletion,
  type PackagedHostClientE2eConfiguration,
} from "./packaged_host_client_e2e_scenario";
import type { SpoolWithMasterRow } from "./tauri_inventory_client";
import type { LibrarySyncSettings } from "./tauri_library_sync_client";

type ScenarioDependencies = NonNullable<
  Parameters<typeof runPackagedHostClientE2eScenario>[1]
>;

const baseConfiguration: PackagedHostClientE2eConfiguration = {
  role: "client",
  phase: "pair",
  run_id: "packaged-host-client-run-1",
  listen_port: 42_780,
  library_id: "packaged-library-1",
  spool_id: "packaged-spool-1",
  host_initial_weight_g: 1_000,
  paired_weight_g: 875,
  recovered_weight_g: 760,
  client_shadow_weight_g: 333,
  base_url: "http://127.0.0.1:42780",
  pairing_url: "http://packaged-host.local:42780/pair#opaque-token",
  target_generation: null,
};

function settings(overrides: Partial<LibrarySyncSettings> = {}): LibrarySyncSettings {
  return {
    mode: "STANDALONE",
    device_name: "QA device",
    library_id: "local-library",
    host_base_url: null,
    target_generation: 0,
    host_device_name: null,
    client_auth_paired: false,
    client_auth_paired_at: null,
    client_auth_expires_at: null,
    ...overrides,
  };
}

function spoolRow(weight: number, label = "QA"): SpoolWithMasterRow {
  return {
    spool: {
      id: baseConfiguration.spool_id,
      master_id: `master-${label}`,
      status: "IN_STOCK",
      initial_weight_g: weight,
      current_weight_g: weight,
      remaining_g: weight,
    },
    master: {
      id: `master-${label}`,
      material: "PLA",
      filament_name: label,
      color_name: "QA blue",
      default_weight: weight,
      vendor: "Filament Manager QA",
    },
  };
}

function unusedDependencies(): ScenarioDependencies {
  const unexpected = async () => {
    throw new Error("unexpected dependency call");
  };
  return {
    createManualSpool: unexpected,
    listSpools: unexpected,
    getLibrarySyncSettings: unexpected,
    saveLibrarySyncSettings: unexpected,
    listTrustedLanInterfaces: unexpected,
    updateTrustedLanCompanionConfig: unexpected,
    getTrustedLanCompanionStatus: unexpected,
    createTrustedLanPairing: unexpected,
    pairLibrarySyncHost: unexpected,
    fetchLibrarySyncSpools: unexpected,
    saveLibrarySyncSpoolCache: unexpected,
    fetchCachedLibrarySyncSpools: unexpected,
    updateLibrarySyncHostSpoolWeight: unexpected,
    clearLibrarySyncClientAuth: unexpected,
    hostReadyAndWaitForStop: unexpected,
    complete: unexpected,
    delay: async () => {},
  } as ScenarioDependencies;
}

test("packaged Host generations create once, restart persisted authority, and never expose pairing in completion", async () => {
  const waits: Array<Record<string, unknown>> = [];
  const events: string[] = [];
  let localWeight: number | null = null;
  let currentSettings = settings();
  let runtimeEnabled = false;
  const dependencies: ScenarioDependencies = {
    ...unusedDependencies(),
    async createManualSpool(input) {
      events.push("create-host-spool");
      assert.equal(input.id, baseConfiguration.spool_id);
      localWeight = input.initial_weight_g ?? null;
    },
    async listSpools() {
      return localWeight == null ? [] : [spoolRow(localWeight, "Host")];
    },
    async getLibrarySyncSettings() {
      return currentSettings;
    },
    async saveLibrarySyncSettings(input) {
      events.push("save-host-settings");
      currentSettings = settings({
        ...input,
        target_generation: 0,
        client_auth_paired: false,
      });
      return currentSettings;
    },
    async listTrustedLanInterfaces() {
      return [
        {
          name: "Visual QA",
          address: "127.0.0.1",
          label: "Visual QA (127.0.0.1)",
        },
      ];
    },
    async updateTrustedLanCompanionConfig(input) {
      events.push("enable-host-runtime");
      assert.equal(input.listen_port, baseConfiguration.listen_port);
      runtimeEnabled = true;
      return {
        enabled: true,
        listen_port: baseConfiguration.listen_port,
        running: true,
        shell_reachable: true,
        local_name_running: true,
        base_url: "http://packaged-host.local:42780",
        direct_base_url: baseConfiguration.base_url,
        api_version: "v1",
        auth_mode: "pairing-session",
      };
    },
    async getTrustedLanCompanionStatus() {
      return {
        enabled: runtimeEnabled,
        listen_port: baseConfiguration.listen_port,
        running: runtimeEnabled,
        shell_reachable: runtimeEnabled,
        local_name_running: runtimeEnabled,
        base_url: "http://packaged-host.local:42780",
        direct_base_url: baseConfiguration.base_url,
        api_version: "v1",
        auth_mode: "pairing-session",
      };
    },
    async createTrustedLanPairing() {
      events.push("create-pairing");
      return {
        pairing_url: baseConfiguration.pairing_url as string,
        expires_in_seconds: 300,
      };
    },
    async hostReadyAndWaitForStop(input) {
      events.push(`wait-${input.phase}`);
      waits.push(input);
    },
    async complete() {
      throw new Error("Host must not write a Client completion");
    },
  };

  await runPackagedHostClientE2eScenario(
    { ...baseConfiguration, role: "host", phase: "generation-1" },
    dependencies,
  );
  localWeight = baseConfiguration.paired_weight_g;
  await runPackagedHostClientE2eScenario(
    {
      ...baseConfiguration,
      role: "host",
      phase: "generation-2",
      pairing_url: null,
    },
    dependencies,
  );

  assert.deepEqual(events, [
    "create-host-spool",
    "save-host-settings",
    "enable-host-runtime",
    "create-pairing",
    "wait-generation-1",
    "wait-generation-2",
  ]);
  assert.equal(waits[0]?.pairing_url, baseConfiguration.pairing_url);
  assert.equal(waits[1]?.pairing_url, null);
});

test("packaged Host maps only the structured runtime bind kind to a retryable failure", async () => {
  async function captureFailure(lastErrorKind?: "port-in-use" | null) {
    let localWeight: number | null = null;
    const dependencies: ScenarioDependencies = {
      ...unusedDependencies(),
      async createManualSpool(input) {
        localWeight = input.initial_weight_g ?? null;
      },
      async listSpools() {
        return localWeight == null ? [] : [spoolRow(localWeight, "Host")];
      },
      async getLibrarySyncSettings() {
        return settings();
      },
      async saveLibrarySyncSettings(input) {
        return settings({ ...input, mode: "HOST" });
      },
      async listTrustedLanInterfaces() {
        return [
          {
            name: "Packaged Host-Client E2E",
            address: "127.0.0.1",
            label: "Packaged Host-Client E2E (127.0.0.1)",
          },
        ];
      },
      async updateTrustedLanCompanionConfig() {
        throw new Error(`secret runtime detail ${baseConfiguration.pairing_url}`);
      },
      async getTrustedLanCompanionStatus() {
        return {
          enabled: true,
          listen_port: baseConfiguration.listen_port,
          running: false,
          shell_reachable: false,
          local_name_running: false,
          last_error_kind: lastErrorKind,
          api_version: "v1",
          auth_mode: "pairing-session",
        };
      },
    };
    try {
      await runPackagedHostClientE2eScenario(
        { ...baseConfiguration, role: "host", phase: "generation-1" },
        dependencies,
      );
      assert.fail("Host startup must fail");
    } catch (error) {
      assert.ok(error instanceof PackagedHostClientE2eScenarioError);
      return error;
    }
  }

  const collision = await captureFailure("port-in-use");
  assert.equal(collision.step, "enable-host-runtime");
  assert.equal(collision.failureKind, "port-in-use");
  assert.equal(collision.message, "The Host runtime could not bind its private QA port.");
  assert.doesNotMatch(collision.message, /secret|opaque-token|host\.local/);

  const generic = await captureFailure(null);
  assert.equal(generic.step, "enable-host-runtime");
  assert.equal(generic.failureKind, "scenario");
  assert.equal(generic.message, "The synthetic Host runtime could not be enabled.");
});

test("restarted Host fails immediately when runtime status reports a port collision", async () => {
  let statusReads = 0;
  let delays = 0;
  const dependencies: ScenarioDependencies = {
    ...unusedDependencies(),
    async getLibrarySyncSettings() {
      return settings({
        mode: "HOST",
        library_id: baseConfiguration.library_id,
      });
    },
    async listSpools() {
      return [spoolRow(baseConfiguration.paired_weight_g, "Host")];
    },
    async getTrustedLanCompanionStatus() {
      statusReads += 1;
      return {
        enabled: true,
        listen_port: baseConfiguration.listen_port,
        running: false,
        shell_reachable: false,
        local_name_running: false,
        last_error_kind: "port-in-use",
        api_version: "v1",
        auth_mode: "pairing-session",
      };
    },
    async delay() {
      delays += 1;
    },
  };

  await assert.rejects(
    () =>
      runPackagedHostClientE2eScenario(
        {
          ...baseConfiguration,
          role: "host",
          phase: "generation-2",
          pairing_url: null,
        },
        dependencies,
      ),
    (error: unknown) => {
      assert.ok(error instanceof PackagedHostClientE2eScenarioError);
      assert.equal(error.step, "wait-host-ready");
      assert.equal(error.failureKind, "port-in-use");
      return true;
    },
  );
  assert.equal(statusReads, 1);
  assert.equal(delays, 0);
});

test("packaged Client proves pairing, offline cache without fallback, restart renewal, and cleanup", async () => {
  const completions: PackagedHostClientE2eCompletion[] = [];
  let currentSettings = settings();
  let localWeight: number | null = null;
  let hostWeight = baseConfiguration.host_initial_weight_g;
  let cachedRows: SpoolWithMasterRow[] | null = null;
  let online = true;
  const targetGeneration = 7;
  const dependencies: ScenarioDependencies = {
    ...unusedDependencies(),
    async createManualSpool(input) {
      localWeight = input.initial_weight_g ?? null;
    },
    async listSpools() {
      return localWeight == null ? [] : [spoolRow(localWeight, "Client shadow")];
    },
    async getLibrarySyncSettings() {
      return currentSettings;
    },
    async saveLibrarySyncSettings(input) {
      currentSettings = settings({
        ...input,
        target_generation: targetGeneration,
        client_auth_paired: false,
      });
      return currentSettings;
    },
    async pairLibrarySyncHost(baseUrl, pairingUrl) {
      assert.equal(baseUrl, baseConfiguration.base_url);
      assert.equal(pairingUrl, baseConfiguration.pairing_url);
      currentSettings = {
        ...currentSettings,
        client_auth_paired: true,
        target_generation: targetGeneration,
      };
      return currentSettings;
    },
    async fetchLibrarySyncSpools() {
      if (!online) {
        throw new Error("Host unavailable with private route details");
      }
      return [spoolRow(hostWeight, "Host")];
    },
    async updateLibrarySyncHostSpoolWeight(_baseUrl, _libraryId, spoolId, grams) {
      if (!online) {
        throw new Error("Host unavailable with private route details");
      }
      assert.equal(spoolId, baseConfiguration.spool_id);
      hostWeight = grams;
    },
    async saveLibrarySyncSpoolCache(rows, _baseUrl, _libraryId, generation) {
      assert.equal(generation, targetGeneration);
      cachedRows = structuredClone(rows);
    },
    async fetchCachedLibrarySyncSpools(_baseUrl, _libraryId, generation) {
      assert.equal(generation, targetGeneration);
      return cachedRows == null
        ? null
        : { captured_at: "2026-08-31T12:00:00Z", rows: cachedRows };
    },
    async clearLibrarySyncClientAuth() {
      currentSettings = { ...currentSettings, client_auth_paired: false };
      return currentSettings;
    },
    async complete(input) {
      completions.push(input);
    },
  };

  await runPackagedHostClientE2eScenario(baseConfiguration, dependencies);
  online = false;
  await runPackagedHostClientE2eScenario(
    {
      ...baseConfiguration,
      phase: "offline",
      pairing_url: null,
      target_generation: targetGeneration,
    },
    dependencies,
  );
  online = true;
  await runPackagedHostClientE2eScenario(
    {
      ...baseConfiguration,
      phase: "recover",
      pairing_url: null,
      target_generation: targetGeneration,
    },
    dependencies,
  );

  assert.deepEqual(completions, [
    {
      role: "client",
      phase: "pair",
      run_id: baseConfiguration.run_id,
      library_id: baseConfiguration.library_id,
      spool_id: baseConfiguration.spool_id,
      local_weight_g: 333,
      host_weight_g: 875,
      cache_weight_g: 875,
      target_generation: 7,
      live_read_failed: false,
      live_write_failed: false,
      paired_before_cleanup: true,
      auth_cleared: false,
      session_renewed: false,
    },
    {
      role: "client",
      phase: "offline",
      run_id: baseConfiguration.run_id,
      library_id: baseConfiguration.library_id,
      spool_id: baseConfiguration.spool_id,
      local_weight_g: 333,
      host_weight_g: null,
      cache_weight_g: 875,
      target_generation: 7,
      live_read_failed: true,
      live_write_failed: true,
      paired_before_cleanup: true,
      auth_cleared: false,
      session_renewed: false,
    },
    {
      role: "client",
      phase: "recover",
      run_id: baseConfiguration.run_id,
      library_id: baseConfiguration.library_id,
      spool_id: baseConfiguration.spool_id,
      local_weight_g: 333,
      host_weight_g: 760,
      cache_weight_g: 760,
      target_generation: 7,
      live_read_failed: false,
      live_write_failed: false,
      paired_before_cleanup: true,
      auth_cleared: true,
      session_renewed: true,
    },
  ]);
  assert.equal(localWeight, 333);
  assert.equal(hostWeight, 760);
  assert.equal(currentSettings.client_auth_paired, false);
});

test("packaged Client cleanup is Host-independent and verifies unpaired state", async () => {
  const completions: PackagedHostClientE2eCompletion[] = [];
  let currentSettings = settings({
    mode: "CLIENT",
    library_id: baseConfiguration.library_id,
    host_base_url: baseConfiguration.base_url,
    target_generation: 7,
    client_auth_paired: true,
  });
  const dependencies: ScenarioDependencies = {
    ...unusedDependencies(),
    async clearLibrarySyncClientAuth() {
      currentSettings = { ...currentSettings, client_auth_paired: false };
      return currentSettings;
    },
    async getLibrarySyncSettings() {
      return currentSettings;
    },
    async complete(input) {
      completions.push(input);
    },
  };

  await runPackagedHostClientE2eScenario(
    {
      ...baseConfiguration,
      phase: "cleanup",
      base_url: null,
      pairing_url: null,
      target_generation: null,
    },
    dependencies,
  );
  assert.deepEqual(completions, [
    {
      role: "client",
      phase: "cleanup",
      run_id: baseConfiguration.run_id,
      auth_cleared: true,
    },
  ]);
});

test("packaged Host-Client scenario replaces dependency errors with safe step messages", async () => {
  const dependencies: ScenarioDependencies = {
    ...unusedDependencies(),
    async createManualSpool() {
      throw new Error(`secret invitation ${baseConfiguration.pairing_url}`);
    },
  };

  await assert.rejects(
    () => runPackagedHostClientE2eScenario(baseConfiguration, dependencies),
    (error: unknown) => {
      assert.ok(error instanceof PackagedHostClientE2eScenarioError);
      assert.equal(error.step, "create-client-shadow");
      assert.equal(error.message, "The Client shadow spool could not be created.");
      assert.doesNotMatch(error.message, /opaque-token|host\.local/);
      return true;
    },
  );
});
