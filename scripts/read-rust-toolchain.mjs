import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const releasePin = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const quotedValue = /^("|')([A-Za-z0-9_.-]+)\1$/;

/** Read the deliberately small, single-table rustup configuration we maintain.
 * Reject unsupported TOML syntax instead of guessing which channel rustup uses.
 */
export function parseRustToolchain(source) {
  if (typeof source !== "string" || source.length > 65_536) {
    throw new Error("Rust toolchain configuration must be a small text file.");
  }
  let tableSeen = false;
  const fields = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line) continue;
    if (line === "[toolchain]") {
      if (tableSeen) throw new Error("Duplicate toolchain table.");
      tableSeen = true;
      continue;
    }
    const assignment = line.match(/^(channel|profile|components|targets)\s*=\s*(.+)$/);
    if (!tableSeen || !assignment) {
      throw new Error("Unsupported Rust toolchain configuration syntax.");
    }
    const [, key, value] = assignment;
    if (fields.has(key)) throw new Error(`Duplicate toolchain ${key}.`);
    if (key === "components" || key === "targets") {
      const array = value.match(/^\[(.*)\]$/);
      const content = array?.[1].trim();
      const entries = content ? content.replace(/,$/, "").split(",") : [];
      if (!array || entries.some((entry) => !quotedValue.test(entry.trim()))) {
        throw new Error(`Toolchain ${key} must be a single-line string array.`);
      }
    } else {
      const scalar = value.match(quotedValue)?.[2];
      if (key === "channel" ? !scalar || !releasePin.test(scalar)
        : !["minimal", "default", "complete"].includes(scalar)) {
        throw new Error(key === "channel"
          ? "Rust toolchain channel must be an exact x.y.z release pin."
          : "Invalid Rust toolchain profile.");
      }
      fields.set(key, scalar);
      continue;
    }
    fields.set(key, value);
  }
  if (!fields.has("channel")) throw new Error("Missing Rust toolchain channel.");
  return fields.get("channel");
}

export function readRustToolchain(file = new URL("../rust-toolchain.toml", import.meta.url)) {
  return parseRustToolchain(readFileSync(file, "utf8"));
}

function runCli() {
  try {
    const { values } = parseArgs({
      options: { file: { type: "string" }, "github-output": { type: "boolean" } },
      allowPositionals: false,
    });
    const version = readRustToolchain(values.file);
    if (values["github-output"]) {
      if (!process.env.GITHUB_OUTPUT?.trim()) {
        throw new Error("GITHUB_OUTPUT is required for GitHub output mode.");
      }
      appendFileSync(process.env.GITHUB_OUTPUT, `toolchain=${version}\n`, "utf8");
    }
    console.log(version);
  } catch (error) {
    console.error(`Rust toolchain selection failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
