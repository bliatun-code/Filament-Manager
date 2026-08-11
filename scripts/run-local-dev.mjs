import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquireLocalDevProcessLock,
  prepareLocalDevDatabase,
} from "./local-dev-database.mjs";
import { runTauriCli } from "./run-tauri.mjs";

const DEFAULT_REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

export const FILAMENT_MANAGER_DB_PATH_ENV = "FILAMENT_MANAGER_DB_PATH";
export const LOCAL_DEV_DATABASE_SEGMENTS = [
  "tmp",
  "dev-local",
  "filament-manager.db",
];

export function resolveLocalDevDatabasePath(repoRoot = DEFAULT_REPO_ROOT) {
  return path.resolve(repoRoot, ...LOCAL_DEV_DATABASE_SEGMENTS);
}

export function buildLocalDevEnvironment({
  env = process.env,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  return {
    ...env,
    [FILAMENT_MANAGER_DB_PATH_ENV]: resolveLocalDevDatabasePath(repoRoot),
  };
}

export async function runLocalDev({
  argv = process.argv.slice(2),
  cwd = DEFAULT_REPO_ROOT,
  env = process.env,
  log = console.log,
  platform = process.platform,
  processControl = process,
  acquireLock = acquireLocalDevProcessLock,
  prepareDatabase = prepareLocalDevDatabase,
  runTauri = runTauriCli,
} = {}) {
  const childEnv = buildLocalDevEnvironment({ env, repoRoot: cwd });
  const targetPath = childEnv[FILAMENT_MANAGER_DB_PATH_ENV];
  const releaseAcquiredLock = acquireLock({ cwd, platform, targetPath });
  const signalHandlers = new Map();
  let lockReleased = false;
  const removeLifecycleHandlers = () => {
    processControl.removeListener("exit", releaseLock);
    for (const [signal, handler] of signalHandlers) {
      processControl.removeListener(signal, handler);
    }
    signalHandlers.clear();
  };
  const releaseLock = () => {
    if (lockReleased) {
      return;
    }
    lockReleased = true;
    removeLifecycleHandlers();
    releaseAcquiredLock();
  };
  processControl.once("exit", releaseLock);
  const handledSignals = ["SIGINT", "SIGTERM"];
  if (platform !== "win32") {
    handledSignals.push("SIGHUP");
  }
  for (const signal of handledSignals) {
    const handler = () => {
      try {
        releaseLock();
      } finally {
        processControl.kill(processControl.pid, signal);
      }
    };
    signalHandlers.set(signal, handler);
    processControl.once(signal, handler);
  }

  try {
    const preparation = await prepareDatabase({
      cwd,
      env,
      platform,
      targetPath,
    });
    if (preparation.reused) {
      log(`Reusing populated local-only development database: ${preparation.targetPath}`);
    } else {
      log(`Created local-only development snapshot from: ${preparation.sourcePath}`);
      log(`Writable development database: ${preparation.targetPath}`);
    }
    const child = runTauri({
      argv: ["dev", ...argv],
      cwd,
      env: childEnv,
      platform,
    });
    child?.once?.("error", releaseLock);
    child?.once?.("exit", releaseLock);
    return child;
  } catch (error) {
    releaseLock();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runLocalDev();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
