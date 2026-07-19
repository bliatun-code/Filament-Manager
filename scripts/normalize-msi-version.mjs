#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const releaseVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
// This value goes directly to WiX, so the optional build uses a fourth field.
const msiBundleVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/;
const msiVersionFields = [
  ["major", 255n],
  ["minor", 255n],
  ["patch", 65_535n],
  ["build", 65_535n],
];

function validateMsiBundleVersion(version) {
  const match = version.match(msiBundleVersionPattern);
  if (!match) {
    throw new Error(`Cannot derive a valid MSI bundle version from ${version}.`);
  }

  for (const [index, [fieldName, maximum]] of msiVersionFields.entries()) {
    const value = match[index + 1];
    if (value !== undefined && BigInt(value) > maximum) {
      throw new Error(
        `MSI ${fieldName} version field must not exceed ${maximum.toLocaleString("en-US")}; received ${version}.`,
      );
    }
  }

  return version;
}

function invalidMsiBundleVersion(version) {
  throw new Error(`Cannot derive a valid MSI bundle version from ${version}.`);
}

export function releaseVersionFromRef(refName, packageVersion, refType) {
  if (refType !== "tag") {
    return packageVersion;
  }
  const candidate = String(refName ?? "").replace(/^v/, "");
  return releaseVersionPattern.test(candidate) ? candidate : packageVersion;
}

export function normalizeMsiBundleVersion(rawVersion) {
  const version = String(rawVersion ?? "");
  const releaseVersion = version.match(releaseVersionPattern);
  if (!releaseVersion) {
    return invalidMsiBundleVersion(version);
  }

  const [, major, minor, patch, prerelease] = releaseVersion;
  let build;
  if (prerelease !== undefined) {
    const identifiers = prerelease.split(".");
    if (
      identifiers.some(
        (identifier) => /^\d+$/.test(identifier) && /^0\d+/.test(identifier),
      )
    ) {
      return invalidMsiBundleVersion(version);
    }
    const lastIdentifier = identifiers.at(-1);
    build = /^\d+$/.test(lastIdentifier) ? lastIdentifier : "1";
  }

  return validateMsiBundleVersion(
    `${major}.${minor}.${patch}${build === undefined ? "" : `.${build}`}`,
  );
}

export function resolveMsiBundleVersion({
  refName = process.env.GITHUB_REF_NAME,
  refType = process.env.GITHUB_REF_TYPE,
  repoRoot = resolve("."),
} = {}) {
  const packagePath = resolve(repoRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const rawVersion = releaseVersionFromRef(
    refName,
    packageJson.version,
    refType,
  );
  const msiVersion = normalizeMsiBundleVersion(rawVersion);
  return { msiVersion, rawVersion };
}

export function writeMsiVersionOverride({
  outputPath,
  refName = process.env.GITHUB_REF_NAME,
  refType = process.env.GITHUB_REF_TYPE,
  repoRoot = resolve("."),
} = {}) {
  if (typeof outputPath !== "string" || outputPath.length === 0) {
    throw new Error("An output path is required for the MSI version override.");
  }

  const { msiVersion, rawVersion } = resolveMsiBundleVersion({
    refName,
    refType,
    repoRoot,
  });
  const resolvedOutputPath = resolve(outputPath);
  const override = {
    bundle: {
      windows: {
        wix: {
          version: msiVersion,
        },
      },
    },
  };
  writeFileSync(
    resolvedOutputPath,
    `${JSON.stringify(override, null, 2)}\n`,
    { encoding: "utf8", flush: true },
  );
  return { msiVersion, outputPath: resolvedOutputPath, rawVersion };
}

function runCli() {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      check: { type: "boolean" },
      output: { type: "string" },
    },
    strict: true,
  });

  if (values.check && values.output) {
    throw new Error("Use either --check or --output, not both.");
  }
  if (values.check) {
    const { msiVersion } = resolveMsiBundleVersion();
    console.log(`MSI bundle version is valid: ${msiVersion}`);
    return;
  }
  if (!values.output) {
    throw new Error("Use --check or provide --output <path>.");
  }

  const { msiVersion, outputPath } = writeMsiVersionOverride({
    outputPath: values.output,
  });
  console.log(`Wrote MSI version override ${msiVersion} to ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
