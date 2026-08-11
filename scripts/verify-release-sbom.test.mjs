import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  parseReleaseSbomArguments,
  validateReleaseSbomDocument,
  verifyReleaseSbomFile,
} from "./verify-release-sbom.mjs";

const EXPECTED_PACKAGE = "bambu-filament-manager";
const EXPECTED_VERSION = "0.25.0";

function validDocument() {
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: "bambu-filament-manager-dir",
    documentNamespace:
      "https://anchore.com/syft/dir/bambu-filament-manager-5bbec2b5-9fa0-4aca-a0b4-e84c79535f08",
    creationInfo: {
      created: "2026-07-22T12:00:00Z",
      creators: ["Organization: Anchore, Inc", "Tool: syft-1.42.3"],
    },
    packages: [
      {
        name: "repository-root",
        SPDXID: "SPDXRef-DocumentRoot-Directory-repository",
        downloadLocation: "NOASSERTION",
      },
      {
        name: EXPECTED_PACKAGE,
        SPDXID: "SPDXRef-Package-npm-bambu-filament-manager",
        versionInfo: EXPECTED_VERSION,
        downloadLocation: "NOASSERTION",
      },
      {
        name: "serde",
        SPDXID: "SPDXRef-Package-cargo-serde",
        versionInfo: "1.0.228",
        downloadLocation: "NOASSERTION",
      },
    ],
    relationships: [
      {
        spdxElementId: "SPDXRef-DOCUMENT",
        relationshipType: "DESCRIBES",
        relatedSpdxElement: "SPDXRef-DocumentRoot-Directory-repository",
      },
      {
        spdxElementId: "SPDXRef-DocumentRoot-Directory-repository",
        relationshipType: "CONTAINS",
        relatedSpdxElement: "SPDXRef-Package-npm-bambu-filament-manager",
      },
      {
        spdxElementId: "SPDXRef-Package-npm-bambu-filament-manager",
        relationshipType: "DEPENDS_ON",
        relatedSpdxElement: "SPDXRef-Package-cargo-serde",
      },
    ],
  };
}

function validate(document) {
  return validateReleaseSbomDocument(document, {
    expectedPackage: EXPECTED_PACKAGE,
    expectedVersion: EXPECTED_VERSION,
  });
}

test("validates a sanitized Syft SPDX source dependency SBOM", () => {
  assert.deepEqual(validate(validDocument()), {
    packageCount: 3,
    relationshipCount: 3,
  });
});

test("requires the pinned SPDX shape and Syft creator", () => {
  for (const mutate of [
    (document) => {
      document.spdxVersion = "SPDX-2.2";
    },
    (document) => {
      document.dataLicense = "NOASSERTION";
    },
    (document) => {
      document.SPDXID = "SPDXRef-Other";
    },
    (document) => {
      document.documentNamespace = "relative-namespace";
    },
    (document) => {
      document.creationInfo.creators = ["Tool: another-generator"];
    },
  ]) {
    const document = validDocument();
    mutate(document);
    assert.throws(() => validate(document));
  }
});

test("requires a non-empty, uniquely identified package inventory", () => {
  const empty = validDocument();
  empty.packages = [];
  assert.throws(() => validate(empty), /packages must be a non-empty array/);

  const duplicate = validDocument();
  duplicate.packages[2].SPDXID = duplicate.packages[1].SPDXID;
  assert.throws(() => validate(duplicate), /duplicate package SPDXID/);

  const invalidId = validDocument();
  invalidId.packages[1].SPDXID = "Package with spaces";
  assert.throws(() => validate(invalidId), /invalid SPDXID/);
});

test("fails closed when the release package or version is absent", () => {
  const wrongVersion = validDocument();
  wrongVersion.packages[1].versionInfo = "0.21.1";
  assert.throws(() => validate(wrongVersion), /expected version 0\.25\.0/);

  const wrongPackage = validDocument();
  wrongPackage.packages[1].name = "another-package";
  assert.throws(() => validate(wrongPackage), /bambu-filament-manager/);
});

test("requires the document to describe the expected release package", () => {
  const document = validDocument();
  document.relationships[1].relatedSpdxElement = "SPDXRef-Package-cargo-serde";
  assert.throws(() => validate(document), /root must include bambu-filament-manager/);
});

test("rejects private build paths and credential material anywhere in the SBOM", () => {
  const forbiddenValues = [
    ["", "Users", "private-user", "project", "package.json"].join("/"),
    "https://anchore.com/syft/dir/Users/private-user/project/package.json", // public-readiness-allow: deliberate private-path rejection fixture; path-portability-allow: validator fixture
    "/home/runner/work/repository/repository/Cargo.lock", // path-portability-allow: intentional runner-path rejection fixture
    "https://anchore.com/syft/dir/home/runner/work/repository/Cargo.lock", // path-portability-allow: intentional runner-path rejection fixture
    ["C:", "Users", "private-user", "project", "package-lock.json"].join("\\"),
    "https://example.invalid/%2FUsers%2Fprivate-user%2Fproject",
    ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
    `ghp_${"a".repeat(36)}`,
  ];

  for (const forbiddenValue of forbiddenValues) {
    const document = validDocument();
    document.packages[2].sourceInfo = forbiddenValue;
    assert.throws(() => validate(document), /SBOM contains/);
  }
});

test("reads and validates a release SBOM file", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "release-sbom-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sbomPath = join(directory, "release.spdx.json");
  writeFileSync(sbomPath, `${JSON.stringify(validDocument())}\n`);

  assert.deepEqual(
    verifyReleaseSbomFile(sbomPath, {
      expectedPackage: EXPECTED_PACKAGE,
      expectedVersion: EXPECTED_VERSION,
    }),
    { packageCount: 3, relationshipCount: 3 },
  );

  writeFileSync(sbomPath, "not-json\n");
  assert.throws(
    () =>
      verifyReleaseSbomFile(sbomPath, {
        expectedPackage: EXPECTED_PACKAGE,
        expectedVersion: EXPECTED_VERSION,
      }),
    /not valid JSON/,
  );
});

test("parses only the explicit release validator CLI contract", () => {
  assert.deepEqual(
    parseReleaseSbomArguments([
      "release.spdx.json",
      `--expected-package=${EXPECTED_PACKAGE}`,
      `--expected-version=${EXPECTED_VERSION}`,
    ]),
    {
      filePath: "release.spdx.json",
      expectedPackage: EXPECTED_PACKAGE,
      expectedVersion: EXPECTED_VERSION,
    },
  );
  assert.throws(
    () => parseReleaseSbomArguments(["one.json", "two.json"]),
    /Exactly one SBOM path/,
  );
  assert.throws(
    () => parseReleaseSbomArguments(["one.json", "--unexpected=true"]),
    /Unknown option/,
  );
});

test("CLI exits nonzero for an invalid SBOM", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "release-sbom-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sbomPath = join(directory, "release.spdx.json");
  writeFileSync(sbomPath, "{}\n");

  const result = spawnSync(
    process.execPath,
    [
      "./scripts/verify-release-sbom.mjs",
      sbomPath,
      `--expected-package=${EXPECTED_PACKAGE}`,
      `--expected-version=${EXPECTED_VERSION}`,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Release SBOM verification failed/);
});
