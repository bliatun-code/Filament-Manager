import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  APP_DB_PATH_ENV_VAR,
  cleanupVisualQaDatabase,
  formatVisualQaDatasetReport,
  prepareVisualQaDatabase,
} from "./visual-qa-db.mjs";

function parseSourceArg(argv) {
  const index = argv.indexOf("--source");
  return index >= 0 ? argv[index + 1] : null;
}

async function runCli() {
  const argv = process.argv.slice(2);
  const sourcePath = parseSourceArg(argv);
  const keep = argv.includes("--keep");
  const prepareOnly = argv.includes("--prepare-only");
  const result = await prepareVisualQaDatabase({ sourcePath });

  console.log(formatVisualQaDatasetReport(result));
  console.log(`Visual QA DB copy method: ${result.copyMethod}`);
  console.log(`Visual QA uses a temporary DB copy. Live library is not modified.`);

  if (prepareOnly) {
    console.log(`${APP_DB_PATH_ENV_VAR}=${result.targetPath}`);
    return;
  }

  const child = spawn("npm", ["run", "tauri", "--", "dev"], {
    env: {
      ...process.env,
      [APP_DB_PATH_ENV_VAR]: result.targetPath,
      FILAMENT_MANAGER_VISUAL_QA: "1",
    },
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (!keep) {
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
