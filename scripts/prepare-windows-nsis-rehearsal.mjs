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

export function selectNsisRehearsalVersion(packageVersion, msiSourceTags) {
  const version = versionFields(packageVersion);
  if (!msiSourceTags.length || msiSourceTags.some((tag) => !tag.startsWith("v"))) {
    throw new Error("The release rehearsal requires pinned MSI release tags.");
  }
  const versions = msiSourceTags.map((tag) => versionFields(tag.slice(1)));
  const newestMsiVersion = versions.sort(compareVersions).at(-1);
  const comparison = compareVersions(version, newestMsiVersion);
  if (comparison < 0) {
    throw new Error("The rehearsal source version is older than a supported MSI.");
  }
  if (comparison > 0) return packageVersion;

  const [major, minor, patch] = version;
  if (patch === 65_535) {
    throw new Error("Bump the package version before rehearsing an upgrade from this MSI.");
  }
  // The last released package can still be checked out on main. Give only the
  // test candidate a higher patch version so the downgrade guard stays active.
  return `${major}.${minor}.${patch + 1}-rc.1`;
}

export function prepareNsisRehearsalConfig(packageVersion, sourceTags, installerConfig) {
  const nsis = installerConfig.bundle?.windows?.nsis;
  if (nsis?.installMode !== "currentUser" || !nsis.installerHooks || !nsis.template) {
    throw new Error("The NSIS rehearsal requires the per-user migration hooks and template.");
  }
  return {
    version: selectNsisRehearsalVersion(packageVersion, sourceTags),
    bundle: {
      windows: {
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
  const { values } = parseArgs({ options: { output: { type: "string" } } });
  if (!values.output) throw new Error("A temporary --output configuration path is required.");
  const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
  const config = prepareNsisRehearsalConfig(
    readJson("package.json").version,
    Object.keys(readJson("scripts/windows-nsis-msi-sources.json")),
    readJson("scripts/windows-nsis-pilot.json"),
  );
  writeFileSync(values.output, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
  console.log(config.version);
}
