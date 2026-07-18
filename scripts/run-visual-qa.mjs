import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  APP_DB_PATH_ENV_VAR,
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

async function runCli() {
  const argv = process.argv.slice(2);
  const sourcePath = parseArgValue(argv, "--source");
  const profile = parseArgValue(argv, "--profile");
  const keep = argv.includes("--keep");
  const live = argv.includes("--live");
  const prepareOnly = argv.includes("--prepare-only");
  const result = await prepareVisualQaDatabase({ live, profile, sourcePath });

  console.log(formatVisualQaDatasetReport(result));
  console.log(`Visual QA DB copy method: ${result.copyMethod}`);
  console.log(
    result.live
      ? "Visual QA live DB mode: app changes affect the selected database."
      : "Visual QA uses a temporary DB copy. Live library is not modified.",
  );

  if (prepareOnly) {
    console.log(
      formatShellEnvironmentAssignment(APP_DB_PATH_ENV_VAR, result.targetPath),
    );
    console.log(
      formatShellEnvironmentAssignment(VISUAL_QA_MODE_ENV_VAR, "1"),
    );
    return;
  }

  const launch = resolveVisualQaTauriLaunch();
  const child = spawn(launch.command, launch.args, {
    env: {
      ...process.env,
      [APP_DB_PATH_ENV_VAR]: result.targetPath,
      [VISUAL_QA_MODE_ENV_VAR]: "1",
    },
    shell: launch.shell,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (!keep && !result.live) {
      cleanupVisualQaDatabase(result.targetPath);
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
