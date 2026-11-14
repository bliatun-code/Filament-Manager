import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function versionFields(version) {
  const match = stableVersion.exec(version);
  if (!match) throw new Error(`Expected a stable Windows version, received ${version}.`);
  const fields = match.slice(1).map(Number);
  if (fields.some((field) => field > 65_535)) {
    throw new Error(`Version is outside the Windows resource range: ${version}.`);
  }
  return fields;
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function selectNsisRehearsalVersion(packageVersion, sourceTags) {
  const version = versionFields(packageVersion);
  if (!sourceTags.length || sourceTags.some((tag) => !tag.startsWith("v"))) {
    throw new Error("The release rehearsal requires pinned Windows release tags.");
  }
  const versions = sourceTags.map((tag) => versionFields(tag.slice(1)));
  const latestSourceVersion = versions.sort(compareVersions).at(-1);
  const comparison = compareVersions(version, latestSourceVersion);
  if (comparison < 0) {
    throw new Error("The rehearsal source version is older than a supported Windows release.");
  }
  if (comparison > 0) return packageVersion;

  const [major, minor, patch] = version;
  if (patch === 65_535) {
    throw new Error("Bump the package version before rehearsing an upgrade from this Windows release.");
  }
  // The last released package can still be checked out on main. Give only the
  // test candidate a higher patch version so the downgrade guard stays active.
  return `${major}.${minor}.${patch + 1}-rc.1`;
}

export function prepareNsisRehearsalConfig(packageVersion, sourceTags, installerConfig) {
  const windows = installerConfig.bundle?.windows;
  const nsis = windows?.nsis;
  if (nsis?.installMode !== "currentUser" || !nsis.installerHooks || !nsis.template) {
    throw new Error("The NSIS rehearsal requires the per-user migration hooks and template.");
  }
  if (windows.allowDowngrades !== false) {
    throw new Error("The NSIS rehearsal requires Windows downgrades to be disabled.");
  }
  return {
    version: selectNsisRehearsalVersion(packageVersion, sourceTags),
    bundle: {
      windows: {
        ...windows,
        nsis: {
          ...nsis,
          installerHooks: resolve("src-tauri", nsis.installerHooks),
          template: resolve("src-tauri", nsis.template),
        },
      },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      output: { type: "string" },
      "test-published-upgrade": { type: "boolean" },
    },
  });
  if (!values.output) throw new Error("A temporary --output configuration path is required.");
  const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
  const sourceTags = Object.keys(readJson("scripts/windows-nsis-msi-sources.json"));
  if (values["test-published-upgrade"]) {
    sourceTags.push(readJson("scripts/windows-nsis-upgrade-source.json").tag);
  }
  const config = prepareNsisRehearsalConfig(
    readJson("package.json").version,
    sourceTags,
    readJson("scripts/windows-nsis-pilot.json"),
  );
  writeFileSync(values.output, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
  console.log(config.version);
}
