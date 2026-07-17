import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const releaseWorkflow = readFileSync(".github/workflows/release-build.yml", "utf8");
const signedMacosWorkflow = readFileSync(
  ".github/workflows/macos-signed-release.yml",
  "utf8",
);

function readSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing workflow section: ${startMarker.trim()}`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (endMarker) {
    assert.notEqual(end, -1, `Missing workflow section: ${endMarker.trim()}`);
  }
  return source.slice(start, end === -1 ? undefined : end);
}

function assertStepOrder(source, stepNames) {
  const positions = stepNames.map((stepName) => {
    const position = source.indexOf(`- name: ${stepName}`);
    assert.notEqual(position, -1, `Missing workflow step: ${stepName}`);
    return position;
  });

  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
}

test("release workflow delegates macOS artifacts to the protected signed workflow", () => {
  const validationJob = readSection(
    releaseWorkflow,
    "  validate-release:",
    "  build-macos-dmg:",
  );
  const macosJob = readSection(
    releaseWorkflow,
    "  build-macos-dmg:",
    "  build-windows-msi:",
  );
  const windowsJob = readSection(releaseWorkflow, "  build-windows-msi:");

  assert.match(releaseWorkflow, /tags:\s*\n\s*- "v\*"/);
  assert.match(releaseWorkflow, /confirm_macos_notarization:/);
  assert.match(validationJob, /npm run check:version/);
  assert.match(validationJob, /"\$SELECTED_PLATFORM" != "windows"/);
  assert.match(validationJob, /"\$CONFIRM_MACOS_NOTARIZATION" != "true"/);
  assert.match(validationJob, /Manual macOS release builds require notarization confirmation/);
  assert.match(validationJob, /git merge-base --is-ancestor HEAD refs\/remotes\/origin\/main/);
  assert.match(macosJob, /needs: validate-release/);
  assert.match(macosJob, /uses: \.\/\.github\/workflows\/macos-signed-release\.yml/);
  assert.match(macosJob, /confirm_notarization: true/);
  assert.doesNotMatch(releaseWorkflow, /npm run tauri -- build --bundles dmg/);
  assert.match(windowsJob, /needs: validate-release/);
  assert.match(windowsJob, /runs-on: windows-latest/);
  assert.match(windowsJob, /Build MSI bundle/);
  assert.match(windowsJob, /name: filament-manager-windows-msi-\$\{\{ github\.ref_name \}\}/);
  assert.match(windowsJob, /path: target\/release\/bundle\/msi\/\*\.msi/);
  assert.match(windowsJob, /retention-days: 14/);
});

test("signed macOS workflow remains manual and is reusable by tagged releases", () => {
  const signedJob = readSection(signedMacosWorkflow, "  build-signed-macos-dmg:");

  assert.match(signedMacosWorkflow, /^name: Signed macOS DMG$/m);
  assert.match(signedMacosWorkflow, /workflow_call:/);
  assert.match(signedMacosWorkflow, /workflow_dispatch:/);
  assert.match(signedJob, /if: inputs\.confirm_notarization/);
  assert.match(signedJob, /environment: macos-release/);
  assert.match(signedJob, /runs-on: macos-15/);
  assert.match(signedMacosWorkflow, /permissions:\s*\n\s*contents: read/);
  assert.match(signedJob, /FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING: "1"/);
  assert.match(signedJob, /xcrun notarytool submit "\$FILAMENT_MANAGER_DMG_PATH"/);
  assert.match(signedJob, /--wait/);
  assert.match(signedJob, /xcrun stapler staple "\$FILAMENT_MANAGER_DMG_PATH"/);
  assert.match(signedJob, /xcrun stapler validate "\$FILAMENT_MANAGER_DMG_PATH"/);
  assert.match(signedJob, /npm run verify:macos-release -- "\$FILAMENT_MANAGER_DMG_PATH" --architectures=arm64/);
  assert.match(signedJob, /shasum -a 256 "\$dmg_name" > SHA256SUMS\.txt/);
  assert.match(
    signedJob,
    /name: filament-manager-macos-dmg-\$\{\{ github\.ref_name \}\}/,
  );
  assert.match(signedJob, /bundle\/dmg\/\*\.dmg/);
  assert.match(signedJob, /bundle\/dmg\/SHA256SUMS\.txt/);
  assert.match(signedJob, /if-no-files-found: error/);
  assert.match(signedJob, /retention-days: 14/);
  assert.match(signedJob, /normalized_name="\$\{original_name\/\/ \/-\}"/);
  assert.match(
    signedJob,
    /- name: Remove Apple credentials\s*\n\s*if: always\(\)/,
  );

  assertStepOrder(signedJob, [
    "Build signed and notarized DMG",
    "Normalize DMG filename",
    "Notarize and staple final DMG",
    "Verify signed release",
    "Write DMG checksum",
    "Upload verified DMG artifact",
    "Remove Apple credentials",
  ]);
});
