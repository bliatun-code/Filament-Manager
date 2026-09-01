import {
  createTrustedLanPairing,
  fetchCachedLibrarySyncSpools,
  fetchLibrarySyncSpools,
  getLibrarySyncSettings,
  getTrustedLanCompanionStatus,
  listTrustedLanInterfaces,
  pairLibrarySyncHost,
  clearLibrarySyncClientAuth,
  saveLibrarySyncSettings,
  saveLibrarySyncSpoolCache,
  updateTrustedLanCompanionConfig,
  type LibrarySyncSettings,
  type TrustedLanCompanionStatus,
} from "./tauri_library_sync_client";
import {
  createManualSpool,
  listSpools,
  updateLibrarySyncHostSpoolWeight,
  type SpoolWithMasterRow,
} from "./tauri_inventory_client";
import {
  completePackagedHostClientE2e,
  hostPackagedHostClientE2eReadyAndWaitForStop,
  type PackagedHostClientE2eCompletion,
  type PackagedHostClientE2eConfiguration,
  type PackagedHostClientE2eHostWaitInput,
} from "./tauri_packaged_host_client_e2e_client";

export type {
  PackagedHostClientE2eClientCompletion,
  PackagedHostClientE2eCompletion,
  PackagedHostClientE2eConfiguration,
} from "./tauri_packaged_host_client_e2e_client";

type ScenarioDependencies = {
  createManualSpool: typeof createManualSpool;
  listSpools: typeof listSpools;
  getLibrarySyncSettings: typeof getLibrarySyncSettings;
  saveLibrarySyncSettings: typeof saveLibrarySyncSettings;
  listTrustedLanInterfaces: typeof listTrustedLanInterfaces;
  updateTrustedLanCompanionConfig: typeof updateTrustedLanCompanionConfig;
  getTrustedLanCompanionStatus: typeof getTrustedLanCompanionStatus;
  createTrustedLanPairing: typeof createTrustedLanPairing;
  pairLibrarySyncHost: typeof pairLibrarySyncHost;
  fetchLibrarySyncSpools: typeof fetchLibrarySyncSpools;
  saveLibrarySyncSpoolCache: typeof saveLibrarySyncSpoolCache;
  fetchCachedLibrarySyncSpools: typeof fetchCachedLibrarySyncSpools;
  updateLibrarySyncHostSpoolWeight: typeof updateLibrarySyncHostSpoolWeight;
  clearLibrarySyncClientAuth: typeof clearLibrarySyncClientAuth;
  hostReadyAndWaitForStop: (
    input: PackagedHostClientE2eHostWaitInput,
  ) => Promise<void>;
  complete: (input: PackagedHostClientE2eCompletion) => Promise<void>;
  delay: (milliseconds: number) => Promise<void>;
};

const HOST_READY_ATTEMPTS = 200;
const HOST_READY_DELAY_MS = 100;

const defaultDependencies: ScenarioDependencies = {
  createManualSpool,
  listSpools,
  getLibrarySyncSettings,
  saveLibrarySyncSettings,
  listTrustedLanInterfaces,
  updateTrustedLanCompanionConfig,
  getTrustedLanCompanionStatus,
  createTrustedLanPairing,
  pairLibrarySyncHost,
  fetchLibrarySyncSpools,
  saveLibrarySyncSpoolCache,
  fetchCachedLibrarySyncSpools,
  updateLibrarySyncHostSpoolWeight,
  clearLibrarySyncClientAuth,
  hostReadyAndWaitForStop: hostPackagedHostClientE2eReadyAndWaitForStop,
  complete: completePackagedHostClientE2e,
  delay: (milliseconds) =>
    new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
};

export class PackagedHostClientE2eScenarioError extends Error {
  readonly step: string;
  readonly failureKind: "scenario" | "port-in-use";

  constructor(
    step: string,
    message: string,
    failureKind: "scenario" | "port-in-use" = "scenario",
  ) {
    super(message);
    this.name = "PackagedHostClientE2eScenarioError";
    this.step = step;
    this.failureKind = failureKind;
  }
}

function scenarioFailure(
  step: string,
  message: string,
  failureKind: "scenario" | "port-in-use" = "scenario",
): never {
  throw new PackagedHostClientE2eScenarioError(step, message, failureKind);
}

async function safeStep<T>(
  step: string,
  safeMessage: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PackagedHostClientE2eScenarioError) {
      throw error;
    }
    scenarioFailure(step, safeMessage);
  }
}

function requireNonEmpty(value: string | null | undefined, step: string, message: string) {
  const normalized = value?.trim();
  if (!normalized) {
    scenarioFailure(step, message);
  }
  return normalized;
}

function requirePositiveInteger(
  value: number | null | undefined,
  step: string,
  message: string,
) {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    scenarioFailure(step, message);
  }
  return value as number;
}

function spoolWeight(row: SpoolWithMasterRow | undefined) {
  return row?.spool.remaining_g ?? row?.spool.current_weight_g ?? null;
}

function findQaSpool(
  rows: SpoolWithMasterRow[],
  spoolId: string,
  step: string,
  message: string,
) {
  const matches = rows.filter(({ spool }) => spool.id === spoolId);
  if (matches.length !== 1) {
    scenarioFailure(step, message);
  }
  return matches[0] as SpoolWithMasterRow;
}

function expectWeight(
  row: SpoolWithMasterRow | undefined,
  expected: number,
  step: string,
  message: string,
) {
  if (spoolWeight(row) !== expected) {
    scenarioFailure(step, message);
  }
  return expected;
}

async function readLocalWeight(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
  expected: number,
  step: string,
) {
  const rows = await safeStep(
    step,
    "The local QA spool could not be read.",
    () => dependencies.listSpools(1_000, 0),
  );
  const row = findQaSpool(
    rows,
    config.spool_id,
    step,
    "The local QA spool identity is invalid.",
  );
  return expectWeight(row, expected, step, "The local QA spool weight is invalid.");
}

async function readHostRows(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
  baseUrl: string,
  step: string,
) {
  return safeStep(step, "The Host inventory request failed.", () =>
    dependencies.fetchLibrarySyncSpools(baseUrl, config.library_id, 1_000, 0),
  );
}

function readExactHostWeight(
  rows: SpoolWithMasterRow[],
  config: PackagedHostClientE2eConfiguration,
  expected: number,
  step: string,
) {
  const row = findQaSpool(
    rows,
    config.spool_id,
    step,
    "The Host QA spool identity is invalid.",
  );
  return expectWeight(row, expected, step, "The Host QA spool weight is invalid.");
}

async function readCachedWeight(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
  baseUrl: string,
  targetGeneration: number,
  expected: number,
  step: string,
) {
  const cached = await safeStep(
    step,
    "The target-bound Client cache could not be read.",
    () =>
      dependencies.fetchCachedLibrarySyncSpools(
        baseUrl,
        config.library_id,
        targetGeneration,
      ),
  );
  if (!cached) {
    scenarioFailure(step, "The target-bound Client cache is missing.");
  }
  const row = findQaSpool(
    cached.rows,
    config.spool_id,
    step,
    "The cached QA spool identity is invalid.",
  );
  return expectWeight(row, expected, step, "The cached QA spool weight is invalid.");
}

function expectSettingsTarget(
  settings: LibrarySyncSettings,
  config: PackagedHostClientE2eConfiguration,
  baseUrl: string,
  paired: boolean,
  step: string,
) {
  if (
    settings.mode !== "CLIENT" ||
    settings.library_id !== config.library_id ||
    settings.host_base_url !== baseUrl ||
    settings.client_auth_paired !== paired
  ) {
    scenarioFailure(step, "The Client target state is invalid.");
  }
  return requirePositiveInteger(
    settings.target_generation,
    step,
    "The Client target generation is invalid.",
  );
}

function expectConfiguredTargetGeneration(
  settings: LibrarySyncSettings,
  config: PackagedHostClientE2eConfiguration,
  baseUrl: string,
  paired: boolean,
  step: string,
) {
  const expected = requirePositiveInteger(
    config.target_generation,
    "configuration",
    "The configured Client target generation is invalid.",
  );
  const actual = expectSettingsTarget(settings, config, baseUrl, paired, step);
  if (actual !== expected) {
    scenarioFailure(step, "The persisted Client target generation changed.");
  }
  return expected;
}

async function waitForHostReady(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
  expectedBaseUrl: string,
) {
  for (let attempt = 0; attempt < HOST_READY_ATTEMPTS; attempt += 1) {
    const latest: TrustedLanCompanionStatus = await safeStep(
      "wait-host-ready",
      "The Host runtime status could not be read.",
      dependencies.getTrustedLanCompanionStatus,
    );
    if (latest.last_error_kind === "port-in-use") {
      scenarioFailure(
        "wait-host-ready",
        "The Host runtime could not bind its private QA port.",
        "port-in-use",
      );
    }
    if (
      latest.enabled &&
      latest.running &&
      latest.shell_reachable &&
      latest.listen_port === config.listen_port &&
      latest.direct_base_url === expectedBaseUrl
    ) {
      return latest;
    }
    await dependencies.delay(HOST_READY_DELAY_MS);
  }
  scenarioFailure("wait-host-ready", "The Host runtime did not become ready.");
}

async function enableHostRuntime(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
  interfaceName: string,
  interfaceAddress: string,
) {
  try {
    await dependencies.updateTrustedLanCompanionConfig({
      enabled: true,
      selected_interface_name: interfaceName,
      selected_interface_address: interfaceAddress,
      listen_port: config.listen_port,
    });
  } catch {
    let failureKind: "scenario" | "port-in-use" = "scenario";
    try {
      const latest = await dependencies.getTrustedLanCompanionStatus();
      if (latest.last_error_kind === "port-in-use") {
        failureKind = "port-in-use";
      }
    } catch {
      // The outer result remains a static, secret-free scenario failure.
    }
    scenarioFailure(
      "enable-host-runtime",
      failureKind === "port-in-use"
        ? "The Host runtime could not bind its private QA port."
        : "The synthetic Host runtime could not be enabled.",
      failureKind,
    );
  }
}

function createQaSpoolInput(
  config: PackagedHostClientE2eConfiguration,
  weight: number,
  role: "Host" | "Client shadow",
) {
  return {
    id: config.spool_id,
    material: "PLA",
    filament_name: `Packaged Host-Client E2E ${role}`,
    color_name: "QA blue",
    hex_color: "#1A73E8",
    product_url: null,
    vendor: "Filament Manager QA",
    default_weight_g: weight,
    qr_code: null,
    status: "IN_STOCK",
    ownership_type: "OWNED",
    owner_name: null,
    owner_contact: null,
    ownership_note: "Isolated packaged Host-Client E2E fixture",
    initial_weight_g: weight,
    location: null,
  };
}

async function runHostGenerationOne(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
) {
  const baseUrl = requireNonEmpty(
    config.base_url,
    "configuration",
    "The Host base URL is missing.",
  );
  await safeStep("create-host-spool", "The Host QA spool could not be created.", () =>
    dependencies.createManualSpool(
      createQaSpoolInput(config, config.host_initial_weight_g, "Host"),
    ),
  );
  await readLocalWeight(
    config,
    dependencies,
    config.host_initial_weight_g,
    "verify-host-spool",
  );

  const current = await safeStep(
    "read-host-settings",
    "The Host library settings could not be read.",
    dependencies.getLibrarySyncSettings,
  );
  const saved = await safeStep(
    "save-host-settings",
    "The Host library settings could not be saved.",
    () =>
      dependencies.saveLibrarySyncSettings({
        ...current,
        mode: "HOST",
        device_name: "Packaged Host-Client E2E Host",
        library_id: config.library_id,
        host_base_url: null,
        host_device_name: null,
      }),
  );
  if (
    saved.mode !== "HOST" ||
    saved.library_id !== config.library_id ||
    saved.host_base_url != null
  ) {
    scenarioFailure("save-host-settings", "The Host authority state is invalid.");
  }

  const interfaces = await safeStep(
    "find-host-loopback",
    "The synthetic Host interface could not be read.",
    dependencies.listTrustedLanInterfaces,
  );
  const loopback = interfaces.find((candidate) => candidate.address === "127.0.0.1");
  if (!loopback) {
    scenarioFailure("find-host-loopback", "The synthetic Host interface is missing.");
  }
  await enableHostRuntime(config, dependencies, loopback.name, loopback.address);
  await waitForHostReady(config, dependencies, baseUrl);

  const pairing = await safeStep(
    "create-host-pairing",
    "The Host pairing invitation could not be created.",
    () => dependencies.createTrustedLanPairing("Packaged Host-Client E2E Client"),
  );
  const pairingUrl = requireNonEmpty(
    pairing.pairing_url,
    "create-host-pairing",
    "The Host pairing invitation is invalid.",
  );
  await safeStep(
    "host-ready-and-wait",
    "The Host coordination command failed.",
    () =>
      dependencies.hostReadyAndWaitForStop({
        role: "host",
        phase: "generation-1",
        run_id: config.run_id,
        library_id: config.library_id,
        base_url: baseUrl,
        pairing_url: pairingUrl,
      }),
  );
}

async function runHostGenerationTwo(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
) {
  const baseUrl = requireNonEmpty(
    config.base_url,
    "configuration",
    "The Host base URL is missing.",
  );
  const settings = await safeStep(
    "read-restarted-host-settings",
    "The restarted Host settings could not be read.",
    dependencies.getLibrarySyncSettings,
  );
  if (
    settings.mode !== "HOST" ||
    settings.library_id !== config.library_id ||
    settings.host_base_url != null
  ) {
    scenarioFailure(
      "read-restarted-host-settings",
      "The restarted Host authority state is invalid.",
    );
  }
  await readLocalWeight(
    config,
    dependencies,
    config.paired_weight_g,
    "verify-restarted-host-spool",
  );
  await waitForHostReady(config, dependencies, baseUrl);
  await safeStep(
    "host-ready-and-wait",
    "The restarted Host coordination command failed.",
    () =>
      dependencies.hostReadyAndWaitForStop({
        role: "host",
        phase: "generation-2",
        run_id: config.run_id,
        library_id: config.library_id,
        base_url: baseUrl,
        pairing_url: null,
      }),
  );
}

async function runClientPair(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
) {
  const baseUrl = requireNonEmpty(
    config.base_url,
    "configuration",
    "The Client Host target is missing.",
  );
  const pairingUrl = requireNonEmpty(
    config.pairing_url,
    "configuration",
    "The Client pairing invitation is missing.",
  );
  await safeStep(
    "create-client-shadow",
    "The Client shadow spool could not be created.",
    () =>
      dependencies.createManualSpool(
        createQaSpoolInput(config, config.client_shadow_weight_g, "Client shadow"),
      ),
  );
  await readLocalWeight(
    config,
    dependencies,
    config.client_shadow_weight_g,
    "verify-client-shadow",
  );

  const current = await safeStep(
    "read-client-settings",
    "The Client library settings could not be read.",
    dependencies.getLibrarySyncSettings,
  );
  const saved = await safeStep(
    "save-client-target",
    "The Client target could not be saved.",
    () =>
      dependencies.saveLibrarySyncSettings({
        ...current,
        mode: "CLIENT",
        device_name: "Packaged Host-Client E2E Client",
        library_id: config.library_id,
        host_base_url: baseUrl,
        host_device_name: null,
      }),
  );
  expectSettingsTarget(saved, config, baseUrl, false, "save-client-target");

  const paired = await safeStep(
    "pair-client",
    "The Client could not pair with the Host.",
    () => dependencies.pairLibrarySyncHost(baseUrl, pairingUrl),
  );
  const targetGeneration = expectSettingsTarget(
    paired,
    config,
    baseUrl,
    true,
    "pair-client",
  );
  await safeStep("write-host-weight", "The Client Host write failed.", () =>
    dependencies.updateLibrarySyncHostSpoolWeight(
      baseUrl,
      config.library_id,
      config.spool_id,
      config.paired_weight_g,
    ),
  );
  const hostRows = await readHostRows(
    config,
    dependencies,
    baseUrl,
    "read-paired-host",
  );
  const hostWeight = readExactHostWeight(
    hostRows,
    config,
    config.paired_weight_g,
    "read-paired-host",
  );
  await safeStep("save-paired-cache", "The paired Client cache could not be saved.", () =>
    dependencies.saveLibrarySyncSpoolCache(
      hostRows,
      baseUrl,
      config.library_id,
      targetGeneration,
    ),
  );
  const cacheWeight = await readCachedWeight(
    config,
    dependencies,
    baseUrl,
    targetGeneration,
    config.paired_weight_g,
    "read-paired-cache",
  );
  const localWeight = await readLocalWeight(
    config,
    dependencies,
    config.client_shadow_weight_g,
    "verify-paired-client-shadow",
  );

  await dependencies.complete({
    role: "client",
    phase: "pair",
    run_id: config.run_id,
    library_id: config.library_id,
    spool_id: config.spool_id,
    local_weight_g: localWeight,
    host_weight_g: hostWeight,
    cache_weight_g: cacheWeight,
    target_generation: targetGeneration,
    live_read_failed: false,
    live_write_failed: false,
    paired_before_cleanup: true,
    auth_cleared: false,
    session_renewed: false,
  });
}

async function runClientOffline(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
) {
  const baseUrl = requireNonEmpty(
    config.base_url,
    "configuration",
    "The Client Host target is missing.",
  );
  const settings = await safeStep(
    "read-offline-client-settings",
    "The offline Client settings could not be read.",
    dependencies.getLibrarySyncSettings,
  );
  const targetGeneration = expectConfiguredTargetGeneration(
    settings,
    config,
    baseUrl,
    true,
    "read-offline-client-settings",
  );

  let liveReadFailed = false;
  try {
    await dependencies.fetchLibrarySyncSpools(baseUrl, config.library_id, 1_000, 0);
  } catch {
    liveReadFailed = true;
  }
  if (!liveReadFailed) {
    scenarioFailure("reject-offline-read", "The offline live read unexpectedly succeeded.");
  }

  let liveWriteFailed = false;
  try {
    await dependencies.updateLibrarySyncHostSpoolWeight(
      baseUrl,
      config.library_id,
      config.spool_id,
      config.recovered_weight_g,
    );
  } catch {
    liveWriteFailed = true;
  }
  if (!liveWriteFailed) {
    scenarioFailure("reject-offline-write", "The offline live write unexpectedly succeeded.");
  }

  const cacheWeight = await readCachedWeight(
    config,
    dependencies,
    baseUrl,
    targetGeneration,
    config.paired_weight_g,
    "read-offline-cache",
  );
  const localWeight = await readLocalWeight(
    config,
    dependencies,
    config.client_shadow_weight_g,
    "verify-offline-client-shadow",
  );
  await dependencies.complete({
    role: "client",
    phase: "offline",
    run_id: config.run_id,
    library_id: config.library_id,
    spool_id: config.spool_id,
    local_weight_g: localWeight,
    host_weight_g: null,
    cache_weight_g: cacheWeight,
    target_generation: targetGeneration,
    live_read_failed: true,
    live_write_failed: true,
    paired_before_cleanup: true,
    auth_cleared: false,
    session_renewed: false,
  });
}

async function runClientRecover(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
) {
  const baseUrl = requireNonEmpty(
    config.base_url,
    "configuration",
    "The Client Host target is missing.",
  );
  const settings = await safeStep(
    "read-recovery-client-settings",
    "The recovery Client settings could not be read.",
    dependencies.getLibrarySyncSettings,
  );
  const targetGeneration = expectConfiguredTargetGeneration(
    settings,
    config,
    baseUrl,
    true,
    "read-recovery-client-settings",
  );

  const recoveredRows = await readHostRows(
    config,
    dependencies,
    baseUrl,
    "renew-client-session",
  );
  readExactHostWeight(
    recoveredRows,
    config,
    config.paired_weight_g,
    "renew-client-session",
  );
  await safeStep("write-recovered-host-weight", "The recovered Client Host write failed.", () =>
    dependencies.updateLibrarySyncHostSpoolWeight(
      baseUrl,
      config.library_id,
      config.spool_id,
      config.recovered_weight_g,
    ),
  );
  const finalHostRows = await readHostRows(
    config,
    dependencies,
    baseUrl,
    "read-recovered-host",
  );
  const hostWeight = readExactHostWeight(
    finalHostRows,
    config,
    config.recovered_weight_g,
    "read-recovered-host",
  );
  await safeStep(
    "save-recovered-cache",
    "The recovered Client cache could not be saved.",
    () =>
      dependencies.saveLibrarySyncSpoolCache(
        finalHostRows,
        baseUrl,
        config.library_id,
        targetGeneration,
      ),
  );
  const cacheWeight = await readCachedWeight(
    config,
    dependencies,
    baseUrl,
    targetGeneration,
    config.recovered_weight_g,
    "read-recovered-cache",
  );
  const localWeight = await readLocalWeight(
    config,
    dependencies,
    config.client_shadow_weight_g,
    "verify-recovered-client-shadow",
  );

  const cleared = await safeStep(
    "clear-client-auth",
    "The Client authentication cleanup failed.",
    dependencies.clearLibrarySyncClientAuth,
  );
  if (cleared.client_auth_paired) {
    scenarioFailure("clear-client-auth", "The Client remained paired after cleanup.");
  }
  const verified = await safeStep(
    "verify-client-auth-cleared",
    "The Client authentication cleanup could not be verified.",
    dependencies.getLibrarySyncSettings,
  );
  if (verified.client_auth_paired) {
    scenarioFailure(
      "verify-client-auth-cleared",
      "The Client remained paired after cleanup verification.",
    );
  }

  await dependencies.complete({
    role: "client",
    phase: "recover",
    run_id: config.run_id,
    library_id: config.library_id,
    spool_id: config.spool_id,
    local_weight_g: localWeight,
    host_weight_g: hostWeight,
    cache_weight_g: cacheWeight,
    target_generation: targetGeneration,
    live_read_failed: false,
    live_write_failed: false,
    paired_before_cleanup: true,
    auth_cleared: true,
    session_renewed: true,
  });
}

async function runClientCleanup(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies,
) {
  const cleared = await safeStep(
    "clear-client-auth",
    "The Client authentication cleanup failed.",
    dependencies.clearLibrarySyncClientAuth,
  );
  if (cleared.client_auth_paired) {
    scenarioFailure("clear-client-auth", "The Client remained paired after cleanup.");
  }
  const verified = await safeStep(
    "verify-client-auth-cleared",
    "The Client authentication cleanup could not be verified.",
    dependencies.getLibrarySyncSettings,
  );
  if (verified.client_auth_paired) {
    scenarioFailure(
      "verify-client-auth-cleared",
      "The Client remained paired after cleanup verification.",
    );
  }
  await dependencies.complete({
    role: "client",
    phase: "cleanup",
    run_id: config.run_id,
    auth_cleared: true,
  });
}

function validateConfiguration(config: PackagedHostClientE2eConfiguration) {
  requireNonEmpty(config.run_id, "configuration", "The packaged E2E run ID is invalid.");
  requireNonEmpty(
    config.library_id,
    "configuration",
    "The packaged E2E library ID is invalid.",
  );
  requireNonEmpty(config.spool_id, "configuration", "The packaged E2E spool ID is invalid.");
  requirePositiveInteger(
    config.listen_port,
    "configuration",
    "The packaged E2E port is invalid.",
  );
  if (config.listen_port > 65_535) {
    scenarioFailure("configuration", "The packaged E2E port is invalid.");
  }
  for (const weight of [
    config.host_initial_weight_g,
    config.paired_weight_g,
    config.recovered_weight_g,
    config.client_shadow_weight_g,
  ]) {
    requirePositiveInteger(
      weight,
      "configuration",
      "A packaged E2E fixture weight is invalid.",
    );
  }
}

export async function runPackagedHostClientE2eScenario(
  config: PackagedHostClientE2eConfiguration,
  dependencies: ScenarioDependencies = defaultDependencies,
) {
  validateConfiguration(config);
  if (config.role === "host" && config.phase === "generation-1") {
    await runHostGenerationOne(config, dependencies);
    return;
  }
  if (config.role === "host" && config.phase === "generation-2") {
    await runHostGenerationTwo(config, dependencies);
    return;
  }
  if (config.role === "client" && config.phase === "pair") {
    await runClientPair(config, dependencies);
    return;
  }
  if (config.role === "client" && config.phase === "offline") {
    await runClientOffline(config, dependencies);
    return;
  }
  if (config.role === "client" && config.phase === "recover") {
    await runClientRecover(config, dependencies);
    return;
  }
  if (config.role === "client" && config.phase === "cleanup") {
    await runClientCleanup(config, dependencies);
    return;
  }
  scenarioFailure("configuration", "The packaged Host-Client E2E role or phase is invalid.");
}
