import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import {
  EXPECTED_PACKAGED_CATALOG_JOBS,
  validatePackagedCatalogJobSummary,
} from "./packaged-catalog-job-evidence.mjs";

import {
  PACKAGED_HOST_CLIENT_CREDENTIAL_CLEANUP_SUMMARY_FORMAT,
  PACKAGED_HOST_CLIENT_READY_FORMAT,
  PACKAGED_HOST_CLIENT_RESULT_FORMAT,
  PACKAGED_HOST_CLIENT_STOP_FORMAT,
  PackagedHostClientPhaseError,
  PackagedHostClientTerminationError,
  closeRawLogsPreservingFailure,
  forceStopHost,
  inspectPackagedHostClientDatabases,
  packagedHostClientE2eCliOptions,
  packagedHostClientPhaseEnvironment,
  preparePackagedHostClientE2eRun,
  removePackagedHostClientWorkDirectory,
  requestPackagedChildForcedTermination,
  resumePackagedHostClientCredentialCleanup,
  resolvePackagedHostClientPhaseCompletion,
  runPackagedHostClientE2e,
  runWindowsTaskkill,
  selectFreeLoopbackPort,
  startPackagedHost,
  stopPackagedHost,
  validatePackagedHostClientE2eOptions,
  validatePackagedHostClientPhaseResult,
  validatePackagedHostReady,
  validateRetainedPackagedHostClientE2eOptions,
  waitForPackagedHostClientChild,
  windowsTaskkillPath,
} from "./run-packaged-host-client-e2e.mjs";

const LIBRARY_ID = "packaged_host_client_e2e_library";
const SPOOL_ID = "packaged_host_client_e2e_spool";
const CATALOG_RUN_ID = "packaged-catalog-test-run";

function temporaryRoot(label) {
  const directory = mkdtempSync(
    path.join(tmpdir(), `packaged-host-client-${label}-`),
  );
  if (process.platform !== "win32") chmodSync(directory, 0o700);
  return directory;
}

function optionsFor(root) {
  const workParent = path.join(root, "private-work-parent");
  const logParent = path.join(root, "private-log-parent");
  mkdirSync(workParent, { mode: 0o700 });
  mkdirSync(logParent, { mode: 0o700 });
  return {
    executablePath: process.execPath,
    workDirectory: path.join(workParent, "run"),
    logDirectory: path.join(logParent, "logs"),
    launchTimeoutMs: 30_000,
  };
}

test("Windows private work cleanup retries a disappearing-child ENOENT", async () => {
  const root = temporaryRoot("remove-child-race");
  let attempts = 0;
  const retryDelays = [];
  try {
    await removePackagedHostClientWorkDirectory(root, {
      platform: "win32",
      removeDirectory: (directoryPath, options) => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("synthetic disappearing child"), {
            code: "ENOENT",
          });
        }
        rmSync(directoryPath, options);
      },
      waitBeforeRetry: async (milliseconds) => {
        retryDelays.push(milliseconds);
      },
    });
    assert.equal(attempts, 2);
    assert.deepEqual(retryDelays, [100]);
    assert.equal(existsSync(root), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("private work cleanup accepts ENOENT only when the exact root is absent", async () => {
  const root = temporaryRoot("remove-absent-root");
  rmSync(root, { force: true, recursive: true });
  let attempts = 0;
  await removePackagedHostClientWorkDirectory(root, {
    platform: "win32",
    removeDirectory: () => {
      attempts += 1;
      throw Object.assign(new Error("synthetic absent root"), {
        code: "ENOENT",
      });
    },
  });
  assert.equal(attempts, 1);
});

test("Windows private work cleanup fails closed when ENOENT persists", async () => {
  const root = temporaryRoot("remove-persistent-race");
  let attempts = 0;
  const retryDelays = [];
  try {
    await assert.rejects(
      async () =>
        removePackagedHostClientWorkDirectory(root, {
          platform: "win32",
          removeDirectory: () => {
            attempts += 1;
            throw Object.assign(new Error("synthetic persistent child race"), {
              code: "ENOENT",
            });
          },
          waitBeforeRetry: async (milliseconds) => {
            retryDelays.push(milliseconds);
          },
        }),
      /synthetic persistent child race/,
    );
    assert.equal(attempts, 10);
    assert.deepEqual(retryDelays, [100, 200, 300, 400, 500, 600, 700, 800, 900]);
    assert.equal(existsSync(root), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Windows private work cleanup retries a transient EPERM", async () => {
  const root = temporaryRoot("remove-transient-access-error");
  let attempts = 0;
  const retryDelays = [];
  try {
    await removePackagedHostClientWorkDirectory(root, {
      platform: "win32",
      removeDirectory: (directoryPath, options) => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("synthetic transient access denied"), {
            code: "EPERM",
          });
        }
        rmSync(directoryPath, options);
      },
      waitBeforeRetry: async (milliseconds) => {
        retryDelays.push(milliseconds);
      },
    });
    assert.equal(attempts, 2);
    assert.deepEqual(retryDelays, [100]);
    assert.equal(existsSync(root), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Windows private work cleanup fails closed when EPERM persists", async () => {
  const root = temporaryRoot("remove-persistent-access-error");
  let attempts = 0;
  const retryDelays = [];
  try {
    await assert.rejects(
      async () =>
        removePackagedHostClientWorkDirectory(root, {
          platform: "win32",
          removeDirectory: () => {
            attempts += 1;
            throw Object.assign(
              new Error("synthetic persistent access denied"),
              { code: "EPERM" },
            );
          },
          waitBeforeRetry: async (milliseconds) => {
            retryDelays.push(milliseconds);
          },
        }),
      /synthetic persistent access denied/,
    );
    assert.equal(attempts, 10);
    assert.deepEqual(
      retryDelays,
      [100, 200, 300, 400, 500, 600, 700, 800, 900],
    );
    assert.equal(existsSync(root), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Windows private work cleanup retries a transient root-probe EPERM", async () => {
  const root = temporaryRoot("remove-transient-probe-error");
  let attempts = 0;
  const retryDelays = [];
  try {
    await removePackagedHostClientWorkDirectory(root, {
      platform: "win32",
      removeDirectory: (directoryPath, options) => {
        attempts += 1;
        if (attempts > 1) rmSync(directoryPath, options);
      },
      inspectPath: (candidate) => {
        if (attempts === 1) {
          throw Object.assign(new Error("synthetic transient probe denied"), {
            code: "EPERM",
          });
        }
        return lstatSync(candidate);
      },
      waitBeforeRetry: async (milliseconds) => {
        retryDelays.push(milliseconds);
      },
    });
    assert.equal(attempts, 2);
    assert.deepEqual(retryDelays, [100]);
    assert.equal(existsSync(root), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Windows private work cleanup fails closed when root-probe EPERM persists", async () => {
  const root = temporaryRoot("remove-persistent-probe-error");
  let attempts = 0;
  const retryDelays = [];
  try {
    await assert.rejects(
      async () =>
        removePackagedHostClientWorkDirectory(root, {
          platform: "win32",
          removeDirectory: () => {
            attempts += 1;
          },
          inspectPath: () => {
            throw Object.assign(
              new Error("synthetic persistent probe denied"),
              { code: "EPERM" },
            );
          },
          waitBeforeRetry: async (milliseconds) => {
            retryDelays.push(milliseconds);
          },
        }),
      /synthetic persistent probe denied/,
    );
    assert.equal(attempts, 10);
    assert.deepEqual(
      retryDelays,
      [100, 200, 300, 400, 500, 600, 700, 800, 900],
    );
    assert.equal(existsSync(root), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Windows private work cleanup does not retry unrelated root-probe errors", async () => {
  const root = temporaryRoot("remove-unrelated-probe-error");
  let attempts = 0;
  try {
    await assert.rejects(
      async () =>
        removePackagedHostClientWorkDirectory(root, {
          platform: "win32",
          removeDirectory: () => {
            attempts += 1;
          },
          inspectPath: () => {
            throw Object.assign(new Error("synthetic invalid probe"), {
              code: "EINVAL",
            });
          },
        }),
      /synthetic invalid probe/,
    );
    assert.equal(attempts, 1);
    assert.equal(existsSync(root), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Windows private work cleanup does not retry unrelated removal errors", async () => {
  const root = temporaryRoot("remove-access-error");
  let attempts = 0;
  try {
    await assert.rejects(
      async () =>
        removePackagedHostClientWorkDirectory(root, {
          platform: "win32",
          removeDirectory: () => {
            attempts += 1;
            throw Object.assign(new Error("synthetic access denied"), {
              code: "EACCES",
            });
          },
        }),
      /synthetic access denied/,
    );
    assert.equal(attempts, 1);
    assert.equal(existsSync(root), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

async function retainedCleanupFixture(root, port = 45_123) {
  const options = optionsFor(root);
  const context = await preparePackagedHostClientE2eRun(options);
  writeFileSync(
    context.credentialCleanupPendingPath,
    `${JSON.stringify({
      format:
        "filament-manager-packaged-host-client-e2e-credential-cleanup-pending-v1",
      run_id: context.runId,
      listen_port: port,
    })}\n`,
  );
  if (process.platform !== "win32") {
    chmodSync(context.credentialCleanupPendingPath, 0o600);
  }
  return { options, context, port };
}

function resultEnvelope(role, phase, runId, completion) {
  return {
    format: PACKAGED_HOST_CLIENT_RESULT_FORMAT,
    status: "pass",
    role,
    phase,
    run_id: runId,
    completion,
  };
}

function clientCompletion(phase, generation = 7) {
  const common = {
    library_id: LIBRARY_ID,
    spool_id: SPOOL_ID,
    local_weight_g: 333,
    target_generation: generation,
    paired_before_cleanup: true,
  };
  if (phase === "pair") {
    return {
      ...common,
      host_weight_g: 875,
      cache_weight_g: 875,
      live_read_failed: false,
      live_write_failed: false,
      auth_cleared: false,
      session_renewed: false,
    };
  }
  if (phase === "offline") {
    return {
      ...common,
      host_weight_g: null,
      cache_weight_g: 875,
      live_read_failed: true,
      live_write_failed: true,
      auth_cleared: false,
      session_renewed: false,
    };
  }
  return {
    ...common,
    host_weight_g: 760,
    cache_weight_g: 760,
    live_read_failed: false,
    live_write_failed: false,
    auth_cleared: true,
    session_renewed: true,
  };
}

function createAuthorityDatabases(hostPath, clientPath, port = 45_123) {
  const schema = `
    PRAGMA user_version = 21;
    CREATE TABLE filament_spools (
      id TEXT PRIMARY KEY,
      current_weight_g INTEGER,
      remaining_g INTEGER
    );
    CREATE TABLE spool_history_events (
      id INTEGER PRIMARY KEY,
      spool_id TEXT NOT NULL,
      event_type TEXT NOT NULL
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE printers (id TEXT PRIMARY KEY, access_token TEXT);
    CREATE TABLE catalog_refresh_jobs (
      job_id TEXT PRIMARY KEY, vendor TEXT, material TEXT, status TEXT,
      started_at TEXT, finished_at TEXT, result_json TEXT, error TEXT
    );
    CREATE TABLE filament_master_list (
      vendor TEXT, material TEXT, filament_name TEXT, color_name TEXT,
      hex_color TEXT, default_weight INTEGER, product_url TEXT
    );
  `;
  const host = new Database(hostPath);
  const client = new Database(clientPath);
  try {
    host.exec(schema);
    client.exec(schema);
    host.prepare("INSERT INTO catalog_refresh_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      `${CATALOG_RUN_ID}-catalog-complete`, "Bambu", "PLA", "SUCCEEDED",
      "2026-09-05T12:00:00Z", "2026-09-05T12:00:01Z",
      JSON.stringify({ imported: 1, reactivated_count: 0, discontinued_count: 0 }), null,
    );
    host.prepare("INSERT INTO catalog_refresh_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      `${CATALOG_RUN_ID}-catalog-interrupt`, "eSUN", "PETG", "INTERRUPTED",
      "2026-09-05T12:00:02Z", "2026-09-05T12:00:03Z", null, "Process interrupted.",
    );
    host.prepare("INSERT INTO filament_master_list VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      "Bambu", "PLA", "Packaged catalog job QA", "QA blue", "#1A73E8", 1000,
      "https://example.invalid/packaged-catalog-job",
    );
    host
      .prepare("INSERT INTO filament_spools VALUES (?, 760, 760)")
      .run(SPOOL_ID);
    client
      .prepare("INSERT INTO filament_spools VALUES (?, 333, 333)")
      .run(SPOOL_ID);
    host
      .prepare("INSERT INTO spool_history_events VALUES (?, ?, ?)")
      .run(1, SPOOL_ID, "CREATED");
    host
      .prepare("INSERT INTO spool_history_events VALUES (?, ?, ?)")
      .run(2, SPOOL_ID, "WEIGHT_UPDATED");
    host
      .prepare("INSERT INTO spool_history_events VALUES (?, ?, ?)")
      .run(3, SPOOL_ID, "WEIGHT_UPDATED");
    client
      .prepare("INSERT INTO spool_history_events VALUES (?, ?, ?)")
      .run(1, SPOOL_ID, "CREATED");
    host
      .prepare("INSERT INTO settings VALUES (?, ?)")
      .run("library_sync_mode", "HOST");
    host
      .prepare("INSERT INTO settings VALUES (?, ?)")
      .run("library_sync_library_id", LIBRARY_ID);
    const clientSettings = [
      ["library_sync_mode", "CLIENT"],
      ["library_sync_library_id", LIBRARY_ID],
      ["library_sync_host_base_url", `http://127.0.0.1:${port}`],
      ["library_sync_target_generation", "7"],
      [
        "library_sync_cached_spools_json",
        JSON.stringify({
          captured_at: "2026-08-31T21:00:00Z",
          rows: [
            {
              spool: {
                id: SPOOL_ID,
                current_weight_g: 760,
                remaining_g: 760,
              },
            },
          ],
        }),
      ],
      [
        "library_sync_cached_printers_json",
        JSON.stringify({
          captured_at: "2026-08-31T21:00:00Z",
          rows: [],
        }),
      ],
    ];
    const insertSetting = client.prepare("INSERT INTO settings VALUES (?, ?)");
    for (const row of clientSettings) insertSetting.run(...row);
  } finally {
    host.close();
    client.close();
  }
}

test("packaged Host-Client options require fresh disjoint private roots", () => {
  const root = temporaryRoot("options");
  try {
    const options = optionsFor(root);
    assert.deepEqual(validatePackagedHostClientE2eOptions(options), options);
    assert.throws(
      () =>
        validatePackagedHostClientE2eOptions({
          ...options,
          workDirectory: path.join(options.logDirectory, "nested"),
        }),
      /must be disjoint/,
    );
    assert.throws(
      () =>
        validatePackagedHostClientE2eOptions({
          ...options,
          launchTimeoutMs: 9_999,
        }),
      /Launch timeout must be an integer/,
    );
    const linkedExecutable = path.join(root, "linked-node");
    symlinkSync(process.execPath, linkedExecutable);
    assert.throws(
      () =>
        validatePackagedHostClientE2eOptions({
          ...options,
          executablePath: linkedExecutable,
        }),
      /real file, not a symbolic link/,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("packaged Host-Client setup creates exact private marker and database names", async () => {
  const root = temporaryRoot("setup");
  try {
    const context = await preparePackagedHostClientE2eRun(optionsFor(root));
    assert.match(
      readFileSync(context.markerPath, "utf8"),
      /^filament-manager-packaged-host-client-e2e-v1\npackaged-host-client-[a-f0-9-]+\n$/,
    );
    assert.equal(path.basename(context.hostDatabasePath), "host.db");
    assert.equal(path.basename(context.clientDatabasePath), "client.db");
    assert.deepEqual(
      JSON.parse(readFileSync(context.credentialCleanupPendingPath, "utf8")),
      {
        format:
          "filament-manager-packaged-host-client-e2e-credential-cleanup-pending-v1",
        run_id: context.runId,
        listen_port: null,
      },
    );
    assert.deepEqual(
      JSON.parse(readFileSync(context.runIdentityPath, "utf8")),
      {
        format: "filament-manager-packaged-host-client-e2e-run-identity-v1",
        run_id: context.runId,
      },
    );
    assert.equal(lstatSync(context.markerPath).isSymbolicLink(), false);
    if (process.platform !== "win32") {
      assert.equal(statSync(context.workDirectory).mode & 0o777, 0o700);
      assert.equal(statSync(context.markerPath).mode & 0o777, 0o600);
      assert.equal(statSync(context.hostDatabasePath).mode & 0o777, 0o600);
      assert.equal(statSync(context.clientDatabasePath).mode & 0o777, 0o600);
      assert.equal(
        statSync(context.credentialCleanupPendingPath).mode & 0o777,
        0o600,
      );
      assert.equal(statSync(context.runIdentityPath).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("packaged Host-Client CLI rejects partial timeout values", () => {
  const options = packagedHostClientE2eCliOptions([
    `--executable=${process.execPath}`,
    `--work-dir=${path.resolve("private-host-client-work")}`,
    `--log-dir=${path.resolve("private-host-client-logs")}`,
    "--launch-timeout-ms=120000junk",
  ]);
  assert.equal(Number.isNaN(options.launchTimeoutMs), true);
});

test("packaged Host-Client CLI recognizes cleanup resume explicitly", () => {
  const options = packagedHostClientE2eCliOptions([
    `--executable=${process.execPath}`,
    `--work-dir=${path.resolve("private-host-client-work")}`,
    `--log-dir=${path.resolve("private-host-client-logs")}`,
    "--resume-credential-cleanup",
  ]);
  assert.equal(options.resumeCredentialCleanup, true);
});

test("packaged Host-Client CLI exits promptly on a sanitized setup failure", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve("scripts/run-packaged-host-client-e2e.mjs"),
      "--unsupported-option",
    ],
    { encoding: "utf8", shell: false, timeout: 5_000 },
  );
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
  assert.match(
    result.stderr,
    /Usage: node scripts\/run-packaged-host-client-e2e/,
  );
});

test("packaged phase environments isolate databases and Windows WebView2 profiles", () => {
  const context = {
    hostDatabasePath: "/private/host.db",
    clientDatabasePath: "/private/client.db",
    workDirectory: "/private/run",
    runId: "packaged-host-client-0123456789",
  };
  const inherited = process.env.WEBVIEW2_USER_DATA_FOLDER;
  process.env.WEBVIEW2_USER_DATA_FOLDER = "/unsafe/inherited";
  try {
    const host = packagedHostClientPhaseEnvironment(
      context,
      "host",
      "generation-1",
      45_123,
      "win32",
    );
    const client = packagedHostClientPhaseEnvironment(
      context,
      "client",
      "pair",
      45_123,
      "win32",
    );
    assert.equal(host.FILAMENT_MANAGER_DB_PATH, context.hostDatabasePath);
    assert.equal(client.FILAMENT_MANAGER_DB_PATH, context.clientDatabasePath);
    assert.equal(host.FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E, "1");
    assert.equal(host.FILAMENT_MANAGER_PACKAGED_HOST_CLIENT_E2E_PORT, "45123");
    assert.equal(host.FILAMENT_MANAGER_VISUAL_QA, "1");
    assert.equal(
      host.WEBVIEW2_USER_DATA_FOLDER,
      path.join(context.workDirectory, "webview2-host-generation-1"),
    );
    assert.equal(
      client.WEBVIEW2_USER_DATA_FOLDER,
      path.join(context.workDirectory, "webview2-client-pair"),
    );
    assert.notEqual(
      host.WEBVIEW2_USER_DATA_FOLDER,
      client.WEBVIEW2_USER_DATA_FOLDER,
    );
    const mac = packagedHostClientPhaseEnvironment(
      context,
      "client",
      "offline",
      45_123,
      "darwin",
    );
    assert.equal("WEBVIEW2_USER_DATA_FOLDER" in mac, false);
  } finally {
    if (inherited === undefined) delete process.env.WEBVIEW2_USER_DATA_FOLDER;
    else process.env.WEBVIEW2_USER_DATA_FOLDER = inherited;
  }
});

test("free-port selection returns a bounded IPv4 loopback port", async () => {
  const port = await selectFreeLoopbackPort();
  assert.equal(Number.isSafeInteger(port), true);
  assert.equal(port >= 1_024 && port <= 65_535, true);
});

test("ready contract keeps pairing material private and rejects insecure URLs", () => {
  const context = {
    runId: "packaged-host-client-0123456789",
    sensitiveValues: new Set(),
  };
  const pairingToken = "0123456789abcdef0123456789abcdef0123456789abcdef";
  const pairingUrl = `http://127.0.0.1:45123/companion?pairing=${pairingToken}`;
  const ready = {
    format: PACKAGED_HOST_CLIENT_READY_FORMAT,
    run_id: context.runId,
    role: "host",
    phase: "generation-1",
    library_id: LIBRARY_ID,
    spool_id: SPOOL_ID,
    listen_port: 45_123,
    base_url: "http://127.0.0.1:45123",
    pairing_url: pairingUrl,
  };
  assert.equal(
    validatePackagedHostReady(ready, {
      context,
      phase: "generation-1",
      port: 45_123,
    }),
    ready,
  );
  assert.equal(context.sensitiveValues.has(pairingUrl), true);
  assert.equal(context.sensitiveValues.has(pairingToken), true);
  const invalidPairingUrls = [
    `https://host.local:45123/companion?pairing=${pairingToken}`,
    `http://host.local:45124/companion?pairing=${pairingToken}`,
    `http://host.local:45123/pair?pairing=${pairingToken}`,
    `http://host.local:45123/companion?token=${pairingToken}`,
    `http://host.local:45123/companion?pairing=${pairingToken}&extra=1`,
    `http://host.local:45123/companion?pairing=%30${pairingToken.slice(1)}`,
    `http://host.local:45123/companion?pairing=${pairingToken}#fragment`,
    `http://user:pass@host.local:45123/companion?pairing=${pairingToken}`,
    `http://host.local:45123/companion?pairing=${pairingToken.toUpperCase()}`,
  ];
  for (const invalidPairingUrl of invalidPairingUrls) {
    assert.throws(
      () =>
        validatePackagedHostReady(
          { ...ready, pairing_url: invalidPairingUrl },
          { context, phase: "generation-1", port: 45_123 },
        ),
      /does not match the private pairing contract/,
    );
  }
  assert.doesNotThrow(() =>
    validatePackagedHostReady(
      {
        ...ready,
        phase: "generation-2",
        pairing_url: null,
      },
      { context, phase: "generation-2", port: 45_123 },
    ),
  );
  assert.doesNotThrow(() =>
    validatePackagedHostReady(
      {
        ...ready,
        pairing_url: `http://filament-host.local:45123/companion?pairing=${pairingToken}`,
      },
      { context, phase: "generation-1", port: 45_123 },
    ),
  );
});

test("phase result contract accepts only exact Host, Client and cleanup completions", () => {
  const runId = "packaged-host-client-0123456789";
  const hostCompletion = {
    pairing_issued: true,
    listen_port: 45_123,
    spool_id: SPOOL_ID,
    library_id: LIBRARY_ID,
  };
  assert.deepEqual(
    validatePackagedHostClientPhaseResult(
      resultEnvelope("host", "generation-1", runId, hostCompletion),
      { role: "host", phase: "generation-1", runId, port: 45_123 },
    ),
    hostCompletion,
  );
  for (const phase of ["pair", "offline", "recover"]) {
    const completion = clientCompletion(phase);
    assert.deepEqual(
      validatePackagedHostClientPhaseResult(
        resultEnvelope("client", phase, runId, completion),
        {
          role: "client",
          phase,
          runId,
          port: 45_123,
          targetGeneration: 7,
        },
      ),
      completion,
    );
  }
  assert.deepEqual(
    validatePackagedHostClientPhaseResult(
      resultEnvelope("client", "cleanup", runId, { auth_cleared: true }),
      { role: "client", phase: "cleanup", runId, port: 45_123 },
    ),
    { auth_cleared: true },
  );
  assert.throws(
    () =>
      validatePackagedHostClientPhaseResult(
        resultEnvelope("client", "recover", runId, {
          ...clientCompletion("recover"),
          local_weight_g: 760,
        }),
        {
          role: "client",
          phase: "recover",
          runId,
          port: 45_123,
          targetGeneration: 7,
        },
      ),
    /completion is invalid/,
  );

  const failure = {
    format: PACKAGED_HOST_CLIENT_RESULT_FORMAT,
    status: "fail",
    role: "host",
    phase: "generation-1",
    run_id: runId,
    step: "enable-host-runtime",
    message: "Packaged Host-Client E2E scenario failed.",
    failure_kind: "port-in-use",
  };
  assert.throws(
    () =>
      validatePackagedHostClientPhaseResult(failure, {
        role: "host",
        phase: "generation-1",
        runId,
        port: 45_123,
      }),
    (error) => {
      assert.equal(error instanceof PackagedHostClientPhaseError, true);
      assert.equal(error.step, "enable-host-runtime");
      assert.equal(error.failureKind, "port-in-use");
      return true;
    },
  );
  assert.throws(
    () =>
      validatePackagedHostClientPhaseResult(
        { ...failure, failure_kind: "unknown" },
        {
          role: "host",
          phase: "generation-1",
          runId,
          port: 45_123,
        },
      ),
    /failure kind is invalid/,
  );
  const missingFailureKind = { ...failure };
  delete missingFailureKind.failure_kind;
  assert.throws(
    () =>
      validatePackagedHostClientPhaseResult(missingFailureKind, {
        role: "host",
        phase: "generation-1",
        runId,
        port: 45_123,
      }),
    /unexpected or missing fields/,
  );
});

test("nonzero child exits preserve an existing structured phase failure", async () => {
  const root = temporaryRoot("structured-nonzero-exit");
  try {
    const context = await preparePackagedHostClientE2eRun(optionsFor(root));
    const resultPath = path.join(
      context.workDirectory,
      "client-pair-result.json",
    );
    writeFileSync(
      resultPath,
      JSON.stringify({
        format: PACKAGED_HOST_CLIENT_RESULT_FORMAT,
        status: "fail",
        role: "client",
        phase: "pair",
        run_id: context.runId,
        step: "pair-client",
        message: "Packaged Host-Client E2E scenario failed.",
        failure_kind: "scenario",
      }),
      { mode: 0o600 },
    );
    assert.throws(
      () =>
        resolvePackagedHostClientPhaseCompletion({
          context,
          role: "client",
          phase: "pair",
          port: 45_123,
          exit: { exitCode: 1, signal: null },
        }),
      (error) => {
        assert.equal(error instanceof PackagedHostClientPhaseError, true);
        assert.equal(error.step, "pair-client");
        assert.equal(error.failureKind, "scenario");
        return true;
      },
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("closed databases preserve Host authority, Client shadow and exact histories", () => {
  const root = temporaryRoot("database");
  const hostPath = path.join(root, "host.db");
  const clientPath = path.join(root, "client.db");
  try {
    createAuthorityDatabases(hostPath, clientPath);
    const result = inspectPackagedHostClientDatabases(
      { hostDatabasePath: hostPath, clientDatabasePath: clientPath, runId: CATALOG_RUN_ID },
      { targetGeneration: 7, port: 45_123 },
    );
    assert.deepEqual(
      {
        host: result.hostWeightG,
        client: result.clientLocalWeightG,
        cache: result.cacheWeightG,
        hostHistory: result.hostHistoryCount,
        clientHistory: result.clientHistoryCount,
        auth: result.authSettingCount,
      },
      {
        host: 760,
        client: 333,
        cache: 760,
        hostHistory: 3,
        clientHistory: 1,
        auth: 0,
      },
    );

    assert.deepEqual(result.catalogJobs, EXPECTED_PACKAGED_CATALOG_JOBS);
    const client = new Database(clientPath);
    try {
      client
        .prepare("INSERT INTO settings VALUES (?, ?)")
        .run("library_sync_client_device_token", "plaintext-secret");
    } finally {
      client.close();
    }
    assert.throws(
      () =>
        inspectPackagedHostClientDatabases(
          { hostDatabasePath: hostPath, clientDatabasePath: clientPath, runId: CATALOG_RUN_ID },
          { targetGeneration: 7, port: 45_123 },
        ),
      /authentication metadata/,
    );
    const clientWithCredentialBytes = new Database(clientPath);
    try {
      clientWithCredentialBytes
        .prepare("INSERT INTO settings VALUES (?, ?)")
        .run("unrelated_private_note", "unexpected-pairing-secret");
    } finally {
      clientWithCredentialBytes.close();
    }
    assert.throws(
      () =>
        inspectPackagedHostClientDatabases(
          {
            hostDatabasePath: hostPath,
            clientDatabasePath: clientPath,
            sensitiveValues: new Set(["unexpected-pairing-secret"]),
          },
          { targetGeneration: 7, port: 45_123 },
        ),
      /retained credential bytes/,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("catalog evidence rejects partial imports, stale receipts and Client fallback", () => {
  const corruptions = [
    ["host", "DELETE FROM catalog_refresh_jobs WHERE status = 'SUCCEEDED'", /receipts/],
    ["host", "UPDATE catalog_refresh_jobs SET job_id = 'other-run' WHERE status = 'SUCCEEDED'", /receipts/],
    ["host", "UPDATE catalog_refresh_jobs SET status = 'RUNNING' WHERE status = 'INTERRUPTED'", /receipts/],
    ["host", "UPDATE catalog_refresh_jobs SET result_json = '{\"imported\":2}' WHERE status = 'SUCCEEDED'", /import result/],
    ["host", "DELETE FROM filament_master_list", /exactly one synthetic/],
    ["host", "INSERT INTO filament_master_list SELECT * FROM filament_master_list", /exactly one synthetic/],
    ["host", "UPDATE filament_master_list SET product_url = 'https://example.invalid/wrong'", /exactly one synthetic/],
    ["client", "INSERT INTO catalog_refresh_jobs (job_id) VALUES ('local-fallback')", /Client local library/],
    ["client", "INSERT INTO filament_master_list (filament_name) VALUES ('Packaged catalog job QA')", /Client local library/],
  ];
  for (const [role, sql, error] of corruptions) {
    const root = temporaryRoot("catalog-evidence");
    const hostPath = path.join(root, "host.db");
    const clientPath = path.join(root, "client.db");
    try {
      createAuthorityDatabases(hostPath, clientPath);
      const database = new Database(role === "host" ? hostPath : clientPath);
      try { database.exec(sql); } finally { database.close(); }
      assert.throws(() => inspectPackagedHostClientDatabases(
        { hostDatabasePath: hostPath, clientDatabasePath: clientPath, runId: CATALOG_RUN_ID },
        { targetGeneration: 7, port: 45_123 },
      ), error, sql);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

test("catalog summary requires exact counts and rejects unexpected data", () => {
  assert.doesNotThrow(() => validatePackagedCatalogJobSummary(EXPECTED_PACKAGED_CATALOG_JOBS));
  for (const value of [undefined, {}, { ...EXPECTED_PACKAGED_CATALOG_JOBS, interrupted: 0 },
    { ...EXPECTED_PACKAGED_CATALOG_JOBS, private_note: "unexpected" }]) {
    assert.throws(() => validatePackagedCatalogJobSummary(value), /summary is invalid/);
  }
});

test("database inspection closes every resource across open and close failures", () => {
  const root = temporaryRoot("database-resource-cleanup");
  const hostPath = path.join(root, "host.db");
  const clientPath = path.join(root, "client.db");
  let hostCloseCount = 0;
  try {
    assert.throws(
      () =>
        inspectPackagedHostClientDatabases(
          { hostDatabasePath: hostPath, clientDatabasePath: clientPath, runId: CATALOG_RUN_ID },
          { targetGeneration: 7, port: 45_123 },
          (databasePath) => {
            if (databasePath === hostPath) {
              return { close: () => (hostCloseCount += 1) };
            }
            throw new Error("synthetic Client open failure");
          },
        ),
      /synthetic Client open failure/,
    );
    assert.equal(hostCloseCount, 1);

    const closeCalls = [];
    assert.throws(
      () =>
        inspectPackagedHostClientDatabases(
          { hostDatabasePath: hostPath, clientDatabasePath: clientPath, runId: CATALOG_RUN_ID },
          { targetGeneration: 7, port: 45_123 },
          (databasePath) =>
            databasePath === hostPath
              ? {
                  close: () => closeCalls.push("host"),
                }
              : {
                  close: () => {
                    closeCalls.push("client");
                    throw new Error("synthetic Client close failure");
                  },
                },
        ),
      /pragma is not a function/,
    );
    assert.deepEqual(closeCalls, ["client", "host"]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("partial raw-log opens remove only files created by the failed phase", async () => {
  const root = temporaryRoot("partial-log-open");
  const workDirectory = path.join(root, "work");
  const logDirectory = path.join(root, "logs");
  mkdirSync(workDirectory, { mode: 0o700 });
  mkdirSync(logDirectory, { mode: 0o700 });
  const stderrPath = path.join(workDirectory, "host-generation-1-stderr.log");
  writeFileSync(stderrPath, "pre-existing blocker", { mode: 0o600 });
  try {
    await assert.rejects(
      startPackagedHost({
        context: {
          executablePath: process.execPath,
          workDirectory,
          logDirectory,
          launchTimeoutMs: 10_000,
          runId: "packaged-host-client-0123456789",
        },
        phase: "generation-1",
        port: 45_123,
      }),
      /EEXIST/,
    );
    assert.equal(
      existsSync(path.join(workDirectory, "host-generation-1-stdout.log")),
      false,
    );
    assert.equal(readFileSync(stderrPath, "utf8"), "pre-existing blocker");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("synchronous spawn setup failures close and remove both raw logs", async () => {
  const root = temporaryRoot("synchronous-spawn-failure");
  const workDirectory = path.join(root, "work");
  const logDirectory = path.join(root, "logs");
  mkdirSync(workDirectory, { mode: 0o700 });
  mkdirSync(logDirectory, { mode: 0o700 });
  try {
    await assert.rejects(
      startPackagedHost({
        context: {
          executablePath: null,
          workDirectory,
          logDirectory,
          launchTimeoutMs: 10_000,
          runId: "packaged-host-client-0123456789",
        },
        phase: "generation-1",
        port: 45_123,
      }),
      /path.*string/i,
    );
    assert.deepEqual(readdirSync(workDirectory), []);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("graceful Host stop writes atomic strict JSON and only sanitized phase logs", async () => {
  const root = temporaryRoot("stop");
  const workDirectory = path.join(root, "work");
  const logDirectory = path.join(root, "logs");
  mkdirSync(workDirectory, { mode: 0o700 });
  mkdirSync(logDirectory, { mode: 0o700 });
  const secret = "secret-pairing-token";
  const secretUrl = `http://127.0.0.1:45123/pair?token=${secret}`;
  const stdoutPath = path.join(workDirectory, "host-generation-1-stdout.log");
  const stderrPath = path.join(workDirectory, "host-generation-1-stderr.log");
  const stdoutDescriptor = openSync(stdoutPath, "wx", 0o600);
  const stderrDescriptor = openSync(stderrPath, "wx", 0o600);
  writeFileSync(
    stdoutDescriptor,
    `${"x".repeat(1024 * 1024 - 8)}${secretUrl}\ntruncated tail`,
  );
  writeFileSync(stderrDescriptor, `pairing_token=${secret}\n`);
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => false;
  const context = {
    workDirectory,
    logDirectory,
    launchTimeoutMs: 10_000,
    runId: "packaged-host-client-0123456789",
    sensitiveValues: new Set([secret, secretUrl]),
  };
  const handle = {
    context,
    phase: "generation-1",
    port: 45_123,
    child,
    logs: {
      stdoutPath,
      stderrPath,
      stdoutDescriptor,
      stderrDescriptor,
      closed: false,
    },
  };
  try {
    const stopPromise = stopPackagedHost(handle);
    const stopPath = path.join(workDirectory, "host-generation-1.stop");
    for (
      let attempt = 0;
      attempt < 100 && !existsSync(stopPath);
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    assert.deepEqual(JSON.parse(readFileSync(stopPath, "utf8")), {
      format: PACKAGED_HOST_CLIENT_STOP_FORMAT,
      role: "host",
      phase: "generation-1",
      run_id: context.runId,
    });
    assert.equal(
      readdirSync(workDirectory).some((name) => name.includes(".tmp")),
      false,
    );
    const resultPath = path.join(
      workDirectory,
      "host-generation-1-result.json",
    );
    writeFileSync(
      resultPath,
      JSON.stringify(
        resultEnvelope("host", "generation-1", context.runId, {
          library_id: LIBRARY_ID,
          spool_id: SPOOL_ID,
          listen_port: 45_123,
          pairing_issued: true,
        }),
      ),
      { mode: 0o600 },
    );
    child.exitCode = 0;
    child.emit("close", 0, null);
    await stopPromise;

    for (const name of [
      "host-generation-1-stdout.log",
      "host-generation-1-stderr.log",
    ]) {
      const published = readFileSync(path.join(logDirectory, name), "utf8");
      assert.equal(published.includes(secret), false);
      assert.equal(published.includes(secretUrl), false);
      if (name.includes("stdout")) {
        assert.match(published, /\[REDACT/);
        assert.match(published, /TRUNCATED BY PACKAGED HOST-CLIENT E2E/);
      } else {
        assert.match(published, /\[REDACTED/);
      }
      if (process.platform !== "win32") {
        assert.equal(
          statSync(path.join(logDirectory, name)).mode & 0o777,
          0o600,
        );
      }
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Host stop closes raw logs when the atomic stop-file write fails", async () => {
  const root = temporaryRoot("stop-write-failure");
  const invalidWorkDirectory = path.join(root, "work-is-a-file");
  const logDirectory = path.join(root, "logs");
  mkdirSync(logDirectory, { mode: 0o700 });
  writeFileSync(invalidWorkDirectory, "not a directory", { mode: 0o600 });
  const stdoutPath = path.join(root, "host-stdout.log");
  const stderrPath = path.join(root, "host-stderr.log");
  const stdoutDescriptor = openSync(stdoutPath, "wx", 0o600);
  const stderrDescriptor = openSync(stderrPath, "wx", 0o600);
  writeFileSync(stdoutDescriptor, "stdout\n");
  writeFileSync(stderrDescriptor, "stderr\n");
  const logs = {
    stdoutPath,
    stderrPath,
    stdoutDescriptor,
    stderrDescriptor,
    closed: false,
  };
  try {
    await assert.rejects(
      stopPackagedHost({
        context: {
          workDirectory: invalidWorkDirectory,
          logDirectory,
          launchTimeoutMs: 10_000,
          runId: "packaged-host-client-0123456789",
          sensitiveValues: new Set(),
        },
        phase: "generation-1",
        port: 45_123,
        child: new EventEmitter(),
        logs,
      }),
      (error) => {
        assert.ok(error && typeof error === "object" && "code" in error);
        assert.ok(
          error.code === "ENOTDIR" || error.code === "ENOENT",
          `unexpected atomic-write error code: ${error.code}`,
        );
        return true;
      },
    );
    assert.equal(logs.closed, true);
    assert.equal(existsSync(path.join(logDirectory, "host-stdout.log")), true);
    assert.equal(existsSync(path.join(logDirectory, "host-stderr.log")), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("unconfirmed termination stays primary when sanitized log publishing also fails", async () => {
  const child = {};
  const terminationFailure = new PackagedHostClientTerminationError(
    "Synthetic Client timeout",
    child,
  );
  const logFailure = new Error("synthetic sanitized log publishing failure");

  await assert.rejects(
    closeRawLogsPreservingFailure({}, {}, terminationFailure, async () => {
      throw logFailure;
    }),
    (error) => {
      assert.strictEqual(error, terminationFailure);
      assert.ok(error instanceof PackagedHostClientTerminationError);
      assert.strictEqual(error.child, child);
      assert.strictEqual(error.secondaryFailure, logFailure);
      return true;
    },
  );
});

test("child wait reports a bounded timeout after confirmed termination", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = (signal) => {
    assert.equal(signal, "SIGKILL");
    child.signalCode = "SIGKILL";
    queueMicrotask(() => child.emit("close", null, "SIGKILL"));
    return true;
  };
  await assert.rejects(
    waitForPackagedHostClientChild(child, 5, "test child", 5_000, (target) =>
      target.kill("SIGKILL"),
    ),
    /exceeded 5 milliseconds/,
  );
});

test("child wait observes a process that closed before listeners were installed", async () => {
  const child = new EventEmitter();
  child.exitCode = 17;
  child.signalCode = null;
  child.kill = () => assert.fail("an exited child must not be killed");

  assert.deepEqual(
    await waitForPackagedHostClientChild(child, 5, "exited child"),
    { exitCode: 17, signal: null },
  );
});

test("Windows forced termination targets and requires the complete child tree", () => {
  const calls = [];
  const child = { pid: 42_424 };
  requestPackagedChildForcedTermination(child, "Windows packaged child", {
    platform: "win32",
    windowsTreeKiller: (pid) => {
      calls.push(pid);
      return { status: 0, error: undefined };
    },
  });
  assert.deepEqual(calls, [42_424]);
  assert.throws(
    () =>
      requestPackagedChildForcedTermination(child, "Windows packaged child", {
        platform: "win32",
        windowsTreeKiller: () => ({ status: 1, error: undefined }),
      }),
    PackagedHostClientTerminationError,
  );
});

test("Windows tree termination uses bounded explicit System32 taskkill", () => {
  const calls = [];
  const environment = { SystemRoot: "C:\\Windows" };
  const result = runWindowsTaskkill(42_424, {
    environment,
    spawnCommand: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, error: undefined };
    },
  });
  assert.equal(result.status, 0);
  assert.equal(
    windowsTaskkillPath(environment),
    "C:\\Windows\\System32\\taskkill.exe",
  );
  assert.deepEqual(calls, [
    {
      command: "C:\\Windows\\System32\\taskkill.exe",
      args: ["/PID", "42424", "/T", "/F"],
      options: {
        shell: false,
        stdio: "ignore",
        timeout: 5_000,
        windowsHide: true,
      },
    },
  ]);
  assert.throws(
    () => windowsTaskkillPath({ SystemRoot: "relative-windows" }),
    /SystemRoot is unavailable or invalid/,
  );
});

test("forced Host cleanup rejects an unconfirmed termination", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  let killCount = 0;
  child.kill = (signal) => {
    assert.equal(signal, "SIGKILL");
    killCount += 1;
    return true;
  };
  await assert.rejects(
    forceStopHost(
      {
        context: { launchTimeoutMs: 10_000 },
        phase: "generation-1",
        child,
        logs: { closed: true },
      },
      5,
      5,
      (target) => target.kill("SIGKILL"),
    ),
    PackagedHostClientTerminationError,
  );
  assert.equal(killCount, 1);
});

test("forced Host cleanup closes logs for an already exited process", async () => {
  const root = temporaryRoot("exited-force-cleanup");
  const workDirectory = path.join(root, "work");
  const logDirectory = path.join(root, "logs");
  mkdirSync(workDirectory, { mode: 0o700 });
  mkdirSync(logDirectory, { mode: 0o700 });
  const stdoutPath = path.join(workDirectory, "stdout.log");
  const stderrPath = path.join(workDirectory, "stderr.log");
  const logs = {
    stdoutPath,
    stderrPath,
    stdoutDescriptor: openSync(stdoutPath, "wx", 0o600),
    stderrDescriptor: openSync(stderrPath, "wx", 0o600),
    closed: false,
  };
  const child = {
    exitCode: 0,
    signalCode: null,
    kill: () => assert.fail("an exited child must not be killed"),
  };
  try {
    await forceStopHost({
      context: { workDirectory, logDirectory, sensitiveValues: new Set() },
      phase: "generation-1",
      child,
      logs,
    });
    assert.equal(logs.closed, true);
    assert.equal(existsSync(path.join(logDirectory, "stdout.log")), true);
    assert.equal(existsSync(path.join(logDirectory, "stderr.log")), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("orchestrator runs both generations, offline proof and unconditional cleanup", async () => {
  const root = temporaryRoot("orchestration");
  const options = optionsFor(root);
  const calls = [];
  try {
    const result = await runPackagedHostClientE2e(options, {
      selectPort: async () => 45_123,
      startHost: async ({ context, phase, port }) => {
        calls.push(`start:${phase}:${port}`);
        context.sensitiveValues.add("secret-pairing-token");
        return { context, phase, port };
      },
      stopHost: async ({ phase, port }) => {
        calls.push(`stop:${phase}:${port}`);
      },
      runClient: async ({ phase, port }) => {
        calls.push(`client:${phase}:${port}`);
        if (phase === "cleanup") return { auth_cleared: true };
        return clientCompletion(phase);
      },
      inspectDatabases: (_context, { port }) => {
        calls.push(`inspect:${port}`);
        return {
          hostSchemaVersion: 21,
          clientSchemaVersion: 21,
          hostWeightG: 760,
          clientLocalWeightG: 333,
          cacheWeightG: 760,
          targetGeneration: 7,
          hostHistoryCount: 3,
          clientHistoryCount: 1,
          cacheSettingCount: 1,
          authSettingCount: 0,
          catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
        };
      },
    });
    assert.deepEqual(calls, [
      "start:generation-1:45123",
      "client:pair:45123",
      "stop:generation-1:45123",
      "client:offline:45123",
      "start:generation-2:45123",
      "client:recover:45123",
      "stop:generation-2:45123",
      "inspect:45123",
      "client:cleanup:45123",
    ]);
    assert.equal(result.status, "pass");
    assert.deepEqual(result.catalog_jobs, EXPECTED_PACKAGED_CATALOG_JOBS);
    assert.equal(result.auth_cleanup, "pass");
    assert.equal(result.phases.at(-1), "client-cleanup");
    assert.equal(existsSync(options.workDirectory), false);
    assert.equal(
      existsSync(path.join(options.logDirectory, "summary.json")),
      true,
    );
    assert.equal(
      readdirSync(options.logDirectory).some((name) => name.endsWith(".tmp")),
      false,
    );
    assert.equal(
      readFileSync(
        path.join(options.logDirectory, "summary.json"),
        "utf8",
      ).includes("secret-pairing-token"),
      false,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("orchestrator retries only OS-classified Host port collisions and clears every SQLite sidecar", async () => {
  const root = temporaryRoot("port-collision-retry");
  const options = optionsFor(root);
  const ports = [45_123, 45_124];
  const calls = [];
  try {
    const result = await runPackagedHostClientE2e(options, {
      selectPort: async () => {
        const port = ports.shift();
        assert.notEqual(port, undefined);
        calls.push(`select:${port}`);
        return port;
      },
      retryDelay: async (milliseconds) => {
        calls.push(`delay:${milliseconds}`);
      },
      startHost: async ({ context, phase, port, attempt }) => {
        calls.push(`start:${phase}:${port}:${attempt}`);
        if (attempt === 1) {
          if (phase === "generation-1") {
            writeFileSync(context.hostDatabasePath, "stale-host-database");
            for (const suffix of ["-journal", "-wal", "-shm"]) {
              writeFileSync(`${context.hostDatabasePath}${suffix}`, suffix);
            }
          }
          throw new PackagedHostClientPhaseError(
            "host",
            phase,
            "enable-host-runtime",
            "Packaged Host-Client E2E scenario failed.",
            "port-in-use",
          );
        }
        if (phase === "generation-1") {
          assert.equal(readFileSync(context.hostDatabasePath, "utf8"), "");
          for (const suffix of ["-journal", "-wal", "-shm"]) {
            assert.equal(
              existsSync(`${context.hostDatabasePath}${suffix}`),
              false,
            );
          }
          if (process.platform !== "win32") {
            assert.equal(
              statSync(context.hostDatabasePath).mode & 0o777,
              0o600,
            );
          }
        }
        return { context, phase, port };
      },
      stopHost: async ({ phase, port }) => {
        calls.push(`stop:${phase}:${port}`);
      },
      runClient: async ({ phase, port }) => {
        calls.push(`client:${phase}:${port}`);
        if (phase === "cleanup") return { auth_cleared: true };
        return clientCompletion(phase);
      },
      inspectDatabases: () => ({
        hostSchemaVersion: 21,
        clientSchemaVersion: 21,
        hostWeightG: 760,
        clientLocalWeightG: 333,
        cacheWeightG: 760,
        targetGeneration: 7,
        hostHistoryCount: 3,
        clientHistoryCount: 1,
        cacheSettingCount: 1,
        authSettingCount: 0,
        catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
      }),
    });
    assert.deepEqual(calls, [
      "select:45123",
      "start:generation-1:45123:1",
      "select:45124",
      "start:generation-1:45124:2",
      "client:pair:45124",
      "stop:generation-1:45124",
      "client:offline:45124",
      "start:generation-2:45124:1",
      "delay:250",
      "start:generation-2:45124:2",
      "client:recover:45124",
      "stop:generation-2:45124",
      "client:cleanup:45124",
    ]);
    assert.equal(result.status, "pass");
    assert.deepEqual(result.catalog_jobs, EXPECTED_PACKAGED_CATALOG_JOBS);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("orchestrator never retries or resets a generic Host startup failure", async () => {
  const root = temporaryRoot("generic-startup-failure");
  const options = optionsFor(root);
  const calls = [];
  try {
    await assert.rejects(
      runPackagedHostClientE2e(options, {
        selectPort: async () => {
          calls.push("select");
          return 45_123;
        },
        retryDelay: async () => {
          calls.push("delay");
        },
        startHost: async ({ context, phase }) => {
          calls.push(`start:${phase}`);
          writeFileSync(context.hostDatabasePath, "keep-host-database");
          writeFileSync(`${context.hostDatabasePath}-journal`, "keep-journal");
          throw new PackagedHostClientPhaseError(
            "host",
            phase,
            "enable-host-runtime",
            "Packaged Host-Client E2E scenario failed.",
            "scenario",
          );
        },
        runClient: async ({ context, phase }) => {
          calls.push(`client:${phase}`);
          assert.equal(
            readFileSync(context.hostDatabasePath, "utf8"),
            "keep-host-database",
          );
          assert.equal(
            readFileSync(`${context.hostDatabasePath}-journal`, "utf8"),
            "keep-journal",
          );
          return { auth_cleared: true };
        },
      }),
      /failed at enable-host-runtime/,
    );
    assert.deepEqual(calls, ["select", "start:generation-1", "client:cleanup"]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("orchestrator preserves and redacts the original failure when cleanup also fails", async () => {
  const root = temporaryRoot("cleanup-failure");
  const options = optionsFor(root);
  const secret = "secret-pairing-token";
  try {
    await assert.rejects(
      runPackagedHostClientE2e(options, {
        selectPort: async () => 45_123,
        startHost: async ({ context, phase, port }) => {
          context.sensitiveValues.add(secret);
          return { context, phase, port };
        },
        stopHost: async () => {},
        runClient: async ({ phase }) => {
          if (phase === "pair") {
            throw new Error(`original pair failure ${secret}`);
          }
          if (phase === "cleanup") throw new Error("secondary cleanup failure");
          return clientCompletion(phase);
        },
      }),
      (error) => {
        assert.match(error.message, /original pair failure \[REDACTED\]/);
        assert.doesNotMatch(error.message, /secondary cleanup failure/);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
    const summary = JSON.parse(
      readFileSync(path.join(options.logDirectory, "summary.json"), "utf8"),
    );
    assert.equal(summary.status, "fail");
    assert.equal(summary.auth_cleanup, "failed");
    assert.equal(summary.message.includes(secret), false);
    assert.match(summary.message, /original pair failure \[REDACTED\]/);
    assert.equal(existsSync(options.workDirectory), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("orchestrator retains private work when the sanitized summary cannot be written", async () => {
  const root = temporaryRoot("summary-write-failure");
  const options = optionsFor(root);
  try {
    await assert.rejects(
      runPackagedHostClientE2e(options, {
        selectPort: async () => 45_123,
        startHost: async ({ context, phase, port }) => ({
          context,
          phase,
          port,
        }),
        stopHost: async () => {},
        runClient: async ({ phase }) =>
          phase === "cleanup"
            ? { auth_cleared: true }
            : clientCompletion(phase),
        inspectDatabases: () => {
          const summaryBlocker = path.join(
            options.logDirectory,
            "summary.json",
          );
          mkdirSync(summaryBlocker);
          writeFileSync(path.join(summaryBlocker, "blocker"), "not a file");
          return {
            hostSchemaVersion: 21,
            clientSchemaVersion: 21,
            hostWeightG: 760,
            clientLocalWeightG: 333,
            cacheWeightG: 760,
            targetGeneration: 7,
            hostHistoryCount: 3,
            clientHistoryCount: 1,
            cacheSettingCount: 1,
            authSettingCount: 0,
            catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
          };
        },
      }),
      /summary could not be written/,
    );
    assert.equal(existsSync(options.workDirectory), true);
    assert.equal(
      readdirSync(options.logDirectory).some((name) => name.endsWith(".tmp")),
      false,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("orchestrator continues private cleanup when graceful and forced Host cleanup fail", async () => {
  const root = temporaryRoot("host-cleanup-failure");
  const options = optionsFor(root);
  const calls = [];
  try {
    await assert.rejects(
      runPackagedHostClientE2e(options, {
        selectPort: async () => 45_123,
        startHost: async ({ context, phase, port }) => ({
          context,
          phase,
          port,
        }),
        stopHost: async () => {
          calls.push("stop");
          throw new Error("synthetic graceful stop failure");
        },
        forceStopHost: async () => {
          calls.push("force-stop");
          throw new Error("synthetic forced stop failure");
        },
        runClient: async ({ phase }) => {
          calls.push(`client:${phase}`);
          return phase === "cleanup"
            ? { auth_cleared: true }
            : clientCompletion(phase);
        },
      }),
      /Host cleanup failed/,
    );
    assert.deepEqual(calls, [
      "client:pair",
      "stop",
      "force-stop",
      "client:cleanup",
    ]);
    assert.equal(existsSync(options.workDirectory), false);
    const summary = JSON.parse(
      readFileSync(path.join(options.logDirectory, "summary.json"), "utf8"),
    );
    assert.equal(summary.status, "fail");
    assert.match(summary.message, /Host cleanup failed/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("orchestrator retains private work when Host termination cannot be confirmed", async () => {
  const root = temporaryRoot("unconfirmed-host-termination");
  const options = optionsFor(root);
  const clientPhases = [];
  let forceStopCalls = 0;
  try {
    await assert.rejects(
      runPackagedHostClientE2e(options, {
        selectPort: async () => 45_123,
        startHost: async ({ context, phase, port }) => ({
          context,
          phase,
          port,
        }),
        stopHost: async () => {
          throw new PackagedHostClientTerminationError(
            "Synthetic graceful Host cleanup",
          );
        },
        forceStopHost: async () => {
          forceStopCalls += 1;
          throw new PackagedHostClientTerminationError(
            "Synthetic forced Host cleanup",
          );
        },
        runClient: async ({ phase }) => {
          clientPhases.push(phase);
          if (phase === "pair") throw new Error("synthetic pair failure");
          if (phase === "cleanup") return { auth_cleared: true };
          return clientCompletion(phase);
        },
      }),
      /Host cleanup failed/,
    );
    assert.deepEqual(clientPhases, ["pair", "cleanup"]);
    assert.equal(forceStopCalls, 0);
    assert.equal(existsSync(options.workDirectory), true);
    const summary = JSON.parse(
      readFileSync(path.join(options.logDirectory, "summary.json"), "utf8"),
    );
    assert.equal(summary.status, "fail");
    assert.equal(summary.auth_cleanup, "pass");
    assert.match(summary.message, /Host cleanup failed/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("a timed-out ordinary Host stop is never signalled again", async () => {
  const root = temporaryRoot("ordinary-host-stop-unconfirmed");
  const options = optionsFor(root);
  const child = {};
  let stopCalls = 0;
  let forceStopCalls = 0;
  try {
    await assert.rejects(
      runPackagedHostClientE2e(options, {
        selectPort: async () => 45_123,
        startHost: async ({ context, phase, port }) => ({
          context,
          phase,
          port,
          child,
        }),
        stopHost: async () => {
          stopCalls += 1;
          throw new PackagedHostClientTerminationError(
            "Synthetic ordinary Host stop",
            child,
          );
        },
        forceStopHost: async () => {
          forceStopCalls += 1;
        },
        runClient: async ({ phase }) =>
          phase === "cleanup"
            ? { auth_cleared: true }
            : clientCompletion(phase),
      }),
      /Host cleanup failed/,
    );
    assert.equal(stopCalls, 1);
    assert.equal(forceStopCalls, 0);
    assert.equal(existsSync(options.workDirectory), true);
    const summary = JSON.parse(
      readFileSync(path.join(options.logDirectory, "summary.json"), "utf8"),
    );
    assert.equal(summary.status, "fail");
    assert.equal(summary.auth_cleanup, "pass");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("an unconfirmed earlier Client blocks a second cleanup Client", async () => {
  const root = temporaryRoot("unconfirmed-client-before-cleanup");
  const options = optionsFor(root);
  const pairChild = {};
  const clientPhases = [];
  try {
    await assert.rejects(
      runPackagedHostClientE2e(options, {
        selectPort: async () => 45_123,
        startHost: async ({ context, phase, port }) => ({
          context,
          phase,
          port,
        }),
        stopHost: async () => {},
        runClient: async ({ phase }) => {
          clientPhases.push(phase);
          if (phase === "pair") {
            throw new PackagedHostClientTerminationError(
              "Synthetic Client pair",
              pairChild,
            );
          }
          return phase === "cleanup"
            ? { auth_cleared: true }
            : clientCompletion(phase);
        },
      }),
      /Synthetic Client pair termination was not confirmed/,
    );
    assert.deepEqual(clientPhases, ["pair"]);
    assert.equal(existsSync(options.workDirectory), true);
    const summary = JSON.parse(
      readFileSync(path.join(options.logDirectory, "summary.json"), "utf8"),
    );
    assert.equal(summary.status, "fail");
    assert.equal(summary.auth_cleanup, "skipped-unconfirmed-process");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("confirmed forced Host cleanup after a pre-signal failure permits private-work removal", async () => {
  const root = temporaryRoot("confirmed-forced-host-cleanup");
  const options = optionsFor(root);
  const child = {};
  try {
    await assert.rejects(
      runPackagedHostClientE2e(options, {
        selectPort: async () => 45_123,
        startHost: async ({ context, phase, port }) => ({
          context,
          phase,
          port,
          child,
        }),
        stopHost: async () => {
          throw new Error(
            "synthetic stop-file write failure before signalling",
          );
        },
        forceStopHost: async () => {},
        runClient: async ({ phase }) => {
          if (phase === "pair") throw new Error("synthetic pair failure");
          if (phase === "cleanup") return { auth_cleared: true };
          return clientCompletion(phase);
        },
      }),
      /synthetic pair failure/,
    );
    assert.equal(existsSync(options.workDirectory), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("cleanup-phase unconfirmed termination retains private work", async () => {
  const root = temporaryRoot("cleanup-unconfirmed-termination");
  const options = optionsFor(root);
  const cleanupChild = {};
  try {
    await assert.rejects(
      runPackagedHostClientE2e(options, {
        selectPort: async () => 45_123,
        startHost: async ({ context, phase, port }) => ({
          context,
          phase,
          port,
        }),
        stopHost: async () => {},
        runClient: async ({ phase }) => {
          if (phase === "cleanup") {
            throw new PackagedHostClientTerminationError(
              "Synthetic Client cleanup",
              cleanupChild,
            );
          }
          return clientCompletion(phase);
        },
        inspectDatabases: () => ({
          hostSchemaVersion: 21,
          clientSchemaVersion: 21,
          hostWeightG: 760,
          clientLocalWeightG: 333,
          cacheWeightG: 760,
          targetGeneration: 7,
          hostHistoryCount: 3,
          clientHistoryCount: 1,
          cacheSettingCount: 1,
          authSettingCount: 0,
          catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
        }),
      }),
      /Synthetic Client cleanup termination was not confirmed/,
    );
    assert.equal(existsSync(options.workDirectory), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("credential cleanup resume requires confirmed exact-process termination", async () => {
  const root = temporaryRoot("resume-unconfirmed");
  try {
    const { options } = await retainedCleanupFixture(root);
    await assert.rejects(
      resumePackagedHostClientCredentialCleanup(options),
      /requires confirmed exact-process termination/,
    );
    assert.equal(existsSync(options.workDirectory), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("a normal-run work removal failure can be recovered by cleanup resume", async () => {
  const root = temporaryRoot("main-remove-resume");
  const options = optionsFor(root);
  try {
    await assert.rejects(
      runPackagedHostClientE2e(options, {
        selectPort: async () => 45_123,
        startHost: async ({ context, phase, port }) => ({
          context,
          phase,
          port,
        }),
        stopHost: async () => {},
        runClient: async ({ phase }) =>
          phase === "cleanup"
            ? { auth_cleared: true }
            : clientCompletion(phase),
        inspectDatabases: () => ({
          hostSchemaVersion: 21,
          clientSchemaVersion: 21,
          hostWeightG: 760,
          clientLocalWeightG: 333,
          cacheWeightG: 760,
          targetGeneration: 7,
          hostHistoryCount: 3,
          clientHistoryCount: 1,
          cacheSettingCount: 1,
          authSettingCount: 0,
          catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
        }),
        removeWork: () => {
          throw Object.assign(new Error("synthetic main work removal failure"), {
            code: "ENOENT",
          });
        },
      }),
      /private work cleanup failed \(ENOENT after bounded retries\)/,
    );
    assert.equal(existsSync(options.workDirectory), true);
    const prior = JSON.parse(
      readFileSync(path.join(options.logDirectory, "summary.json"), "utf8"),
    );
    assert.equal(prior.status, "pass");
    assert.equal(prior.auth_cleanup, "pass");

    await resumePackagedHostClientCredentialCleanup(
      { ...options, processTerminationConfirmed: true },
      {
        runClient: async ({ port, attempt }) => {
          assert.equal(port, 45_123);
          assert.equal(attempt, 2);
          return { auth_cleared: true };
        },
        inspectCredentials: () => ({
          clientSchemaVersion: 21,
          authSettingCount: 0,
          catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
        }),
      },
    );
    assert.equal(existsSync(options.workDirectory), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("credential cleanup resume reuses the identity-bound original port", async () => {
  const root = temporaryRoot("resume-original-port");
  try {
    const { options, context, port } = await retainedCleanupFixture(root);
    const staleResultPath = path.join(
      options.workDirectory,
      "client-cleanup-result.json",
    );
    writeFileSync(
      staleResultPath,
      `${JSON.stringify(
        resultEnvelope("client", "cleanup", context.runId, {
          auth_cleared: true,
        }),
      )}\n`,
      { mode: 0o600 },
    );
    if (process.platform !== "win32") chmodSync(staleResultPath, 0o600);
    let launchCount = 0;
    const result = await resumePackagedHostClientCredentialCleanup(
      { ...options, processTerminationConfirmed: true },
      {
        selectPort: async () => {
          throw new Error("resume must not select a replacement port");
        },
        runClient: async ({ phase, port: actualPort, attempt }) => {
          launchCount += 1;
          assert.equal(phase, "cleanup");
          assert.equal(actualPort, port);
          assert.equal(attempt, 2);
          return { auth_cleared: true };
        },
        inspectCredentials: () => ({
          clientSchemaVersion: 21,
          authSettingCount: 0,
          catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
        }),
      },
    );
    assert.equal(launchCount, 1);
    assert.equal(result.cleanup_launch, "attempt-2");
    assert.equal(result.run_id, context.runId);
    assert.equal(existsSync(options.workDirectory), false);
    const summary = JSON.parse(
      readFileSync(
        path.join(options.logDirectory, "credential-cleanup-summary.json"),
        "utf8",
      ),
    );
    assert.equal(
      summary.format,
      PACKAGED_HOST_CLIENT_CREDENTIAL_CLEANUP_SUMMARY_FORMAT,
    );
    assert.equal(summary.status, "pass");
    assert.equal(summary.run_id, context.runId);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("credential cleanup resume retains work on failure and can retry", async () => {
  const root = temporaryRoot("resume-retry");
  try {
    const { options, context } = await retainedCleanupFixture(root);
    await assert.rejects(
      resumePackagedHostClientCredentialCleanup(
        { ...options, processTerminationConfirmed: true },
        {
          runClient: async () => {
            throw new Error("synthetic cleanup retry failure");
          },
        },
      ),
      /synthetic cleanup retry failure/,
    );
    assert.equal(existsSync(options.workDirectory), true);
    const failed = JSON.parse(
      readFileSync(
        path.join(options.logDirectory, "credential-cleanup-summary.json"),
        "utf8",
      ),
    );
    assert.deepEqual(Object.keys(failed).sort(), [
      "format",
      "message",
      "process_termination_confirmed",
      "run_id",
      "status",
    ]);
    assert.equal(failed.status, "fail");
    assert.equal(failed.run_id, context.runId);

    const passed = await resumePackagedHostClientCredentialCleanup(
      { ...options, processTerminationConfirmed: true },
      {
        runClient: async () => ({ auth_cleared: true }),
        inspectCredentials: () => ({
          clientSchemaVersion: 21,
          authSettingCount: 0,
          catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
        }),
      },
    );
    assert.equal(passed.status, "pass");
    assert.equal(existsSync(options.workDirectory), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("credential cleanup resume recovers after private work removal fails", async () => {
  const root = temporaryRoot("resume-remove-failure");
  try {
    const { options, context } = await retainedCleanupFixture(root);
    await assert.rejects(
      resumePackagedHostClientCredentialCleanup(
        { ...options, processTerminationConfirmed: true },
        {
          runClient: async () => ({ auth_cleared: true }),
          inspectCredentials: () => ({
            clientSchemaVersion: 21,
            authSettingCount: 0,
            catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
          }),
          removeWork: () => {
            throw new Error("synthetic retained-work removal failure");
          },
        },
      ),
      /synthetic retained-work removal failure/,
    );
    assert.equal(existsSync(options.workDirectory), true);
    const priorPass = JSON.parse(
      readFileSync(
        path.join(options.logDirectory, "credential-cleanup-summary.json"),
        "utf8",
      ),
    );
    assert.equal(priorPass.status, "pass");
    assert.equal(priorPass.run_id, context.runId);

    let retries = 0;
    await resumePackagedHostClientCredentialCleanup(
      { ...options, processTerminationConfirmed: true },
      {
        runClient: async () => {
          retries += 1;
          return { auth_cleared: true };
        },
        inspectCredentials: () => ({
          clientSchemaVersion: 21,
          authSettingCount: 0,
          catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
        }),
      },
    );
    assert.equal(retries, 1);
    assert.equal(existsSync(options.workDirectory), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("credential cleanup resume rejects a mismatched log identity", async () => {
  const root = temporaryRoot("resume-log-identity");
  try {
    const { options, context } = await retainedCleanupFixture(root);
    writeFileSync(
      context.runIdentityPath,
      `${JSON.stringify({
        format: "filament-manager-packaged-host-client-e2e-run-identity-v1",
        run_id: "packaged-host-client-00000000-0000-0000-0000-000000000000",
      })}\n`,
    );
    if (process.platform !== "win32") chmodSync(context.runIdentityPath, 0o600);
    assert.throws(
      () => validateRetainedPackagedHostClientE2eOptions(options),
      /log identity is invalid/,
    );
    await assert.rejects(
      resumePackagedHostClientCredentialCleanup({
        ...options,
        processTerminationConfirmed: true,
      }),
      /log identity is invalid/,
    );
    assert.equal(existsSync(options.workDirectory), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("credential cleanup resume tolerates only the known summary directory blocker", async () => {
  const root = temporaryRoot("resume-summary-blocker");
  try {
    const { options } = await retainedCleanupFixture(root);
    mkdirSync(path.join(options.logDirectory, "summary.json"));
    await resumePackagedHostClientCredentialCleanup(
      { ...options, processTerminationConfirmed: true },
      {
        runClient: async () => ({ auth_cleared: true }),
        inspectCredentials: () => ({
          clientSchemaVersion: 21,
          authSettingCount: 0,
          catalogJobs: { ...EXPECTED_PACKAGED_CATALOG_JOBS },
        }),
      },
    );
    assert.equal(existsSync(options.workDirectory), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
