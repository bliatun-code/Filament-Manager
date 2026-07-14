import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeExpectedArchitectures,
  parseCodesignDetails,
  validateCodesignDetails,
  validateExpectedArchitectures,
  validateReleaseMetadata,
} from "./verify-macos-release.mjs";

const validCodesignOutput = `
Identifier=no.bliatun.filamentmanager
Authority=Developer ID Application: Example AS (TEAM123456)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Timestamp=14 Jul 2026 at 12:00:00
TeamIdentifier=TEAM123456
Runtime Version=26.5.0
`;

test("macOS release verifier parses Developer ID signature details", () => {
  assert.deepEqual(parseCodesignDetails(validCodesignOutput), {
    authorities: [
      "Developer ID Application: Example AS (TEAM123456)",
      "Developer ID Certification Authority",
      "Apple Root CA",
    ],
    identifier: "no.bliatun.filamentmanager",
    runtime: true,
    teamIdentifier: "TEAM123456",
    timestamp: "14 Jul 2026 at 12:00:00",
  });
});

test("macOS release verifier accepts an expected Developer ID signature", () => {
  assert.doesNotThrow(() =>
    validateCodesignDetails(parseCodesignDetails(validCodesignOutput), {
      expectedBundleId: "no.bliatun.filamentmanager",
      expectedTeamId: "TEAM123456",
    }),
  );
});

test("macOS release verifier rejects ad-hoc or incomplete signatures", () => {
  assert.throws(
    () =>
      validateCodesignDetails({
        authorities: [],
        identifier: "no.bliatun.filamentmanager",
        runtime: false,
        signature: "adhoc",
      }),
    /Developer ID Application/,
  );
});

test("macOS release verifier normalizes architecture expectations", () => {
  assert.deepEqual(normalizeExpectedArchitectures("x86_64, arm64 arm64"), [
    "arm64",
    "x86_64",
  ]);
  assert.deepEqual(normalizeExpectedArchitectures(["x86_64", "arm64", "arm64"]), [
    "arm64",
    "x86_64",
  ]);
});

test("macOS release verifier requires an exact architecture contract", () => {
  assert.deepEqual(validateExpectedArchitectures("arm64 x86_64", ["x86_64", "arm64"]), [
    "arm64",
    "x86_64",
  ]);
  assert.throws(() => validateExpectedArchitectures("arm64 x86_64", ["arm64"]), /Expected/);
  assert.throws(() => validateExpectedArchitectures("arm64", []), /required/);
});

test("macOS release verifier reads dotted entitlement names as literal keys", () => {
  assert.deepEqual(
    validateReleaseMetadata({
      entitlements: {
        "com.apple.security.device.camera": true,
        "com.apple.security.network.client": true,
        "com.apple.security.network.server": true,
      },
      infoPlist: {
        CFBundleExecutable: "bambu-filament-manager",
        CFBundleIdentifier: "no.bliatun.filamentmanager",
        NSCameraUsageDescription: "Scan filament labels.",
        NSLocalNetworkUsageDescription: "Connect to printers.",
      },
    }),
    {
      bundleId: "no.bliatun.filamentmanager",
      executableName: "bambu-filament-manager",
    },
  );
});

test("macOS release verifier rejects missing entitlements and privacy strings", () => {
  assert.throws(
    () =>
      validateReleaseMetadata({
        entitlements: {},
        infoPlist: { CFBundleIdentifier: "no.bliatun.filamentmanager" },
      }),
    /device\.camera/,
  );
});
