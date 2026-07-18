import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const releaseWorkflow = readFileSync(".github/workflows/release-build.yml", "utf8");
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");

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

test("release workflow gates tag and manual installer builds", () => {
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
  assert.match(validationJob, /npm run check:path-portability/);
  assert.match(validationJob, /npm run check:command-portability/);
  assert.match(
    validationJob,
    /node --test \.\/scripts\/release-workflow-contract\.test\.mjs/,
  );
  assert.match(validationJob, /"\$SELECTED_PLATFORM" != "windows"/);
  assert.match(validationJob, /"\$CONFIRM_MACOS_NOTARIZATION" != "true"/);
  assert.match(validationJob, /Manual macOS release builds require notarization confirmation/);
  assert.match(validationJob, /git merge-base --is-ancestor HEAD refs\/remotes\/origin\/main/);
  assert.match(macosJob, /needs: validate-release/);
  assert.match(
    macosJob,
    /if: github\.event_name == 'push' \|\| github\.event\.inputs\.platform == 'both' \|\| github\.event\.inputs\.platform == 'macos'/,
  );
  assert.match(windowsJob, /needs: validate-release/);
  assert.match(
    windowsJob,
    /if: github\.event_name == 'push' \|\| github\.event\.inputs\.platform == 'both' \|\| github\.event\.inputs\.platform == 'windows'/,
  );
  assert.match(windowsJob, /runs-on: windows-latest/);
  assert.match(
    windowsJob,
    /run: node \.\/scripts\/normalize-msi-version\.mjs/,
  );
  assert.doesNotMatch(windowsJob, /shell:\s*bash/);
  assert.doesNotMatch(windowsJob, /BASH_REMATCH|<<'NODE'/);
  assert.match(windowsJob, /Build MSI bundle/);
  assert.match(windowsJob, /name: filament-manager-windows-msi-\$\{\{ github\.ref_name \}\}/);
  assert.match(windowsJob, /path: target\/release\/bundle\/msi\/\*\.msi/);
  assert.match(windowsJob, /retention-days: 14/);
  assert.match(
    windowsJob,
    /- name: Install root dependencies\s+run: npm ci/,
  );
  assert.match(
    windowsJob,
    /- name: Install UI dependencies\s+run: npm --prefix \.\/ui ci/,
  );

  assertStepOrder(windowsJob, [
    "Install root dependencies",
    "Install UI dependencies",
    "Normalize prerelease version for MSI",
    "Build MSI bundle",
    "Upload MSI artifact",
  ]);
});

test("Windows CI runs separate builtin portability contracts before toolchain setup", () => {
  const windowsJob = readSection(ciWorkflow, "  windows-smoke:");

  assert.match(
    windowsJob,
    /- name: Run static path portability contract\s+run: npm run check:path-portability/,
  );
  assert.match(
    windowsJob,
    /- name: Run static command portability contract\s+run: npm run check:command-portability/,
  );
  assertStepOrder(windowsJob, [
    "Setup Node",
    "Run static path portability contract",
    "Run static command portability contract",
    "Setup Rust",
    "Install root dependencies",
    "Run portability checks",
    "Run full verification",
  ]);
});

test("release workflow keeps the protected macOS signing sequence fail-closed", () => {
  const macosJob = readSection(
    releaseWorkflow,
    "  build-macos-dmg:",
    "  build-windows-msi:",
  );

  assert.equal(existsSync(".github/workflows/macos-signed-release.yml"), false);
  assert.doesNotMatch(releaseWorkflow, /macos-signed-release\.yml/);
  assert.match(releaseWorkflow, /permissions:\s*\n\s*contents: read/);
  assert.match(macosJob, /environment: macos-release/);
  assert.match(macosJob, /runs-on: macos-15/);
  assert.match(macosJob, /- name: Prepare Apple credentials/);
  assert.match(macosJob, /APPLE_API_ISSUER: \$\{\{ secrets\.APPLE_API_ISSUER \}\}/);
  assert.match(macosJob, /APPLE_API_PRIVATE_KEY: \$\{\{ secrets\.APPLE_API_PRIVATE_KEY \}\}/);
  assert.match(macosJob, /APPLE_CERTIFICATE: \$\{\{ secrets\.APPLE_CERTIFICATE \}\}/);
  assert.match(macosJob, /APPLE_TEAM_ID: \$\{\{ secrets\.APPLE_TEAM_ID \}\}/);
  assert.match(macosJob, /FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING: "1"/);
  assert.match(macosJob, /npm run tauri -- build --bundles dmg/);
  assert.match(macosJob, /xcrun notarytool submit "\$FILAMENT_MANAGER_DMG_PATH"/);
  assert.match(macosJob, /--wait/);
  assert.match(macosJob, /xcrun stapler staple "\$FILAMENT_MANAGER_DMG_PATH"/);
  assert.match(macosJob, /xcrun stapler validate "\$FILAMENT_MANAGER_DMG_PATH"/);
  assert.match(macosJob, /npm run verify:macos-release -- "\$FILAMENT_MANAGER_DMG_PATH" --architectures=arm64/);
  assert.match(macosJob, /shasum -a 256 "\$dmg_name" > SHA256SUMS\.txt/);
  assert.match(
    macosJob,
    /name: filament-manager-macos-dmg-\$\{\{ github\.ref_name \}\}/,
  );
  assert.match(macosJob, /bundle\/dmg\/\*\.dmg/);
  assert.match(macosJob, /bundle\/dmg\/SHA256SUMS\.txt/);
  assert.match(macosJob, /if-no-files-found: error/);
  assert.match(macosJob, /retention-days: 14/);
  assert.match(macosJob, /normalized_name="\$\{original_name\/\/ \/-\}"/);
  assert.match(
    macosJob,
    /- name: Remove Apple credentials\s*\n\s*if: always\(\)/,
  );

  assertStepOrder(macosJob, [
    "Build signed and notarized DMG",
    "Normalize DMG filename",
    "Notarize and staple final DMG",
    "Verify signed release",
    "Write DMG checksum",
    "Upload verified DMG artifact",
    "Remove Apple credentials",
  ]);
});
