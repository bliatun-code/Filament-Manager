import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(".");
const tauriClientDir = resolve(repoRoot, "ui", "src", "lib");
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

function collectTauriClientSources() {
  return readdirSync(tauriClientDir)
    .filter((fileName) => /^tauri(?:_.+)?_client\.ts$/.test(fileName))
    .sort()
    .map((fileName) => readFileSync(resolve(tauriClientDir, fileName), "utf8"));
}

function assertTauriClientBarrelStaysThin() {
  const source = readFileSync(resolve(tauriClientDir, "tauri_client.ts"), "utf8");
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const nonBarrelLines = lines.filter((line) => !line.startsWith("export * from "));
  if (lines.length > 30 || nonBarrelLines.length > 0) {
    console.error(
      "ui/src/lib/tauri_client.ts should stay a thin compatibility barrel. Put domain commands in tauri_*_client.ts files.",
    );
    process.exit(1);
  }
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

assertTauriClientBarrelStaysThin();

const invokes = collectTauriClientSources().reduce((allInvokes, source) => {
  for (const command of collectTauriInvokes(source)) {
    allInvokes.add(command);
  }
  return allInvokes;
}, new Set());
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
    console.error("Registered Tauri commands not called by ui/src/lib/tauri*_client.ts:");
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
