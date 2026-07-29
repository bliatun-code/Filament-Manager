import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeExpectedArchitectures,
  normalizeMacosVersion,
  parseMacosDeploymentTargets,
  parseCodesignDetails,
  validateBundleExecutableEntry,
  validateBundleExecutableName,
  validateCodesignDetails,
  validateDmgAppEntry,
  validateDmgLayout,
  validateExpectedArchitectures,
  validateLocalCodesignDetails,
  validateMacosDeploymentTargets,
  validateReleaseMetadata,
} from "./verify-macos-release.mjs";

const expectedAppVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const localVerifierSource = readFileSync(
  new URL("./verify-macos-local.mjs", import.meta.url),
  "utf8",
);
const releaseVerifierSource = readFileSync(
  new URL("./verify-macos-release.mjs", import.meta.url),
  "utf8",
);

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

test("macOS local verifier requires an ad-hoc Hardened Runtime signature", () => {
  const localDetails = parseCodesignDetails(`
Identifier=no.bliatun.filamentmanager
Signature=adhoc
TeamIdentifier=not set
Runtime Version=27.0.0
`);
  assert.doesNotThrow(() => validateLocalCodesignDetails(localDetails));
  assert.throws(
    () => validateLocalCodesignDetails(parseCodesignDetails(validCodesignOutput)),
    /not ad-hoc signed/,
  );
  assert.throws(
    () =>
      validateLocalCodesignDetails({
        ...localDetails,
        runtime: false,
      }),
    /Hardened Runtime/,
  );
  for (const unexpectedDetail of [
    { authorities: ["Developer ID Application: Example"] },
    { teamIdentifier: "TEAM123456" },
    { timestamp: "14 Jul 2026 at 12:00:00" },
  ]) {
    assert.throws(
      () =>
        validateLocalCodesignDetails({
          ...localDetails,
          ...unexpectedDetail,
        }),
      /unexpectedly contains/,
    );
  }
});

test("macOS DMG verifier requires one app and the Applications install link", () => {
  assert.equal(
    validateDmgLayout({
      appNames: ["Filament Manager.app"],
      applicationsTarget: "/Applications",
    }),
    "Filament Manager.app",
  );
  assert.throws(
    () => validateDmgLayout({ appNames: [], applicationsTarget: "/Applications" }),
    /one app bundle/,
  );
  assert.throws(
    () =>
      validateDmgLayout({
        appNames: ["Filament Manager.app"],
        applicationsTarget: undefined,
      }),
    /Applications link/,
  );
});

test("macOS DMG verifier rejects linked and non-directory app entries", () => {
  assert.doesNotThrow(() =>
    validateDmgAppEntry({ isDirectory: true, isSymbolicLink: false }),
  );
  assert.throws(
    () => validateDmgAppEntry({ isDirectory: false, isSymbolicLink: true }),
    /real directory/,
  );
  assert.throws(
    () => validateDmgAppEntry({ isDirectory: false, isSymbolicLink: false }),
    /real directory/,
  );
});

test("macOS verifier keeps the main executable inside Contents/MacOS", () => {
  assert.equal(
    validateBundleExecutableName("bambu-filament-manager"),
    "bambu-filament-manager",
  );
  for (const invalidName of [
    "../outside",
    "folder/executable",
    "folder\\executable",
    ".",
    "..",
    " executable",
    "executable\nnext",
  ]) {
    assert.throws(() => validateBundleExecutableName(invalidName), /safe filename/);
  }
  assert.doesNotThrow(() =>
    validateBundleExecutableEntry({ isFile: true, isSymbolicLink: false }),
  );
  assert.throws(
    () => validateBundleExecutableEntry({ isFile: false, isSymbolicLink: true }),
    /real file/,
  );
  assert.throws(
    () => validateBundleExecutableEntry({ isFile: false, isSymbolicLink: false }),
    /real file/,
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

test("macOS verifier CLI usage advertises the Universal 2 contract", () => {
  for (const source of [localVerifierSource, releaseVerifierSource]) {
    assert.match(source, /--architectures=arm64,x86_64/);
  }
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
        CFBundleShortVersionString: expectedAppVersion,
        CFBundleVersion: expectedAppVersion,
        LSMinimumSystemVersion: "11.0",
        NSCameraUsageDescription: "Scan filament labels.",
        NSLocalNetworkUsageDescription: "Connect to printers.",
      },
    }),
    {
      appVersion: expectedAppVersion,
      bundleId: "no.bliatun.filamentmanager",
      executableName: "bambu-filament-manager",
      minimumSystemVersion: "11.0",
    },
  );
});

test("macOS release verifier rejects missing entitlements and privacy strings", () => {
  assert.throws(
    () =>
      validateReleaseMetadata({
        entitlements: {},
        infoPlist: {
          CFBundleShortVersionString: expectedAppVersion,
          CFBundleVersion: expectedAppVersion,
          CFBundleIdentifier: "no.bliatun.filamentmanager",
          LSMinimumSystemVersion: "11.0",
        },
      }),
    /device\.camera/,
  );
});

test("macOS release verifier rejects debug and App Sandbox entitlements", () => {
  const requiredEntitlements = {
    "com.apple.security.device.camera": true,
    "com.apple.security.network.client": true,
    "com.apple.security.network.server": true,
  };
  const infoPlist = {
    CFBundleExecutable: "bambu-filament-manager",
    CFBundleIdentifier: "no.bliatun.filamentmanager",
    CFBundleShortVersionString: expectedAppVersion,
    CFBundleVersion: expectedAppVersion,
    LSMinimumSystemVersion: "11.0",
    NSCameraUsageDescription: "Scan filament labels.",
    NSLocalNetworkUsageDescription: "Connect to printers.",
  };

  for (const forbiddenEntitlement of [
    "com.apple.security.app-sandbox",
    "com.apple.security.get-task-allow",
  ]) {
    assert.throws(
      () =>
        validateReleaseMetadata({
          entitlements: {
            ...requiredEntitlements,
            [forbiddenEntitlement]: true,
          },
          infoPlist,
        }),
      new RegExp(forbiddenEntitlement.replaceAll(".", "\\.")),
    );
  }
});

test("macOS verifier rejects app version drift", () => {
  assert.throws(
    () =>
      validateReleaseMetadata({
        entitlements: {
          "com.apple.security.device.camera": true,
          "com.apple.security.network.client": true,
          "com.apple.security.network.server": true,
        },
        expectedAppVersion,
        infoPlist: {
          CFBundleExecutable: "bambu-filament-manager",
          CFBundleIdentifier: "no.bliatun.filamentmanager",
          CFBundleShortVersionString: "mismatched-version",
          CFBundleVersion: expectedAppVersion,
          LSMinimumSystemVersion: "11.0",
          NSCameraUsageDescription: "Scan filament labels.",
          NSLocalNetworkUsageDescription: "Connect to printers.",
        },
      }),
    /CFBundleShortVersionString .* found mismatched-version/,
  );
});

test("macOS release verifier enforces bundle and Mach-O deployment targets", () => {
  const otoolOutput = `
Load command 10
      cmd LC_BUILD_VERSION
  cmdsize 32
 platform 1
    minos 11.0
      sdk 26.5
Load command 11
      cmd LC_VERSION_MIN_MACOSX
  cmdsize 16
  version 11.0
      sdk 15.0
`;

  assert.equal(normalizeMacosVersion("11"), "11.0.0");
  assert.equal(normalizeMacosVersion("11.0"), "11.0.0");
  assert.deepEqual(parseMacosDeploymentTargets(otoolOutput), ["11.0"]);
  assert.deepEqual(validateMacosDeploymentTargets(["11.0"], "11"), ["11.0"]);
  assert.throws(
    () => validateMacosDeploymentTargets(["10.13"], "11.0"),
    /Expected macOS deployment target 11\.0, found 10\.13/,
  );
  assert.throws(
    () => validateMacosDeploymentTargets(["11.0", "10.13"], "11.0"),
    /Expected macOS deployment target 11\.0, found 10\.13/,
  );
  assert.throws(
    () =>
      validateReleaseMetadata({
        entitlements: {
          "com.apple.security.device.camera": true,
          "com.apple.security.network.client": true,
          "com.apple.security.network.server": true,
        },
        expectedMinimumSystemVersion: "11.0",
        infoPlist: {
          CFBundleExecutable: "bambu-filament-manager",
          CFBundleIdentifier: "no.bliatun.filamentmanager",
          LSMinimumSystemVersion: "10.13",
          NSCameraUsageDescription: "Scan filament labels.",
          NSLocalNetworkUsageDescription: "Connect to printers.",
        },
      }),
    /Expected LSMinimumSystemVersion 11\.0, found 10\.13/,
  );
});
