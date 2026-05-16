import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(".");
const tauriClientPath = resolve(repoRoot, "ui", "src", "lib", "tauri_client.ts");
const mainPath = resolve(repoRoot, "src-tauri", "src", "main.rs");

const intentionalDesktopCommandGaps = new Map([
  [
    "find_spool_by_qr",
    "Companion uses the app service directly; the desktop command is retained for QR workflows.",
  ],
]);

function collectTauriInvokes(source) {
  const invokes = new Set();
  const invokePattern = /\binvoke(?:<[^>]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/gms;
  for (const match of source.matchAll(invokePattern)) {
    invokes.add(match[1]);
  }
  return invokes;
}

function collectRegisteredCommands(source) {
  const handlerStart = source.indexOf("tauri::generate_handler![");
  if (handlerStart === -1) {
    throw new Error("Could not find tauri::generate_handler! in src-tauri/src/main.rs");
  }

  const listStart = source.indexOf("[", handlerStart);
  let depth = 0;
  let listEnd = -1;
  for (let index = listStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        listEnd = index;
        break;
      }
    }
  }
  if (listEnd === -1) {
    throw new Error("Could not parse tauri::generate_handler! command list");
  }

  const commandList = source.slice(listStart + 1, listEnd);
  return new Set(
    commandList
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.split("::").at(-1).trim()),
  );
}

const invokes = collectTauriInvokes(readFileSync(tauriClientPath, "utf8"));
const registered = collectRegisteredCommands(readFileSync(mainPath, "utf8"));

const missing = [...invokes].filter((command) => !registered.has(command)).sort();
const unused = [...registered].filter((command) => !invokes.has(command)).sort();
const unexpectedUnused = unused.filter((command) => !intentionalDesktopCommandGaps.has(command));

if (missing.length > 0 || unexpectedUnused.length > 0) {
  if (missing.length > 0) {
    console.error("Tauri invokes without registered commands:");
    for (const command of missing) {
      console.error(`  - ${command}`);
    }
  }

  if (unexpectedUnused.length > 0) {
    console.error("Registered Tauri commands not called by ui/src/lib/tauri_client.ts:");
    for (const command of unexpectedUnused) {
      console.error(`  - ${command}`);
    }
    console.error("Add an explicit rationale to intentionalDesktopCommandGaps if this is deliberate.");
  }

  process.exit(1);
}

console.log(
  `Tauri command contract ok (${invokes.size} invokes, ${registered.size} registered, ${unused.length} intentional desktop gaps).`,
);
