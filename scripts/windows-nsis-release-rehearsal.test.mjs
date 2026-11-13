import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import test from "node:test";
import {
  prepareNsisRehearsalConfig,
  selectNsisRehearsalVersion,
} from "./prepare-windows-nsis-rehearsal.mjs";

const workflow = readFileSync(".github/workflows/windows-nsis-release-rehearsal.yml", "utf8");
const smoke = readFileSync("scripts/smoke-windows-msi.ps1", "utf8");
const verify = readFileSync("scripts/verify-windows-nsis-rehearsal.ps1", "utf8");
const sourceTags = ["v0.35.0", "v0.33.0", "v0.35.1", "v0.34.0"];

test("NSIS rehearsal uses a greater candidate version without mutating the released version", () => {
  assert.equal(selectNsisRehearsalVersion("0.35.1", sourceTags), "0.35.2-rc.1");
  assert.equal(selectNsisRehearsalVersion("0.35.10", sourceTags), "0.35.10");
  assert.equal(selectNsisRehearsalVersion("0.36.0", sourceTags), "0.36.0");
  assert.throws(() => selectNsisRehearsalVersion("0.35.0", sourceTags), /older than/);
  assert.throws(() => selectNsisRehearsalVersion("0.35.1-rc.1", sourceTags), /stable Windows version/);
  assert.throws(() => selectNsisRehearsalVersion("0.35.1", []), /pinned MSI/);
  assert.throws(() => selectNsisRehearsalVersion("0.35.1", ["0.35.0"]), /pinned MSI/);
  assert.throws(() => selectNsisRehearsalVersion("0.35.65535", ["v0.35.65535"]), /Bump the package version/);
});

test("temporary configuration uses the per-user migration template, hooks, and downgrade policy", () => {
  const installerConfig = {
    bundle: {
      windows: {
        allowDowngrades: false,
        nsis: {
          installMode: "currentUser",
          installerHooks: "../scripts/test-hooks.nsh",
          template: "../scripts/test-template.nsi",
          startMenuFolder: "Filament Manager",
        },
      },
    },
  };
  const snapshot = structuredClone(installerConfig);
  const override = prepareNsisRehearsalConfig("0.35.1", sourceTags, installerConfig);
  const { nsis } = override.bundle.windows;
  assert.equal(override.version, "0.35.2-rc.1");
  assert.equal(override.bundle.windows.allowDowngrades, false);
  assert.equal(nsis.installMode, "currentUser");
  assert.equal(nsis.startMenuFolder, "Filament Manager");
  assert.ok(isAbsolute(nsis.installerHooks));
  assert.ok(isAbsolute(nsis.template));
  assert.deepEqual(installerConfig, snapshot);
  assert.throws(() => prepareNsisRehearsalConfig("0.35.1", sourceTags, {}), /per-user migration hooks/);
  installerConfig.bundle.windows.allowDowngrades = true;
  assert.throws(() => prepareNsisRehearsalConfig("0.35.1", sourceTags, installerConfig), /downgrades to be disabled/);
  delete installerConfig.bundle.windows.allowDowngrades;
  assert.throws(() => prepareNsisRehearsalConfig("0.35.1", sourceTags, installerConfig), /downgrades to be disabled/);
});

test("NSIS candidate builds from manual main or a scoped PR without release permissions", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\n  pull_request:\n    branches: \[main\]\n    paths:/m);
  assert.match(workflow, /if: github\.event_name == 'pull_request' \|\| github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(workflow, /^  push:|^\s+\w[^:]*: write|gh release|attestations:|github-release/m);
  assert.match(workflow, /build --bundles nsis --target x86_64-pc-windows-msvc/);
  assert.doesNotMatch(workflow, /build .*--debug/);
  assert.match(workflow, /target\/x86_64-pc-windows-msvc\/release\/bundle\/nsis/);
});

test("both fresh-profile gates download and verify the same NSIS installer and payload", () => {
  assert.match(workflow, /gate: \[packaged, migration\]/);
  assert.equal((workflow.match(/name: filament-manager-nsis-rehearsal-\$\{\{ github\.run_id \}\}/g) ?? []).length, 2);
  assert.match(workflow, /needs\.build-candidate\.outputs\.installer-sha256/);
  assert.match(workflow, /needs\.build-candidate\.outputs\.payload-sha256/);
  assert.match(workflow, /Reverify the downloaded installer and payload[\s\S]*Test clean installation[\s\S]*Test migration/);
  assert.match(verify, /Get-AuthenticodeSignature[\s\S]*NotSigned/);
  assert.match(verify, /0x8664[\s\S]*0x20b/);
  assert.match(verify, /requestedExecutionLevel[\s\S]*asInvoker/);
  assert.match(verify, /ExpectedInstallerSha256[\s\S]*Assert-X64Application -Path \$payload/);
});

test("NSIS release rehearsals reuse the installed Windows historical, mutating and lifecycle gates", () => {
  assert.match(workflow, /uses: \.\/\.github\/actions\/prepare-release-fixtures/);
  assert.match(workflow, /prepare-previous-release-upgrade-fixture\.mjs --verify/);
  assert.match(workflow, /-NsisPath "\$env:NSIS_INSTALLER"/);
  assert.match(workflow, /-SignaturePolicy "UnsignedRequired"/);
  assert.match(workflow, /-UpgradeSourceRelease "v0\.28\.0"/);
  assert.match(workflow, /-CompatibilityFixturePath .*v0\.30\.0\.db/);
  assert.match(workflow, /-RunPackagedDesktopE2E[\s\S]*-RunPackagedHostClientE2E/);
  assert.match(workflow, /smoke-windows-nsis-pilot\.ps1[\s\S]*-SourceVersion "v0\.35\.1"/);
  assert.match(smoke, /if \(\$isNsis\) \{\s*Invoke-NsisInstaller -Executable \$resolvedInstallerPath/);
  assert.match(smoke, /if \(\$isNsis\) \{\s*Invoke-NsisInstaller -Executable \$nsisUninstallerPath/);
  assert.match(smoke, /\$databaseHashAfterUninstall,[\s\S]*\$databaseHashBeforeUninstall/);
  const diagnostics = workflow.split("      - name: Upload rehearsal diagnostics").at(-1);
  assert.match(diagnostics, /nsis-rehearsal-smoke\/\*\.log/);
  assert.doesNotMatch(diagnostics, /nsis-rehearsal-smoke\s*$|\*\*/m);
});
