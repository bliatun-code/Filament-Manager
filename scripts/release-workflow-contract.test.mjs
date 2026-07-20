import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const releaseWorkflow = readFileSync(".github/workflows/release-build.yml", "utf8");
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const windowsWixTemplate = readFileSync("src-tauri/wix/per-user.wxs", "utf8");

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

function countOccurrences(source, value) {
  return source.split(value).length - 1;
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
  const windowsJob = readSection(
    releaseWorkflow,
    "  build-windows-msi:",
    "  publish-github-release:",
  );
  const publishJob = readSection(releaseWorkflow, "  publish-github-release:");

  assert.match(releaseWorkflow, /tags:\s*\n\s*- "v\*"/);
  assert.match(releaseWorkflow, /confirm_macos_notarization:/);
  assert.match(validationJob, /npm run check:version/);
  assert.match(validationJob, /npm run check:msi-version/);
  assert.match(validationJob, /npm run check:path-portability/);
  assert.match(validationJob, /npm run check:command-portability/);
  assert.match(
    validationJob,
    /node --test \.\/scripts\/release-workflow-contract\.test\.mjs/,
  );
  assert.match(validationJob, /"\$SELECTED_PLATFORM" != "windows"/);
  assert.match(validationJob, /"\$GITHUB_EVENT_NAME" == "push"/);
  assert.match(validationJob, /"\$SELECTED_PLATFORM" == "windows"/);
  assert.match(validationJob, /"\$SELECTED_PLATFORM" == "both"/);
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
    /- name: Prepare MSI version override\s+env:\s+MSI_VERSION_CONFIG_PATH: \$\{\{ runner\.temp \}\}\/filament-manager-msi-version\.json\s+run: node \.\/scripts\/normalize-msi-version\.mjs --output "\$env:MSI_VERSION_CONFIG_PATH"/,
  );
  assert.match(
    windowsJob,
    /- name: Verify MSI preparation leaves manifests unchanged\s+run: git diff --exit-code -- src-tauri\/tauri\.conf\.json src-tauri\/Cargo\.toml/,
  );
  assert.match(
    windowsJob,
    /- name: Build MSI bundle\s+env:\s+MSI_VERSION_CONFIG_PATH: \$\{\{ runner\.temp \}\}\/filament-manager-msi-version\.json\s+run: npm run tauri -- build --bundles msi --config "\$env:MSI_VERSION_CONFIG_PATH"/,
  );
  assert.doesNotMatch(
    windowsJob,
    /run: node \.\/scripts\/normalize-msi-version\.mjs\s*$/m,
  );
  assert.doesNotMatch(windowsJob, /shell:\s*bash/);
  assert.doesNotMatch(windowsJob, /BASH_REMATCH|<<'NODE'/);
  assert.match(windowsJob, /Build MSI bundle/);
  assert.match(
    windowsJob,
    /- name: Verify MSI bundle and write checksum\s+shell: pwsh\s+env:\s+MSI_VERSION_CONFIG_PATH: \$\{\{ runner\.temp \}\}\/filament-manager-msi-version\.json\s+run: \|/,
  );
  assert.match(windowsJob, /\.\/scripts\/verify-windows-msi\.ps1/);
  assert.match(windowsJob, /-MsiDirectory "target\/release\/bundle\/msi"/);
  assert.match(windowsJob, /-ExpectedProductName \$tauriConfig\.productName/);
  assert.match(
    windowsJob,
    /-ExpectedProductVersion \$msiVersionConfig\.bundle\.windows\.wix\.version/,
  );
  assert.match(windowsJob, /-ExpectedArchitecture "x64"/);
  assert.match(
    windowsJob,
    /name: filament-manager-windows-msi-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(
    windowsJob,
    /- name: Upload verified MSI artifact[\s\S]*?if-no-files-found: error\s+overwrite: true\s+retention-days: 14/,
  );
  assert.doesNotMatch(
    windowsJob,
    /name: filament-manager-windows-msi-\$\{\{ github\.ref_name \}\}/,
  );
  assert.match(
    windowsJob,
    /path: \|\s+target\/release\/bundle\/msi\/\*\.msi\s+target\/release\/bundle\/msi\/SHA256SUMS-windows\.txt/,
  );
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
    "Prepare MSI version override",
    "Verify MSI preparation leaves manifests unchanged",
    "Build MSI bundle",
    "Verify MSI bundle and write checksum",
    "Upload verified MSI artifact",
  ]);

  assert.match(
    publishJob,
    /needs:\s*\n\s+- validate-release\s*\n\s+- build-macos-dmg\s*\n\s+- build-windows-msi/,
  );
  assert.match(
    publishJob,
    /if: github\.event_name == 'push' && github\.ref_type == 'tag'/,
  );
  assert.match(
    publishJob,
    /permissions:\s*\n\s+checks: read\s*\n\s+contents: write/,
  );
  assert.match(
    publishJob,
    /required_checks=\("macOS Smoke" "Windows Smoke"\)/,
  );
  assert.match(
    publishJob,
    /\/repos\/\$GITHUB_REPOSITORY\/commits\/\$GITHUB_SHA\/check-runs/,
  );
  assert.match(publishJob, /-f check_name="\$check_name"/);
  assert.match(publishJob, /-f filter=latest/);
  assert.match(publishJob, /\.app\.slug == "github-actions"/);
  assert.match(publishJob, /sort_by\(\[\(\.started_at/);
  assert.match(publishJob, /"completed:success"/);
  assert.match(publishJob, /Required CI check '\$check_name'/);
  assert.match(
    publishJob,
    /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8\.0\.1/,
  );
  assert.match(
    publishJob,
    /- name: Download verified macOS artifact[\s\S]*?name: filament-manager-macos-dmg-\$\{\{ github\.run_id \}\}\s+path: release-assets\/macos/,
  );
  assert.match(
    publishJob,
    /- name: Download verified Windows artifact[\s\S]*?name: filament-manager-windows-msi-\$\{\{ github\.run_id \}\}\s+path: release-assets\/windows/,
  );
  assert.match(publishJob, /SHA256SUMS\.txt/);
  assert.match(publishJob, /SHA256SUMS-windows\.txt/);
  assert.match(publishJob, /sha256sum --check SHA256SUMS\.txt/);
  assert.match(publishJob, /sha256sum --check SHA256SUMS-windows\.txt/);
  assert.match(publishJob, /gh release create "\$GITHUB_REF_NAME"/);
  assert.match(publishJob, /--verify-tag/);
  assert.match(publishJob, /--target "\$GITHUB_SHA"/);
  assert.match(publishJob, /--notes-file "\$FILAMENT_MANAGER_RELEASE_NOTES_PATH"/);

  assertStepOrder(publishJob, [
    "Require successful CI checks",
    "Checkout release notes",
    "Download verified macOS artifact",
    "Download verified Windows artifact",
    "Assemble and verify release assets",
    "Publish immutable release",
  ]);
});

test("release artifacts remain stable across partial workflow reruns", () => {
  const macosJob = readSection(
    releaseWorkflow,
    "  build-macos-dmg:",
    "  build-windows-msi:",
  );
  const windowsJob = readSection(
    releaseWorkflow,
    "  build-windows-msi:",
    "  publish-github-release:",
  );
  const macosArtifactName = "filament-manager-macos-dmg-${{ github.run_id }}";
  const windowsArtifactName = "filament-manager-windows-msi-${{ github.run_id }}";

  assert.equal(countOccurrences(releaseWorkflow, `name: ${macosArtifactName}`), 2);
  assert.equal(countOccurrences(releaseWorkflow, `name: ${windowsArtifactName}`), 2);
  assert.doesNotMatch(releaseWorkflow, /github\.run_attempt/);
  assert.match(
    macosJob,
    /- name: Upload verified DMG artifact[\s\S]*?overwrite: true/,
  );
  assert.match(
    windowsJob,
    /- name: Upload verified MSI artifact[\s\S]*?overwrite: true/,
  );
});

test("Windows MSI verifier fails closed and writes a portable checksum", () => {
  const verifierPath = "scripts/verify-windows-msi.ps1";
  assert.equal(existsSync(verifierPath), true);
  const verifier = readFileSync(verifierPath, "utf8");

  assert.match(verifier, /Get-ChildItem[\s\S]*-Filter "\*\.msi"/);
  assert.match(verifier, /\.Count -ne 1/);
  assert.match(verifier, /\.Length -le 0/);
  assert.match(verifier, /WindowsInstaller\.Installer/);
  assert.match(verifier, /OpenDatabase/);
  assert.match(verifier, /ProductName/);
  assert.match(verifier, /ProductVersion/);
  assert.match(verifier, /SummaryInformation/);
  assert.match(verifier, /@\(\[int\]7\)/);
  assert.match(verifier, /ExpectedArchitecture/);
  assert.match(verifier, /Get-FileHash[\s\S]*-Algorithm SHA256/);
  assert.match(verifier, /ToLowerInvariant\(\)/);
  assert.match(verifier, /SHA256SUMS-windows\.txt/);
  assert.match(verifier, /\$msiFile\.Name/);
  assert.match(verifier, /UTF8Encoding\]::new\(\$false\)/);
  assert.match(verifier, /WriteAllText[\s\S]*`n/);
});

test("Windows MSI uninstall preserves the system Desktop directory", () => {
  assert.doesNotMatch(
    windowsWixTemplate,
    /<RemoveFolder\s+Id="DesktopFolder"\b/,
  );
});

test("Windows MSI keeps the main binary in the mandatory application feature", () => {
  const mainProgramStart = windowsWixTemplate.indexOf('Id="MainProgram"');
  const shortcutsFeatureStart = windowsWixTemplate.indexOf(
    'Id="ShortcutsFeature"',
    mainProgramStart,
  );
  const pathReferences = [
    ...windowsWixTemplate.matchAll(/<ComponentRef\s+Id="Path"\s*\/>/g),
  ];

  assert.notEqual(mainProgramStart, -1);
  assert.notEqual(shortcutsFeatureStart, -1);
  assert.equal(pathReferences.length, 1);
  assert.equal(
    pathReferences[0].index > mainProgramStart &&
      pathReferences[0].index < shortcutsFeatureStart,
    true,
  );
});

test("Windows MSI PATH feature is user-scoped and independently selectable", () => {
  const pathEnvironmentComponent = readSection(
    windowsWixTemplate,
    '<Component Id="PathEnvironment"',
    "            </Component>",
  );
  const environmentFeature = readSection(
    windowsWixTemplate,
    '                Id="Environment"',
    "            </Feature>",
  );

  assert.match(pathEnvironmentComponent, /<Environment\s/);
  assert.match(pathEnvironmentComponent, /\bName="PATH"/);
  assert.match(pathEnvironmentComponent, /\bValue="\[INSTALLDIR\]"/);
  assert.match(pathEnvironmentComponent, /\bPart="last"/);
  assert.match(pathEnvironmentComponent, /\bAction="set"/);
  assert.match(pathEnvironmentComponent, /\bSystem="no"/);
  assert.match(pathEnvironmentComponent, /\bPermanent="no"/);
  assert.match(pathEnvironmentComponent, /<RegistryValue\s+Root="HKCU"/);
  assert.match(pathEnvironmentComponent, /\bKeyPath="yes"\s*\/>/);
  assert.match(environmentFeature, /<ComponentRef\s+Id="PathEnvironment"\s*\/>/);
  assert.doesNotMatch(environmentFeature, /<ComponentRef\s+Id="Path"\s*\/>/);
  assert.equal(
    [...windowsWixTemplate.matchAll(/<ComponentRef\s+Id="PathEnvironment"\s*\/>/g)]
      .length,
    1,
  );
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
    "Prepare MSI smoke version override",
    "Build MSI smoke bundle",
    "Verify MSI smoke bundle",
  ]);
  assert.match(windowsJob, /timeout-minutes: 45/);
  assert.match(
    windowsJob,
    /npm run tauri -- build --debug --bundles msi --config "\$env:MSI_VERSION_CONFIG_PATH"/,
  );
  assert.match(windowsJob, /-MsiDirectory "target\/debug\/bundle\/msi"/);
  assert.match(windowsJob, /-ExpectedArchitecture "x64"/);
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
    /name: filament-manager-macos-dmg-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(
    macosJob,
    /- name: Upload verified DMG artifact[\s\S]*?if-no-files-found: error\s+overwrite: true\s+retention-days: 14/,
  );
  assert.doesNotMatch(
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
