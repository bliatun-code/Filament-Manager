import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  APP_DB_PATH_ENV_VAR,
  assertVisualQaLaunchUsesCopy,
  cleanupVisualQaDatabase,
  formatVisualQaDatasetReport,
  prepareVisualQaDatabase,
  VISUAL_QA_MODE_ENV_VAR,
} from "./visual-qa-db.mjs";
import { formatShellEnvironmentAssignment } from "./shell-environment-command.mjs";

function parseArgValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

export function resolveVisualQaTauriLaunch({
  args = ["dev"],
  executable = process.execPath,
} = {}) {
  return {
    args: [fileURLToPath(new URL("./run-tauri.mjs", import.meta.url)), ...args],
    command: executable,
    shell: false,
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function aggregateVisualQaCleanupError(primaryError, cleanupError, targetPath) {
  return new AggregateError(
    [primaryError, cleanupError],
    `${errorMessage(primaryError)}\nVisual QA database cleanup also failed for ${targetPath}: ${errorMessage(cleanupError)}`,
    { cause: primaryError },
  );
}

async function waitForChildClose(child) {
  return await new Promise((resolveClose) => {
    let childError = null;
    const onError = (error) => {
      childError ??= error;
    };
    child.on("error", onError);
    child.once("close", (code, signal) => {
      child.off("error", onError);
      resolveClose({ code, error: childError, signal });
    });
  });
}

function childTerminationError(code, signal) {
  if (signal) {
    return new Error(`Visual QA process closed with signal ${signal}.`);
  }
  const exitCode = code ?? 1;
  return exitCode === 0
    ? null
    : new Error(`Visual QA process closed with exit code ${exitCode}.`);
}

export async function runVisualQaCli(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const cleanupDatabase =
    options.cleanupVisualQaDatabase ?? cleanupVisualQaDatabase;
  const log = options.log ?? console.log;
  const prepareDatabase =
    options.prepareVisualQaDatabase ?? prepareVisualQaDatabase;
  const processExit = options.processExit ?? process.exit;
  const processKill = options.processKill ?? process.kill;
  const spawnFn = options.spawnFn ?? spawn;
  const sourcePath = parseArgValue(argv, "--source");
  const profile = parseArgValue(argv, "--profile");
  const keep = argv.includes("--keep");
  const live = argv.includes("--live");
  const prepareOnly = argv.includes("--prepare-only");
  assertVisualQaLaunchUsesCopy(live, "Visual QA app launch");
  const result = await prepareDatabase({ live, profile, sourcePath });
  let cleanupAttempted = false;
  const cleanupOnce = (primaryError = null) => {
    if (cleanupAttempted || keep || result.live) {
      return;
    }
    cleanupAttempted = true;
    try {
      cleanupDatabase(result.targetPath);
    } catch (cleanupError) {
      if (primaryError == null) {
        throw cleanupError;
      }
      throw aggregateVisualQaCleanupError(
        primaryError,
        cleanupError,
        result.targetPath,
      );
    }
  };

  log(formatVisualQaDatasetReport(result));
  log(`Visual QA DB copy method: ${result.copyMethod}`);
  log(
    result.live
      ? "Visual QA live DB mode: app changes affect the selected database."
      : "Visual QA uses a temporary DB copy. Live library is not modified.",
  );

  if (prepareOnly) {
    log(
      formatShellEnvironmentAssignment(APP_DB_PATH_ENV_VAR, result.targetPath),
    );
    log(
      formatShellEnvironmentAssignment(VISUAL_QA_MODE_ENV_VAR, "1"),
    );
    return { child: null, database: result };
  }

  const launch = resolveVisualQaTauriLaunch();
  let child;
  try {
    child = spawnFn(launch.command, launch.args, {
      env: {
        ...(options.env ?? process.env),
        [APP_DB_PATH_ENV_VAR]: result.targetPath,
        [VISUAL_QA_MODE_ENV_VAR]: "1",
      },
      shell: false,
      stdio: "inherit",
    });
  } catch (error) {
    cleanupOnce(error);
    throw error;
  }

  const closed = await waitForChildClose(child);
  if (closed.error) {
    cleanupOnce(closed.error);
    throw closed.error;
  }

  cleanupOnce(childTerminationError(closed.code, closed.signal));
  if (closed.signal) {
    processKill(process.pid, closed.signal);
  } else {
    processExit(closed.code ?? 1);
  }
  return { child, close: closed, database: result };
}

async function runCli() {
  await runVisualQaCli();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
