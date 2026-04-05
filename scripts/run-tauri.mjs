import { spawn } from "node:child_process";
import path from "node:path";

const projectRoot = process.cwd();
const tauriCliPath = path.join(projectRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
const tauriProjectDir = path.join(projectRoot, "src-tauri");
const args = process.argv.slice(2);

const child = spawn(process.execPath, [tauriCliPath, ...args], {
  cwd: tauriProjectDir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
