import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  analyzeNpmLicenseFiles,
  analyzePackageLockLicenses,
  isLicenseExpressionAllowed,
  parseLicenseExpression,
  validateLicensePolicy,
} from "./check-npm-licenses.mjs";

const policy = {
  allowedLicenses: ["Apache-2.0", "MIT", "MPL-2.0"],
  packageExceptions: [],
  schemaVersion: 1,
};

function lockfileWith(license, overrides = {}) {
  return {
    lockfileVersion: 3,
    packages: {
      "": {
        license: "MIT",
        name: "fixture",
        version: "1.0.0",
      },
      "node_modules/example": {
        license,
        version: "2.0.0",
        ...overrides,
      },
    },
  };
}

test("npm license parser handles SPDX precedence, parentheses and exceptions", () => {
  assert.deepEqual(parseLicenseExpression("MIT OR Apache-2.0 AND MPL-2.0"), {
    left: { type: "license", value: "MIT" },
    right: {
      left: { type: "license", value: "Apache-2.0" },
      right: { type: "license", value: "MPL-2.0" },
      type: "and",
    },
    type: "or",
  });
  assert.equal(
    isLicenseExpressionAllowed(
      "(MIT OR Apache-2.0) AND MPL-2.0",
      policy.allowedLicenses,
    ),
    true,
  );
  assert.equal(
    isLicenseExpressionAllowed("Apache-2.0 WITH LLVM-exception", [
      "Apache-2.0 WITH LLVM-exception",
    ]),
    true,
  );
});

test("npm license policy accepts an allowed branch of OR but requires every AND branch", () => {
  assert.equal(isLicenseExpressionAllowed("MIT OR GPL-3.0-only", ["MIT"]), true);
  assert.equal(isLicenseExpressionAllowed("MIT AND GPL-3.0-only", ["MIT"]), false);
});

test("npm license policy fails closed for missing, malformed and disallowed metadata", () => {
  const missing = analyzePackageLockLicenses(
    lockfileWith(undefined),
    policy,
    "fixture-lock.json",
  );
  assert.match(missing.errors.join("\n"), /license metadata is missing/);

  const malformed = analyzePackageLockLicenses(
    lockfileWith("MIT / Apache-2.0"),
    policy,
    "fixture-lock.json",
  );
  assert.match(malformed.errors.join("\n"), /invalid license expression/);

  const disallowed = analyzePackageLockLicenses(
    lockfileWith("GPL-3.0-only"),
    policy,
    "fixture-lock.json",
  );
  assert.match(disallowed.errors.join("\n"), /license is not allowed by policy/);
});

test("npm license exceptions require an exact package, version and license with a reason", () => {
  const exceptionPolicy = {
    ...policy,
    packageExceptions: [
      {
        license: "LicenseRef-reviewed",
        package: "example",
        reason: "Reviewed upstream license file.",
        version: "2.0.0",
      },
    ],
  };
  assert.deepEqual(validateLicensePolicy(exceptionPolicy), []);
  assert.deepEqual(
    analyzePackageLockLicenses(
      lockfileWith("LicenseRef-reviewed"),
      exceptionPolicy,
      "fixture-lock.json",
    ).errors,
    [],
  );

  assert.match(
    validateLicensePolicy({
      ...exceptionPolicy,
      packageExceptions: [{ ...exceptionPolicy.packageExceptions[0], reason: "" }],
    }).join("\n"),
    /with a reason/,
  );
});

test("npm license policy rejects stale package exceptions", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-license-policy-"));
  const lockfilePath = join(directory, "package-lock.json");
  const policyPath = join(directory, "policy.json");
  writeFileSync(lockfilePath, JSON.stringify(lockfileWith("MIT")));
  writeFileSync(
    policyPath,
    JSON.stringify({
      ...policy,
      packageExceptions: [
        {
          license: "LicenseRef-reviewed",
          package: "not-installed",
          reason: "Fixture exception that must be reported as stale.",
          version: "1.0.0",
        },
      ],
    }),
  );

  try {
    assert.match(
      analyzeNpmLicenseFiles({
        lockfilePaths: [lockfilePath],
        policyPath,
      }).errors.join("\n"),
      /unused package exception/,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("checked-in npm lockfiles satisfy the reviewed dependency license policy", () => {
  const result = analyzeNpmLicenseFiles();
  assert.deepEqual(result.errors, []);
  assert.equal(result.lockfilesChecked, 2);
  assert.ok(result.packagesChecked > 250);
});
