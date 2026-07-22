#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MAX_SBOM_BYTES = 16 * 1024 * 1024;
const REQUIRED_SPDX_VERSION = "SPDX-2.3";
const REQUIRED_DATA_LICENSE = "CC0-1.0";
const REQUIRED_DOCUMENT_ID = "SPDXRef-DOCUMENT";

const forbiddenStringPatterns = [
  {
    label: "macOS home path",
    pattern: /\/Users\/[^/\s"'<>`]+(?:\/|$)/i,
  },
  {
    label: "GitHub runner workspace path",
    pattern: /\/home\/runner\/work(?:\/|$)/i,
  },
  {
    label: "Windows home path",
    pattern: /[A-Za-z]:\\(?:Users|Documents and Settings)\\/i,
  },
  {
    label: "encoded macOS home path",
    pattern: /%2fUsers%2f/i,
  },
  {
    label: "encoded GitHub runner workspace path",
    pattern: /%2fhome%2frunner%2fwork/i,
  },
  {
    label: "private key material",
    pattern: /-----BEGIN (?:DSA |EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/i,
  },
  {
    label: "GitHub access token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
];

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function visitStrings(value, visitor, path = "document") {
  if (typeof value === "string") {
    visitor(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitStrings(entry, visitor, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      visitStrings(entry, visitor, `${path}.${key}`);
    }
  }
}

function assertNoPrivateBuildData(document) {
  visitStrings(document, (value, path) => {
    for (const forbidden of forbiddenStringPatterns) {
      if (forbidden.pattern.test(value)) {
        throw new Error(`SBOM contains ${forbidden.label} at ${path}.`);
      }
    }
  });
}

export function validateReleaseSbomDocument(
  document,
  { expectedPackage, expectedVersion } = {},
) {
  requireNonEmptyString(expectedPackage, "Expected package");
  requireNonEmptyString(expectedVersion, "Expected version");

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("SBOM root must be a JSON object.");
  }
  if (document.spdxVersion !== REQUIRED_SPDX_VERSION) {
    throw new Error(
      `SBOM spdxVersion must be ${REQUIRED_SPDX_VERSION}, found ${document.spdxVersion ?? "missing"}.`,
    );
  }
  if (document.dataLicense !== REQUIRED_DATA_LICENSE) {
    throw new Error(
      `SBOM dataLicense must be ${REQUIRED_DATA_LICENSE}, found ${document.dataLicense ?? "missing"}.`,
    );
  }
  if (document.SPDXID !== REQUIRED_DOCUMENT_ID) {
    throw new Error(
      `SBOM document SPDXID must be ${REQUIRED_DOCUMENT_ID}, found ${document.SPDXID ?? "missing"}.`,
    );
  }

  requireNonEmptyString(document.name, "SBOM document name");
  const namespace = requireNonEmptyString(
    document.documentNamespace,
    "SBOM document namespace",
  );
  if (!/^https?:\/\/\S+$/i.test(namespace)) {
    throw new Error("SBOM document namespace must be an absolute HTTP(S) URL.");
  }

  const creationInfo = document.creationInfo;
  if (!creationInfo || typeof creationInfo !== "object" || Array.isArray(creationInfo)) {
    throw new Error("SBOM creationInfo must be an object.");
  }
  const created = requireNonEmptyString(creationInfo.created, "SBOM creation time");
  if (Number.isNaN(Date.parse(created))) {
    throw new Error("SBOM creation time must be a valid timestamp.");
  }
  if (!Array.isArray(creationInfo.creators)) {
    throw new Error("SBOM creationInfo.creators must be an array.");
  }
  const hasSyftCreator = creationInfo.creators.some(
    (creator) => typeof creator === "string" && /^Tool: syft(?:-|$)/i.test(creator),
  );
  if (!hasSyftCreator) {
    throw new Error("SBOM must identify Syft as a document creator.");
  }

  if (!Array.isArray(document.packages) || document.packages.length === 0) {
    throw new Error("SBOM packages must be a non-empty array.");
  }
  const packageIds = new Set();
  for (const [index, packageEntry] of document.packages.entries()) {
    if (!packageEntry || typeof packageEntry !== "object" || Array.isArray(packageEntry)) {
      throw new Error(`SBOM package at index ${index} must be an object.`);
    }
    requireNonEmptyString(packageEntry.name, `SBOM package ${index} name`);
    const packageId = requireNonEmptyString(
      packageEntry.SPDXID,
      `SBOM package ${index} SPDXID`,
    );
    if (!/^SPDXRef-[A-Za-z0-9.-]+$/.test(packageId)) {
      throw new Error(`SBOM package ${index} has an invalid SPDXID.`);
    }
    if (packageIds.has(packageId)) {
      throw new Error(`SBOM contains duplicate package SPDXID ${packageId}.`);
    }
    packageIds.add(packageId);
  }

  const matchingPackages = document.packages.filter(
    (packageEntry) =>
      packageEntry.name === expectedPackage && packageEntry.versionInfo === expectedVersion,
  );
  if (matchingPackages.length === 0) {
    throw new Error(
      `SBOM does not contain ${expectedPackage} at expected version ${expectedVersion}.`,
    );
  }

  if (!Array.isArray(document.relationships) || document.relationships.length === 0) {
    throw new Error("SBOM relationships must be a non-empty array.");
  }
  for (const [index, relationship] of document.relationships.entries()) {
    if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
      throw new Error(`SBOM relationship at index ${index} must be an object.`);
    }
    requireNonEmptyString(
      relationship.spdxElementId,
      `SBOM relationship ${index} source`,
    );
    requireNonEmptyString(
      relationship.relatedSpdxElement,
      `SBOM relationship ${index} target`,
    );
    requireNonEmptyString(
      relationship.relationshipType,
      `SBOM relationship ${index} type`,
    );
  }

  const expectedPackageIds = new Set(matchingPackages.map((entry) => entry.SPDXID));
  const describedPackageIds = new Set(
    document.relationships
      .filter(
        (relationship) =>
          relationship.spdxElementId === REQUIRED_DOCUMENT_ID &&
          relationship.relationshipType === "DESCRIBES" &&
          packageIds.has(relationship.relatedSpdxElement),
      )
      .map((relationship) => relationship.relatedSpdxElement),
  );
  if (describedPackageIds.size === 0) {
    throw new Error("SBOM document must describe a package root.");
  }
  const rootIncludesExpectedPackage =
    [...expectedPackageIds].some((packageId) => describedPackageIds.has(packageId)) ||
    document.relationships.some(
      (relationship) =>
        describedPackageIds.has(relationship.spdxElementId) &&
        ["CONTAINS", "DEPENDS_ON"].includes(relationship.relationshipType) &&
        expectedPackageIds.has(relationship.relatedSpdxElement),
    );
  if (!rootIncludesExpectedPackage) {
    throw new Error(
      `SBOM document root must include ${expectedPackage} at expected version ${expectedVersion}.`,
    );
  }

  assertNoPrivateBuildData(document);
  return {
    packageCount: document.packages.length,
    relationshipCount: document.relationships.length,
  };
}

export function verifyReleaseSbomFile(
  filePath,
  { expectedPackage, expectedVersion } = {},
) {
  requireNonEmptyString(filePath, "SBOM path");
  const fileSize = statSync(filePath).size;
  if (fileSize <= 0) {
    throw new Error("SBOM file must not be empty.");
  }
  if (fileSize > MAX_SBOM_BYTES) {
    throw new Error(`SBOM file exceeds the ${MAX_SBOM_BYTES}-byte release limit.`);
  }

  const source = readFileSync(filePath, "utf8");
  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    throw new Error(`SBOM file is not valid JSON: ${error.message}`);
  }
  return validateReleaseSbomDocument(document, {
    expectedPackage,
    expectedVersion,
  });
}

export function parseReleaseSbomArguments(argv) {
  let filePath;
  let expectedPackage;
  let expectedVersion;

  for (const argument of argv) {
    if (argument.startsWith("--expected-package=")) {
      expectedPackage = argument.slice("--expected-package=".length);
    } else if (argument.startsWith("--expected-version=")) {
      expectedVersion = argument.slice("--expected-version=".length);
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (filePath) {
      throw new Error("Exactly one SBOM path is required.");
    } else {
      filePath = argument;
    }
  }

  requireNonEmptyString(filePath, "SBOM path");
  requireNonEmptyString(expectedPackage, "Expected package");
  requireNonEmptyString(expectedVersion, "Expected version");
  return { filePath, expectedPackage, expectedVersion };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseReleaseSbomArguments(process.argv.slice(2));
    const result = verifyReleaseSbomFile(options.filePath, options);
    console.log(
      `Release SBOM is valid (${result.packageCount} packages, ${result.relationshipCount} relationships).`,
    );
  } catch (error) {
    console.error(`Release SBOM verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
