import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const releaseWorkflow = readFileSync(".github/workflows/release-build.yml", "utf8");
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const windowsWixTemplate = readFileSync("src-tauri/wix/per-user.wxs", "utf8");
const windowsMsiSmoke = readFileSync("scripts/smoke-windows-msi.ps1", "utf8");
const macosDmgSmoke = readFileSync("scripts/smoke-macos-dmg.mjs", "utf8");
const releaseDatabaseUpgradeSmoke = readFileSync(
  "scripts/smoke-release-database-upgrade.mjs",
  "utf8",
);
const previousReleaseFixturePreparer = readFileSync(
  "scripts/prepare-previous-release-upgrade-fixture.mjs",
  "utf8",
);
const macosWindowHelper = readFileSync(
  "scripts/macos-window-info.swift",
  "utf8",
);
const windowsAuthenticodeVerifier = readFileSync(
  "scripts/verify-windows-authenticode.ps1",
  "utf8",
);
const windowsDatabaseVerifier = readFileSync(
  "scripts/verify-windows-app-database.mjs",
  "utf8",
);
const packageManifest = JSON.parse(readFileSync("package.json", "utf8"));

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
    "  prepare-previous-release-fixture:",
  );
  const macosJob = readSection(
    releaseWorkflow,
    "  build-macos-dmg:",
    "  smoke-macos-dmg-intel:",
  );
  const intelMacosSmokeJob = readSection(
    releaseWorkflow,
    "  smoke-macos-dmg-intel:",
    "  build-windows-msi:",
  );
  const windowsJob = readSection(
    releaseWorkflow,
    "  build-windows-msi:",
    "  generate-release-sbom:",
  );
  const sbomJob = readSection(
    releaseWorkflow,
    "  generate-release-sbom:",
    "  attest-public-release:",
  );
  const attestationJob = readSection(
    releaseWorkflow,
    "  attest-public-release:",
    "  publish-github-release:",
  );
  const publishJob = readSection(releaseWorkflow, "  publish-github-release:");
  const requiredChecksStep = readSection(
    publishJob,
    "      - name: Require successful CI checks",
    "      - name: Checkout release notes",
  );
  const updateMetadataGate = validationJob.match(
    /canonical_repository="bliatun-code\/Filament-Manager"[\s\S]*?Canonical tag releases require repository variable FILAMENT_MANAGER_UPDATE_METADATA_URL to equal \$expected_update_metadata_url\.[\s\S]*?\n\s+fi/,
  )?.[0];
  assert.ok(updateMetadataGate, "Missing canonical tag update metadata gate.");

  assert.match(releaseWorkflow, /tags:\s*\n\s*- "v\*"/);
  assert.match(releaseWorkflow, /confirm_macos_notarization:/);
  assert.match(
    validationJob,
    /outputs:\s*\n\s+package-version: \$\{\{ steps\['release-request'\]\.outputs\['package-version'\] \}\}\s*\n\s+release-tag: \$\{\{ steps\['release-request'\]\.outputs\['release-tag'\] \}\}/,
  );
  assert.match(validationJob, /npm run check:version/);
  assert.match(validationJob, /npm run check:msi-version/);
  assert.match(validationJob, /npm run check:path-portability/);
  assert.match(validationJob, /npm run check:command-portability/);
  assert.match(
    validationJob,
    /EXPECTED_APPLE_TEAM_ID: \$\{\{ vars\.EXPECTED_APPLE_TEAM_ID \}\}/,
  );
  assert.match(
    validationJob,
    /FILAMENT_MANAGER_UPDATE_METADATA_URL: \$\{\{ vars\.FILAMENT_MANAGER_UPDATE_METADATA_URL \}\}/,
  );
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
  assert.match(
    validationJob,
    /"\$GITHUB_EVENT_NAME" == "workflow_dispatch"[\s\S]*?"\$GITHUB_REF" != "refs\/heads\/main"/,
  );
  assert.match(
    validationJob,
    /Manual release builds must run from the main branch/,
  );
  assert.match(validationJob, /release_tag="v\$package_version"/);
  assert.match(validationJob, /\^\[A-Z0-9\]\{10\}\$/);
  assert.match(
    validationJob,
    /Repository variable EXPECTED_APPLE_TEAM_ID must contain the 10-character public Apple Team ID/,
  );
  assert.match(
    validationJob,
    /echo "package-version=\$package_version" >> "\$GITHUB_OUTPUT"/,
  );
  assert.match(
    validationJob,
    /echo "release-tag=\$release_tag" >> "\$GITHUB_OUTPUT"/,
  );
  assert.match(
    validationJob,
    /"\$GITHUB_EVENT_NAME" == "push"[\s\S]*?"\$GITHUB_REF_TYPE" != "tag"[\s\S]*?"\$GITHUB_REF_NAME" != "\$release_tag"[\s\S]*?"\$GITHUB_REF" != "refs\/tags\/\$release_tag"/,
  );
  assert.match(
    validationJob,
    /Release publishing is restricted to the exact version tag refs\/tags\/\$release_tag/,
  );
  assert.match(
    updateMetadataGate,
    /canonical_repository="bliatun-code\/Filament-Manager"/,
  );
  assert.match(
    updateMetadataGate,
    /expected_update_metadata_url="https:\/\/api\.github\.com\/repos\/\$GITHUB_REPOSITORY\/releases\/latest"/,
  );
  assert.match(
    updateMetadataGate,
    /"\$GITHUB_EVENT_NAME" == "push"[\\\s]+&& "\$GITHUB_REF_TYPE" == "tag"[\\\s]+&& "\$GITHUB_REPOSITORY" == "\$canonical_repository"[\\\s]+&& "\$FILAMENT_MANAGER_UPDATE_METADATA_URL" != "\$expected_update_metadata_url"/,
  );
  assert.match(
    updateMetadataGate,
    /Canonical tag releases require repository variable FILAMENT_MANAGER_UPDATE_METADATA_URL to equal \$expected_update_metadata_url\./,
  );
  assert.doesNotMatch(updateMetadataGate, /workflow_dispatch|SELECTED_PLATFORM/);
  assert.match(validationJob, /git merge-base --is-ancestor HEAD refs\/remotes\/origin\/main/);
  assert.match(
    macosJob,
    /needs:\s*\n\s+- validate-release\s*\n\s+- prepare-previous-release-fixture/,
  );
  assert.match(
    macosJob,
    /if: github\.event_name == 'push' \|\| github\.event\.inputs\.platform == 'both' \|\| github\.event\.inputs\.platform == 'macos'/,
  );
  assert.match(
    windowsJob,
    /needs:\s*\n\s+- validate-release\s*\n\s+- prepare-previous-release-fixture/,
  );
  assert.match(
    windowsJob,
    /if: github\.event_name == 'push' \|\| github\.event\.inputs\.platform == 'both' \|\| github\.event\.inputs\.platform == 'windows'/,
  );
  assert.match(windowsJob, /runs-on: windows-2025/);
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
    /- name: Build MSI bundle\s+env:\s+FILAMENT_MANAGER_UPDATE_METADATA_URL: \$\{\{ vars\.FILAMENT_MANAGER_UPDATE_METADATA_URL \}\}\s+MSI_VERSION_CONFIG_PATH: \$\{\{ runner\.temp \}\}\/filament-manager-msi-version\.json\s+run: npm run tauri -- build --bundles msi --config "\$env:MSI_VERSION_CONFIG_PATH"/,
  );
  assert.match(
    macosJob,
    /- name: Build signed and notarized DMG[\s\S]*?FILAMENT_MANAGER_UPDATE_METADATA_URL: \$\{\{ vars\.FILAMENT_MANAGER_UPDATE_METADATA_URL \}\}[\s\S]*?npm run tauri --[\s\S]*?build[\s\S]*?--target universal-apple-darwin[\s\S]*?--bundles dmg/,
  );
  const updateMetadataVariableBinding =
    "FILAMENT_MANAGER_UPDATE_METADATA_URL: ${{ vars.FILAMENT_MANAGER_UPDATE_METADATA_URL }}";
  assert.equal(countOccurrences(validationJob, updateMetadataVariableBinding), 1);
  assert.equal(countOccurrences(macosJob, updateMetadataVariableBinding), 1);
  assert.equal(countOccurrences(windowsJob, updateMetadataVariableBinding), 1);
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
    /-NormalizedFileName "Filament-Manager_\$\(\$tauriConfig\.version\)_x64_en-US\.msi"/,
  );
  assert.match(
    windowsJob,
    /name: filament-manager-windows-msi-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(
    windowsJob,
    /- name: Upload verified MSI artifact[\s\S]*?if-no-files-found: error\s+overwrite: true\s+retention-days: 14/,
  );
  assert.match(
    windowsJob,
    /- name: Download release MSI candidate[\s\S]*?actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8\.0\.1[\s\S]*?name: filament-manager-windows-msi-\$\{\{ github\.run_id \}\}[\s\S]*?filament-manager-windows-release-candidate/,
  );
  assert.match(windowsJob, /- name: Verify downloaded MSI candidate/);
  assert.match(windowsJob, /SHA256SUMS-windows\.txt/);
  assert.match(windowsJob, /\[regex\]::Match/);
  assert.match(windowsJob, /Get-FileHash -LiteralPath \$candidatePath -Algorithm SHA256/);
  assert.match(
    windowsJob,
    /-MsiDirectory \$env:WINDOWS_MSI_CANDIDATE_DIR/,
  );
  assert.match(
    windowsJob,
    /- name: Exercise release MSI installation from downloaded artifact/,
  );
  assert.match(windowsJob, /WINDOWS_MSI_CANDIDATE_DIR/);
  assert.match(windowsJob, /\.\/scripts\/smoke-windows-msi\.ps1/);
  assert.match(windowsJob, /-SignaturePolicy "UnsignedRequired"/);
  assert.match(windowsJob, /-LaunchTimeoutSeconds 120/);
  assert.match(
    windowsJob,
    /- name: Upload release MSI smoke logs\s+if: always\(\)[\s\S]*?if-no-files-found: warn[\s\S]*?retention-days: 7/,
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
    "Download release MSI candidate",
    "Verify downloaded MSI candidate",
    "Exercise release MSI installation from downloaded artifact",
    "Upload release MSI smoke logs",
  ]);

  assert.match(
    publishJob,
    /needs:\s*\n\s+- validate-release\s*\n\s+- build-macos-dmg\s*\n\s+- smoke-macos-dmg-intel\s*\n\s+- build-windows-msi\s*\n\s+- generate-release-sbom\s*\n\s+- attest-public-release/,
  );
  assert.match(publishJob, /if: >-\s+!cancelled\(\) &&/);
  assert.doesNotMatch(publishJob, /always\(\)/);
  assert.match(
    publishJob,
    /github\.ref == format\('refs\/tags\/\{0\}', needs\['validate-release'\]\.outputs\['release-tag'\]\)/,
  );
  assert.match(publishJob, /needs\['validate-release'\]\.result == 'success'/);
  assert.match(publishJob, /needs\['build-macos-dmg'\]\.result == 'success'/);
  assert.match(
    publishJob,
    /needs\['smoke-macos-dmg-intel'\]\.result == 'success'/,
  );
  assert.match(publishJob, /needs\['build-windows-msi'\]\.result == 'success'/);
  assert.match(publishJob, /needs\['generate-release-sbom'\]\.result == 'success'/);
  assert.match(
    publishJob,
    /github\.event\.repository\.private == false && needs\['attest-public-release'\]\.result == 'success'/,
  );
  assert.match(
    publishJob,
    /github\.event\.repository\.private == true && needs\['attest-public-release'\]\.result == 'skipped'/,
  );
  assert.match(
    publishJob,
    /permissions:\s*\n\s+checks: read\s*\n\s+contents: write/,
  );
  assert.match(publishJob, /environment: github-release/);
  assert.equal(countOccurrences(releaseWorkflow, "environment: github-release"), 1);
  assert.doesNotMatch(macosJob, /environment: github-release/);
  assert.doesNotMatch(intelMacosSmokeJob, /environment: github-release/);
  assert.doesNotMatch(windowsJob, /environment: github-release/);
  assert.match(macosJob, /environment: macos-release/);
  assert.doesNotMatch(intelMacosSmokeJob, /environment:/);
  assert.match(
    publishJob,
    /\/repos\/\$GITHUB_REPOSITORY\/commits\/\$GITHUB_REF_NAME/,
  );
  assert.match(publishJob, /--jq \.sha/);
  assert.match(
    publishJob,
    /if \[\[ "\$tag_commit" != "\$GITHUB_SHA" \]\]; then[\s\S]*?Release tag \$GITHUB_REF_NAME no longer points to workflow commit \$GITHUB_SHA/,
  );
  assert.match(
    publishJob,
    /tag_commit="\$\([\s\S]*?\)"[\s\S]*?draft_release_json="\$\(/,
  );
  assert.match(
    publishJob,
    /required_checks=\("macOS Smoke" "Windows Smoke"\)/,
  );
  assert.equal(
    countOccurrences(requiredChecksStep, "GH_TOKEN: ${{ github.token }}"),
    1,
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
  assert.match(
    publishJob,
    /- name: Download verified source dependency SBOM[\s\S]*?name: filament-manager-release-sbom-\$\{\{ github\.run_id \}\}\s+path: release-assets\/sbom/,
  );
  assert.match(
    publishJob,
    /- name: Download signed public provenance\s+if: github\.event\.repository\.private == false[\s\S]*?name: filament-manager-release-provenance-\$\{\{ github\.run_id \}\}\s+path: release-assets\/provenance/,
  );
  assert.match(publishJob, /SHA256SUMS\.txt/);
  assert.match(publishJob, /SHA256SUMS-windows\.txt/);
  assert.match(publishJob, /SHA256SUMS-sbom\.txt/);
  assert.match(publishJob, /sha256sum --check SHA256SUMS\.txt/);
  assert.match(publishJob, /sha256sum --check SHA256SUMS-windows\.txt/);
  assert.match(publishJob, /sha256sum --check SHA256SUMS-sbom\.txt/);
  assert.match(publishJob, /node \.\/scripts\/verify-release-sbom\.mjs/);
  assert.match(
    publishJob,
    /A public release requires exactly one non-empty signed provenance bundle/,
  );
  assert.match(
    publishJob,
    /draft_release_json="\$\([\s\S]*?tag_name: \$tag_name,[\s\S]*?target_commitish: \$target_commitish,[\s\S]*?draft: true,[\s\S]*?prerelease: false[\s\S]*?--method POST[\s\S]*?\/repos\/\$GITHUB_REPOSITORY\/releases"[\s\S]*?--input -/,
  );
  assert.match(
    publishJob,
    /--rawfile body "\$FILAMENT_MANAGER_RELEASE_NOTES_PATH"/,
  );
  assert.match(
    publishJob,
    /release_asset_paths=\("\$FILAMENT_MANAGER_RELEASE_ASSET_DIR"\/\*\)[\s\S]*?for asset_path in "\$\{release_asset_paths\[@\]\}"[\s\S]*?--fail-with-body[\s\S]*?--location[\s\S]*?--data-binary "@\$asset_path"[\s\S]*?https:\/\/uploads\.github\.com\/repos\/\$GITHUB_REPOSITORY\/releases\/\$draft_release_id\/assets\?name=\$encoded_asset_name/,
  );
  assert.match(publishJob, /jq -rn --arg value "\$asset_name" '\$value \| @uri'/);
  assert.match(publishJob, /Authorization: Bearer \$GH_TOKEN/);
  assert.match(publishJob, /Content-Type: application\/octet-stream/);
  assert.doesNotMatch(publishJob, /--clobber/);
  assert.doesNotMatch(publishJob, /gh release (?:create|upload|edit)/);
  assert.match(
    publishJob,
    /releases_for_tag\(\) \{[\s\S]*?--paginate[\s\S]*?\/repos\/\$GITHUB_REPOSITORY\/releases\?per_page=100[\s\S]*?\[\.\[\]\[\] \| select\(\.tag_name == \$tag\)\]/,
  );
  assert.doesNotMatch(publishJob, /\/releases\/tags\//);
  assert.match(
    publishJob,
    /existing_releases="\$\(releases_for_tag\)"[\s\S]*?existing_release_count="\$\(jq -r 'length'[\s\S]*?Refusing to replace or delete a preexisting release/,
  );
  assert.match(
    publishJob,
    /draft_release_id="\$\([\s\S]*?select\(\.draft == true and \.tag_name == \$tag\) \| \.id \/\/ empty[\s\S]*?release API did not return the expected editable draft/,
  );
  assert.match(
    publishJob,
    /--method PATCH[\s\S]*?\/repos\/\$GITHUB_REPOSITORY\/releases\/\$draft_release_id"[\s\S]*?-F draft=false[\s\S]*?-F prerelease=false[\s\S]*?-f make_latest=true/,
  );
  assert.match(
    publishJob,
    /find "\$FILAMENT_MANAGER_RELEASE_ASSET_DIR"[\s\S]*?-printf '%f\\t%s\\n'/,
  );
  assert.match(
    publishJob,
    /Draft release assets do not exactly match the verified local files/,
  );
  assert.match(
    publishJob,
    /select\(\.draft == true and \.tag_name == \$tag\) \| \.id \/\/ empty/,
  );
  assert.doesNotMatch(publishJob, /cleanup_releases=/);
  assert.match(
    publishJob,
    /if \[\[ \$exit_code -ne 0 && "\$draft_created" == "true" \]\]; then[\s\S]*?\/repos\/\$GITHUB_REPOSITORY\/releases\/\$cleanup_release_id[\s\S]*?confirmed_draft_release_id/,
  );
  assert.match(
    publishJob,
    /--method DELETE[\s\S]*?\/repos\/\$GITHUB_REPOSITORY\/releases\/\$confirmed_draft_release_id/,
  );
  assert.match(
    publishJob,
    /published_state[\s\S]*?false:false:\$GITHUB_REF_NAME/,
  );
  assert.ok(
    publishJob.indexOf('draft_release_json="$(') <
      publishJob.indexOf('for asset_path in "${release_asset_paths[@]}"'),
    "draft creation must precede asset upload",
  );
  assert.ok(
    publishJob.indexOf('existing_releases="$(releases_for_tag)"') <
      publishJob.indexOf('draft_release_json="$('),
    "preexisting draft and published releases must be rejected before creation",
  );
  assert.ok(
    publishJob.indexOf("draft_created=true") <
      publishJob.lastIndexOf('draft_release_id="$('),
    "cleanup ownership must be recorded before validating the new draft response",
  );
  assert.ok(
    publishJob.indexOf('for asset_path in "${release_asset_paths[@]}"') <
      publishJob.indexOf("--method PATCH"),
    "asset upload must precede publication",
  );

  assertStepOrder(publishJob, [
    "Require successful CI checks",
    "Checkout release notes",
    "Download verified macOS artifact",
    "Download verified Windows artifact",
    "Download verified source dependency SBOM",
    "Download signed public provenance",
    "Assemble and verify release assets",
    "Publish immutable-ready release",
  ]);

  assert.match(sbomJob, /needs: validate-release/);
  assert.match(
    attestationJob,
    /needs:[\s\S]*?- build-macos-dmg[\s\S]*?- smoke-macos-dmg-intel[\s\S]*?- build-windows-msi[\s\S]*?- generate-release-sbom/,
  );
});

test("release SBOM generation is pinned, read-only and fail-closed", () => {
  const sbomJob = readSection(
    releaseWorkflow,
    "  generate-release-sbom:",
    "  attest-public-release:",
  );

  assert.match(
    sbomJob,
    /permissions:\s*\n\s+contents: read\s*\n\s+steps:/,
  );
  assert.doesNotMatch(sbomJob, /permissions:[\s\S]*?\n\s+\w[\w-]*: write/);
  assert.match(
    sbomJob,
    /anchore\/sbom-action@e22c389904149dbc22b58101806040fa8d37a610 # v0\.24\.0/,
  );
  assert.match(sbomJob, /format: spdx-json/);
  assert.match(sbomJob, /syft-version: v1\.51\.0/);
  assert.match(sbomJob, /dependency-snapshot: false/);
  assert.match(sbomJob, /upload-artifact: false/);
  assert.match(sbomJob, /upload-release-assets: false/);
  assert.match(sbomJob, /node \.\/scripts\/verify-release-sbom\.mjs/);
  assert.match(sbomJob, /--expected-package=bambu-filament-manager/);
  assert.match(sbomJob, /sha256sum "\$sbom_name" > SHA256SUMS-sbom\.txt/);
  assert.match(
    sbomJob,
    /name: filament-manager-release-sbom-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(
    sbomJob,
    /- name: Upload verified source dependency SBOM[\s\S]*?if-no-files-found: error\s+overwrite: true\s+retention-days: 14/,
  );
  assert.doesNotMatch(sbomJob, /github\.run_attempt/);

  assertStepOrder(sbomJob, [
    "Checkout release source",
    "Setup Node",
    "Prepare SBOM output",
    "Generate pinned source dependency SBOM",
    "Validate source dependency SBOM",
    "Write SBOM checksum",
    "Upload verified source dependency SBOM",
  ]);
});

test("public provenance uses an isolated least-privilege fail-closed job", () => {
  const attestationJob = readSection(
    releaseWorkflow,
    "  attest-public-release:",
    "  publish-github-release:",
  );

  assert.match(
    attestationJob,
    /if: >-\s+github\.event_name == 'push' &&\s+github\.ref_type == 'tag' &&\s+github\.ref == format\('refs\/tags\/\{0\}', needs\['validate-release'\]\.outputs\['release-tag'\]\) &&\s+github\.event\.repository\.private == false/,
  );
  assert.match(
    attestationJob,
    /permissions:\s*\n\s+actions: read\s*\n\s+artifact-metadata: write\s*\n\s+attestations: write\s*\n\s+contents: read\s*\n\s+id-token: write/,
  );
  assert.doesNotMatch(attestationJob, /contents: write/);
  assert.doesNotMatch(attestationJob, /APPLE_[A-Z_]+|macos-release/);
  assert.match(
    attestationJob,
    /actions\/attest@[a-f0-9]{40} # v\d+\.\d+\.\d+/,
  );
  assert.match(
    attestationJob,
    /subject-path:\s*\|\s+\$\{\{ steps\['installer-subjects'\]\.outputs\['dmg-path'\] \}\}\s+\$\{\{ steps\['installer-subjects'\]\.outputs\['msi-path'\] \}\}/,
  );
  assert.match(attestationJob, /sha256sum --check SHA256SUMS\.txt/);
  assert.match(attestationJob, /sha256sum --check SHA256SUMS-windows\.txt/);
  assert.match(
    attestationJob,
    /steps\['installer-provenance'\]\.outputs\['bundle-path'\]/,
  );
  assert.match(
    attestationJob,
    /name: filament-manager-release-provenance-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(
    attestationJob,
    /- name: Upload signed provenance bundle[\s\S]*?if-no-files-found: error\s+overwrite: true\s+retention-days: 14/,
  );

  assertStepOrder(attestationJob, [
    "Download verified macOS artifact for attestation",
    "Download verified Windows artifact for attestation",
    "Reverify installer subjects",
    "Generate signed build provenance",
    "Normalize signed provenance bundle",
    "Upload signed provenance bundle",
  ]);
});

test("release artifacts remain stable across partial workflow reruns", () => {
  const macosJob = readSection(
    releaseWorkflow,
    "  build-macos-dmg:",
    "  smoke-macos-dmg-intel:",
  );
  const intelMacosSmokeJob = readSection(
    releaseWorkflow,
    "  smoke-macos-dmg-intel:",
    "  build-windows-msi:",
  );
  const windowsJob = readSection(
    releaseWorkflow,
    "  build-windows-msi:",
    "  generate-release-sbom:",
  );
  const sbomJob = readSection(
    releaseWorkflow,
    "  generate-release-sbom:",
    "  attest-public-release:",
  );
  const attestationJob = readSection(
    releaseWorkflow,
    "  attest-public-release:",
    "  publish-github-release:",
  );
  const macosArtifactName = "filament-manager-macos-dmg-${{ github.run_id }}";
  const windowsArtifactName = "filament-manager-windows-msi-${{ github.run_id }}";
  const sbomArtifactName = "filament-manager-release-sbom-${{ github.run_id }}";
  const provenanceArtifactName =
    "filament-manager-release-provenance-${{ github.run_id }}";

  assert.equal(countOccurrences(releaseWorkflow, `name: ${macosArtifactName}`), 5);
  assert.equal(countOccurrences(releaseWorkflow, `name: ${windowsArtifactName}`), 4);
  assert.equal(countOccurrences(releaseWorkflow, `name: ${sbomArtifactName}`), 2);
  assert.equal(countOccurrences(releaseWorkflow, `name: ${provenanceArtifactName}`), 2);
  assert.doesNotMatch(releaseWorkflow, /github\.run_attempt/);
  assert.match(
    macosJob,
    /- name: Upload verified DMG artifact[\s\S]*?overwrite: true/,
  );
  assert.match(
    macosJob,
    /- name: Download release DMG candidate[\s\S]*?name: filament-manager-macos-dmg-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(
    intelMacosSmokeJob,
    /- name: Download Universal 2 DMG candidate[\s\S]*?name: filament-manager-macos-dmg-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(
    windowsJob,
    /- name: Upload verified MSI artifact[\s\S]*?overwrite: true/,
  );
  assert.match(
    windowsJob,
    /- name: Download release MSI candidate[\s\S]*?name: filament-manager-windows-msi-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(
    sbomJob,
    /- name: Upload verified source dependency SBOM[\s\S]*?overwrite: true/,
  );
  assert.match(
    attestationJob,
    /- name: Upload signed provenance bundle[\s\S]*?overwrite: true/,
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
  assert.match(verifier, /\[string\]\$NormalizedFileName/);
  assert.match(
    verifier,
    /\^\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\*\[\.\]msi\$/,
  );
  assert.match(verifier, /Move-Item -LiteralPath \$msiFile\.FullName/);
  assert.match(verifier, /Get-Item -LiteralPath \$normalizedMsiPath/);
  assert.match(verifier, /Get-FileHash[\s\S]*-Algorithm SHA256/);
  assert.match(verifier, /ToLowerInvariant\(\)/);
  assert.match(verifier, /SHA256SUMS-windows\.txt/);
  assert.match(verifier, /\$msiFile\.Name/);
  assert.match(verifier, /UTF8Encoding\]::new\(\$false\)/);
  assert.match(verifier, /WriteAllText[\s\S]*`n/);
});

test("Windows Authenticode verifier requires publisher, code-signing EKU and timestamp", () => {
  assert.equal(existsSync("scripts/verify-windows-authenticode.ps1"), true);

  assert.match(windowsAuthenticodeVerifier, /\[string\[\]\]\$FilePath/);
  assert.match(windowsAuthenticodeVerifier, /\[string\]\$ExpectedPublisherSubject/);
  assert.match(windowsAuthenticodeVerifier, /\("\.exe", "\.msi"\)/);
  assert.match(windowsAuthenticodeVerifier, /Get-AuthenticodeSignature -LiteralPath/);
  assert.match(windowsAuthenticodeVerifier, /\[string\]\$signature\.Status, "Valid"/);
  assert.match(windowsAuthenticodeVerifier, /\$signature\.SignerCertificate\.Subject\.Trim\(\)/);
  assert.match(windowsAuthenticodeVerifier, /\[StringComparison\]::Ordinal/);
  assert.match(windowsAuthenticodeVerifier, /1\.3\.6\.1\.5\.5\.7\.3\.3/);
  assert.match(windowsAuthenticodeVerifier, /\$signature\.TimeStamperCertificate/);
  assert.match(
    windowsAuthenticodeVerifier,
    /verify \/pa \/all \/v \/tw \$resolvedFilePath/,
  );
  assert.match(windowsAuthenticodeVerifier, /\$signToolExitCode -ne 0/);
  assert.match(windowsAuthenticodeVerifier, /SignTool Warning/);
  assert.match(windowsAuthenticodeVerifier, /\$signToolWarnings\.Count -ne 0/);
  assert.doesNotMatch(releaseWorkflow, /verify-windows-authenticode\.ps1/);
});

test("Windows MSI smoke exercises install, desktop lifecycle, data retention and uninstall", () => {
  assert.equal(existsSync("scripts/smoke-windows-msi.ps1"), true);
  assert.equal(existsSync("scripts/verify-windows-app-database.mjs"), true);

  assert.match(
    windowsMsiSmoke,
    /\[ValidateSet\("UnsignedRequired", "Required"\)\]/,
  );
  assert.match(
    windowsMsiSmoke,
    /\[string\]\$SignaturePolicy = "UnsignedRequired"/,
  );
  assert.match(
    windowsMsiSmoke,
    /Get-AuthenticodeSignature -LiteralPath \$Path/,
  );
  assert.match(
    windowsMsiSmoke,
    /\[string\]::Equals\([\s\S]*?"NotSigned"[\s\S]*?\[StringComparison\]::Ordinal/,
  );
  assert.match(
    windowsMsiSmoke,
    /Assert-UnsignedAuthenticode -Path \$resolvedMsiPath/,
  );
  assert.match(
    windowsMsiSmoke,
    /Assert-UnsignedAuthenticode -Path \$installedExecutablePath/,
  );
  assert.match(windowsMsiSmoke, /Get-MsiProperty[\s\S]*"ProductCode"/);
  assert.match(windowsMsiSmoke, /msiexec\.exe/);
  assert.match(windowsMsiSmoke, /"\/qn"/);
  assert.match(windowsMsiSmoke, /"\/norestart"/);
  assert.match(windowsMsiSmoke, /"\/L\*V"/);
  assert.match(windowsMsiSmoke, /Invoke-MsiExec -Action "\/i"/);
  assert.match(windowsMsiSmoke, /Get-MsiProductState/);
  assert.match(windowsMsiSmoke, /"ProductState"/);
  assert.match(windowsMsiSmoke, /\$initialProductState -ne -1/);
  assert.match(windowsMsiSmoke, /\$installedProductState -ne 5/);
  assert.match(windowsMsiSmoke, /\$uninstalledProductState -ne -1/);
  assert.match(windowsMsiSmoke, /\[EnvironmentVariableTarget\]::User/);
  assert.match(windowsMsiSmoke, /Desktop shortcut already exists/);
  assert.match(windowsMsiSmoke, /Start Menu product directory already exists/);
  assert.match(windowsMsiSmoke, /user PATH already contains the install directory/);
  assert.match(windowsMsiSmoke, /Install did not register[\s\S]*for the current user/);
  assert.match(windowsMsiSmoke, /Install did not create the expected Desktop shortcut/);
  assert.match(windowsMsiSmoke, /Install did not create the expected Start Menu shortcut/);
  assert.match(windowsMsiSmoke, /Install did not add the install directory to the user PATH/);
  assert.match(windowsMsiSmoke, /Start-Process[\s\S]*-FilePath \$installedExecutablePath/);
  assert.match(windowsMsiSmoke, /Add-Type -TypeDefinition/);
  assert.match(windowsMsiSmoke, /EnumWindows/);
  assert.match(windowsMsiSmoke, /GetWindowThreadProcessId/);
  assert.match(windowsMsiSmoke, /IsWindowVisible/);
  assert.match(windowsMsiSmoke, /GetWindowRect/);
  assert.match(windowsMsiSmoke, /DwmGetWindowAttribute/);
  assert.match(windowsMsiSmoke, /WsExToolWindow/);
  assert.match(windowsMsiSmoke, /-not \$_\.IsToolWindow/);
  assert.match(windowsMsiSmoke, /-not \$_\.IsCloaked/);
  assert.match(windowsMsiSmoke, /\$_\.Width -gt 0/);
  assert.match(windowsMsiSmoke, /\$ExpectedTitles -contains \$_\.Title/);
  assert.match(windowsMsiSmoke, /verify-windows-app-database\.mjs/);
  assert.match(windowsMsiSmoke, /PostMessageW/);
  assert.match(windowsMsiSmoke, /WmClose = 0x0010/);
  assert.match(windowsMsiSmoke, /function Request-AppWindowClose/);
  assert.match(windowsMsiSmoke, /\$appProcess\.WaitForExit\(15000\)/);
  assert.equal(
    countOccurrences(windowsMsiSmoke, "Request-AppWindowClose `"),
    2,
  );
  assert.doesNotMatch(windowsMsiSmoke, /\.MainWindowHandle/);
  assert.doesNotMatch(windowsMsiSmoke, /\.CloseMainWindow\(\)/);
  assert.match(windowsMsiSmoke, /desktop-lifecycle\.json/);
  assert.match(windowsMsiSmoke, /continue_in_background/);
  assert.match(
    windowsMsiSmoke,
    /\[IO\.File\]::WriteAllText\([\s\S]*?\[Text\.UTF8Encoding\]::new\(\$false\)/,
  );
  assert.match(
    windowsMsiSmoke,
    /Start-Process[\s\S]*?-ArgumentList "--background"[\s\S]*?-PassThru/,
  );
  assert.match(windowsMsiSmoke, /function Wait-ForHiddenRunningProcess/);
  assert.match(windowsMsiSmoke, /\$Process\.HasExited/);
  assert.match(windowsMsiSmoke, /Get-VisibleUserFacingWindows/);
  assert.match(windowsMsiSmoke, /Get-VisibleExpectedAppWindows/);
  assert.match(windowsMsiSmoke, /Format-ProcessWindowSnapshot/);
  assert.match(windowsMsiSmoke, /\$visibleAppWindows\.Count -eq 0/);
  const hiddenWindowWait = readSection(
    windowsMsiSmoke,
    "function Wait-ForHiddenRunningProcess",
    "$resolvedMsiPath =",
  );
  assert.match(hiddenWindowWait, /Get-VisibleUserFacingWindows/);
  assert.doesNotMatch(hiddenWindowWait, /ExpectedTitles/);
  assert.doesNotMatch(hiddenWindowWait, /Get-VisibleExpectedAppWindows/);
  assert.match(
    windowsMsiSmoke,
    /Get-CimInstance[\s\S]*?Win32_Process[\s\S]*?--background/,
  );
  assert.match(windowsMsiSmoke, /-StableCheckCount 6/);
  assert.match(windowsMsiSmoke, /Observed window title: \$observedWindowTitle/);
  assert.doesNotMatch(windowsMsiSmoke, /\$observedTitle/);
  assert.match(
    windowsMsiSmoke,
    /\$secondaryProcess = Start-Process[\s\S]*?\$secondaryProcess\.WaitForExit\(15000\)/,
  );
  assert.match(windowsMsiSmoke, /\$restoredWindowReady/);
  assert.match(windowsMsiSmoke, /\$matchingProcesses\.Count -ne 1/);
  assert.match(
    windowsMsiSmoke,
    /\$matchingProcesses\[0\]\.Id -ne \$backgroundPrimaryProcessId/,
  );
  assert.match(
    windowsMsiSmoke,
    /Stop-Process -Id \$backgroundPrimaryProcessId -Force/,
  );
  assert.match(windowsMsiSmoke, /function Test-RegistryValue/);
  assert.match(windowsMsiSmoke, /GetValueNames\(\)/);
  assert.match(
    windowsMsiSmoke,
    /HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run/,
  );
  assert.match(
    windowsMsiSmoke,
    /HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run/,
  );
  assert.match(windowsMsiSmoke, /no\.bliatun\.filamentmanager/);
  assert.match(windowsMsiSmoke, /Filament Manager/);
  assert.match(windowsMsiSmoke, /PropertyType = "String"/);
  assert.match(windowsMsiSmoke, /PropertyType = "Binary"/);
  assert.match(windowsMsiSmoke, /Autostart smoke precondition failed/);
  assert.match(windowsMsiSmoke, /New-ItemProperty/);
  assert.match(windowsMsiSmoke, /Remove-ItemProperty/);
  assert.match(
    windowsMsiSmoke,
    /Uninstall left app-owned autostart registry value/,
  );

  const autostartTargets = readSection(
    windowsMsiSmoke,
    "$autostartRegistryTargets = @(",
    "$transcriptStarted = $false",
  );
  assert.equal(countOccurrences(autostartTargets, "[PSCustomObject]@{"), 4);
  assert.equal(countOccurrences(autostartTargets, "Path = $runRegistryPath"), 2);
  assert.equal(
    countOccurrences(autostartTargets, "Path = $startupApprovedRegistryPath"),
    2,
  );
  assert.equal(
    countOccurrences(autostartTargets, "Name = $stableAutostartValueName"),
    2,
  );
  assert.equal(
    countOccurrences(autostartTargets, "Name = $legacyAutostartValueName"),
    2,
  );
  assert.equal(countOccurrences(autostartTargets, 'PropertyType = "String"'), 2);
  assert.equal(countOccurrences(autostartTargets, 'PropertyType = "Binary"'), 2);

  const defaultCloseIndex = windowsMsiSmoke.indexOf(
    '-Description "The app\'s normal main window"',
  );
  const preferencesWriteIndex = windowsMsiSmoke.indexOf(
    "[IO.File]::WriteAllText(",
    defaultCloseIndex,
  );
  const backgroundLaunchIndex = windowsMsiSmoke.indexOf(
    '-ArgumentList "--background"',
    preferencesWriteIndex,
  );
  const secondaryLaunchIndex = windowsMsiSmoke.indexOf(
    "$secondaryProcess = Start-Process",
    backgroundLaunchIndex,
  );
  const closeToTrayIndex = windowsMsiSmoke.indexOf(
    '-Description "The background-enabled app\'s restored main window"',
    secondaryLaunchIndex,
  );
  const registrySeedIndex = windowsMsiSmoke.indexOf(
    "New-ItemProperty",
    closeToTrayIndex,
  );
  const realUninstallIndex = windowsMsiSmoke.indexOf(
    'Invoke-MsiExec -Action "/x" -Target $productCode -LogPath $uninstallLogPath',
  );
  const registryRemovalAssertionIndex = windowsMsiSmoke.indexOf(
    "Uninstall left app-owned autostart registry value",
    realUninstallIndex,
  );
  const registrySeedSection = windowsMsiSmoke.slice(
    registrySeedIndex,
    realUninstallIndex,
  );
  assert.doesNotMatch(registrySeedSection, /-Force/);
  assert.match(
    windowsMsiSmoke,
    /foreach \(\$registryTarget in \$seededAutostartRegistryTargets\)[\s\S]*?Remove-ItemProperty/,
  );
  const lifecycleOrder = [
    defaultCloseIndex,
    preferencesWriteIndex,
    backgroundLaunchIndex,
    secondaryLaunchIndex,
    closeToTrayIndex,
    registrySeedIndex,
    realUninstallIndex,
    registryRemovalAssertionIndex,
  ];
  assert.equal(lifecycleOrder.every((position) => position >= 0), true);
  assert.deepEqual(
    lifecycleOrder,
    [...lifecycleOrder].sort((left, right) => left - right),
  );
  assert.match(windowsMsiSmoke, /Get-FileHash[\s\S]*-Algorithm SHA256/);
  assert.match(windowsMsiSmoke, /Invoke-MsiExec -Action "\/x"/);
  assert.match(windowsMsiSmoke, /Uninstall left Windows Installer product state/);
  assert.match(windowsMsiSmoke, /Uninstall left the Desktop shortcut behind/);
  assert.match(windowsMsiSmoke, /Uninstall left the Start Menu shortcut behind/);
  assert.match(windowsMsiSmoke, /Uninstall left the Start Menu product directory behind/);
  assert.match(windowsMsiSmoke, /Uninstall left the install directory in the user PATH/);
  assert.match(windowsMsiSmoke, /Uninstall removed the user database instead of retaining it/);
  assert.match(windowsMsiSmoke, /The retained database changed during uninstall/);
  assert.match(
    windowsMsiSmoke,
    /\$applicationStoppedForCleanup -and[\s\S]*?\$canRemoveSmokeAppData -and[\s\S]*?Test-Path -LiteralPath \$resolvedAppDataDirectory/,
  );

  assert.match(windowsDatabaseVerifier, /pragma\("quick_check", \{ simple: true \}\)/);
  assert.match(windowsDatabaseVerifier, /pragma\("user_version", \{ simple: true \}\)/);
  assert.match(windowsDatabaseVerifier, /REQUIRED_WINDOWS_SMOKE_SCHEMA_VERSION/);
  assert.match(windowsDatabaseVerifier, /pragma\("foreign_key_check"\)/);
  assert.match(windowsDatabaseVerifier, /filament_master_list/);
  assert.match(windowsDatabaseVerifier, /filament_spools/);
  assert.match(windowsDatabaseVerifier, /settings/);
  assert.match(windowsDatabaseVerifier, /readonly: true/);
  assert.match(windowsDatabaseVerifier, /fileMustExist: true/);
});

test("macOS DMG smoke installs and launches the verified application", () => {
  assert.equal(existsSync("scripts/smoke-macos-dmg.mjs"), true);
  assert.match(macosDmgSmoke, /hdiutil/);
  assert.match(macosDmgSmoke, /command: "ditto"/);
  assert.doesNotMatch(macosDmgSmoke, /--noextattr|--noqtn|\bxattr\b/);
  assert.match(macosDmgSmoke, /codesign/);
  assert.match(macosDmgSmoke, /spctl/);
  assert.match(macosDmgSmoke, /validateCodesignDetails/);
  assert.match(macosDmgSmoke, /expectedTeamId/);
  assert.match(macosDmgSmoke, /"\/usr\/bin\/open"/);
  assert.match(macosDmgSmoke, /macosLaunchServicesArguments/);
  assert.match(macosDmgSmoke, /resolveMacosDmgSmokeStagingPaths/);
  assert.match(macosDmgSmoke, /createMacosDmgSmokeStaging/);
  assert.match(macosDmgSmoke, /validateMacosDmgSmokeStaging/);
  assert.match(macosDmgSmoke, /cleanupMacosDmgSmokeStaging/);
  assert.match(macosDmgSmoke, /"Applications"/);
  assert.match(macosDmgSmoke, /chmodSync\(stagingDirectory, 0o700\)/);
  assert.match(macosDmgSmoke, /resolveMacosDmgSmokeLogPaths/);
  assert.match(macosDmgSmoke, /"runtime-logs"/);
  assert.match(macosDmgSmoke, /publishMacosDmgSmokeRuntimeLogs/);
  assert.match(macosDmgSmoke, /copyFileSync/);
  assert.match(macosDmgSmoke, /renameSync/);
  assert.match(macosDmgSmoke, /chmodSync\(temporaryPath, 0o600\)/);
  assert.doesNotMatch(
    macosDmgSmoke,
    /path\.join\(logDirectory, "app-(?:stdout|stderr)\.log"\)/,
  );
  assert.match(
    macosDmgSmoke,
    /appStdoutPath: stdoutPath,[\s\S]*?logPaths\.runtimePaths/,
  );
  assert.doesNotMatch(
    macosDmgSmoke,
    /path\.join\(temporaryDirectory, "Applications"\)/,
  );
  assert.match(macosDmgSmoke, /bundlePaths/);
  assert.match(macosDmgSmoke, /executablePaths/);
  assert.match(macosDmgSmoke, /FILAMENT_MANAGER_DB_PATH/);
  assert.match(macosDmgSmoke, /quick_check/);
  assert.match(macosDmgSmoke, /foreign_key_check/);
  assert.match(macosDmgSmoke, /macos-window-info\.swift/);
  assert.match(macosDmgSmoke, /SIGTERM/);
  assert.match(macosWindowHelper, /running-apps/);
  assert.match(macosWindowHelper, /kCGWindowOwnerPID/);
  const detachIndex = macosDmgSmoke.lastIndexOf(
    'runCommand("hdiutil", ["detach"',
  );
  const publishLogsIndex = macosDmgSmoke.lastIndexOf(
    "publishMacosDmgSmokeRuntimeLogs(logPaths)",
  );
  const removeRuntimeIndex = macosDmgSmoke.lastIndexOf(
    "rmSync(temporaryDirectory",
  );
  assert.equal(detachIndex > 0, true);
  assert.equal(publishLogsIndex > detachIndex, true);
  assert.equal(removeRuntimeIndex > publishLogsIndex, true);
});

test("Windows MSI uninstall preserves the system Desktop directory", () => {
  assert.doesNotMatch(
    windowsWixTemplate,
    /<RemoveFolder\s+Id="DesktopFolder"\b/,
  );
});

test("Windows MSI remains a limited per-user package", () => {
  assert.match(
    windowsWixTemplate,
    /<Package[\s\S]*?\bInstallScope="perUser"[\s\S]*?\bInstallPrivileges="limited"[\s\S]*?\/>/,
  );
});

test("Windows MSI removes app-owned autostart values only on a real uninstall", () => {
  const uninstallOnlyCondition =
    '<![CDATA[REMOVE="ALL" AND NOT UPGRADINGPRODUCTCODE]]>';
  const runKey = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`;
  const startupApprovedKey =
    String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`;
  const cleanupActions = [
    {
      before: "RemoveStableStartupApproved",
      id: "RemoveStableRunAutostart",
      key: runKey,
      valueName: "no.bliatun.filamentmanager",
    },
    {
      before: "RemoveLegacyRunAutostart",
      id: "RemoveStableStartupApproved",
      key: startupApprovedKey,
      valueName: "no.bliatun.filamentmanager",
    },
    {
      before: "RemoveLegacyStartupApproved",
      id: "RemoveLegacyRunAutostart",
      key: runKey,
      valueName: "Filament Manager",
    },
    {
      before: "InstallFinalize",
      id: "RemoveLegacyStartupApproved",
      key: startupApprovedKey,
      valueName: "Filament Manager",
    },
  ];

  for (const { before, id, key, valueName } of cleanupActions) {
    const definition = readSection(
      windowsWixTemplate,
      `<CustomAction Id="${id}"`,
      "/>",
    );
    const schedule = readSection(
      windowsWixTemplate,
      `<Custom Action="${id}"`,
      "</Custom>",
    );
    const expectedCommand =
      `ExeCommand='&quot;[SystemFolder]reg.exe&quot; DELETE ` +
      `&quot;${key}&quot; /v &quot;${valueName}&quot; /f'`;

    assert.match(definition, /\bDirectory="TARGETDIR"/);
    assert.equal(definition.includes(expectedCommand), true);
    assert.match(definition, /\bExecute="commit"/);
    assert.match(definition, /\bImpersonate="yes"/);
    assert.match(definition, /\bReturn="ignore"/);
    assert.match(schedule, new RegExp(`\\bBefore="${before}"`));
    assert.equal(schedule.includes(uninstallOnlyCondition), true);
  }

  assert.equal(
    countOccurrences(windowsWixTemplate, uninstallOnlyCondition),
    cleanupActions.length,
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
    "Exercise clean MSI installation",
    "Upload MSI smoke logs",
  ]);
  assert.match(windowsJob, /timeout-minutes: 60/);
  assert.match(
    windowsJob,
    /npm run tauri -- build --debug --bundles msi --config "\$env:MSI_VERSION_CONFIG_PATH"/,
  );
  assert.match(windowsJob, /-MsiDirectory "target\/debug\/bundle\/msi"/);
  assert.match(windowsJob, /-ExpectedArchitecture "x64"/);
  assert.match(
    windowsJob,
    /-NormalizedFileName "Filament-Manager_\$\(\$tauriConfig\.version\)_x64_en-US\.msi"/,
  );
  assert.match(windowsJob, /\.\/scripts\/smoke-windows-msi\.ps1/);
  assert.match(windowsJob, /-ExpectedExecutableName "bambu-filament-manager\.exe"/);
  assert.match(
    windowsJob,
    /-ExpectedWindowTitles @\(\$tauriConfig\.productName, "Dashboard"\)/,
  );
  assert.match(windowsJob, /-ExpectedDatabaseName "filament-manager\.db"/);
  assert.match(windowsJob, /-SignaturePolicy "UnsignedRequired"/);
  assert.match(
    windowsJob,
    /- name: Upload MSI smoke logs\s+if: always\(\)[\s\S]*?if-no-files-found: warn[\s\S]*?retention-days: 7/,
  );
});

test("CI executes real browser accessibility and sanitized Companion workflows", () => {
  const macosJob = readSection(ciWorkflow, "  macos-smoke:", "  windows-smoke:");
  const windowsJobStart = ciWorkflow.indexOf("  windows-smoke:");
  assert.notEqual(windowsJobStart, -1, "Missing workflow section: windows-smoke:");
  const windowsJob = ciWorkflow.slice(windowsJobStart);

  assert.equal(
    ciWorkflow.split("persist-credentials: false").length - 1,
    2,
    "every smoke checkout must discard its GitHub credential",
  );

  assert.match(packageManifest.scripts.smoke, /npm run test:a11y:app-modal/);
  assert.match(packageManifest.scripts.smoke, /npm run test:a11y:data-backed/);
  assertStepOrder(macosJob, [
    "Install root dependencies",
    "Install Playwright Chromium",
    "Run full verification",
    "Run data-backed Companion E2E",
  ]);
  assertStepOrder(windowsJob, [
    "Install root dependencies",
    "Install Playwright Chromium",
    "Run full verification",
  ]);
  assert.match(
    macosJob,
    /- name: Install Playwright Chromium\s+run: node \.\/node_modules\/playwright\/cli\.js install chromium/,
  );
  assert.match(
    windowsJob,
    /- name: Install Playwright Chromium\s+run: node \.\/node_modules\/playwright\/cli\.js install chromium/,
  );
  assert.match(
    macosJob,
    /- name: Run data-backed Companion E2E\s+timeout-minutes: 10\s+run: npm run qa:visual:companion:data-e2e -- --startup-timeout-ms 120000[ \t]*(?:\r?\n|$)/,
  );
});

test("macOS CI makes the sanitized database upgrade smoke a release gate", () => {
  const macosJob = readSection(ciWorkflow, "  macos-smoke:", "  windows-smoke:");
  const publishJob = readSection(releaseWorkflow, "  publish-github-release:");
  const requiredChecksStep = readSection(
    publishJob,
    "      - name: Require successful CI checks",
    "      - name: Checkout release notes",
  );

  assert.equal(
    packageManifest.scripts["qa:release:upgrade-ci-fixture"],
    "node ./scripts/prepare-ci-release-upgrade-fixture.mjs",
  );
  assert.equal(
    packageManifest.scripts["smoke:release:database-upgrade"],
    "node ./scripts/smoke-release-database-upgrade.mjs",
  );
  assert.match(macosJob, /timeout-minutes: 45/);
  assert.match(
    macosJob,
    /- name: Build database upgrade candidate\s+run: cargo build --locked --package bambu-filament-manager/,
  );
  assert.match(
    macosJob,
    /npm run qa:release:upgrade-ci-fixture --[\s\S]*?--output="\$FILAMENT_MANAGER_UPGRADE_FIXTURE_PATH"/,
  );
  assert.match(
    macosJob,
    /npm run smoke:release:database-upgrade --[\s\S]*?--database="\$FILAMENT_MANAGER_UPGRADE_FIXTURE_PATH"[\s\S]*?--executable=target\/debug\/bambu-filament-manager[\s\S]*?--launch-timeout-ms=120000[\s\S]*?--database-readiness-only/,
  );
  assert.match(
    macosJob,
    /- name: Upload database upgrade smoke logs\s+if: always\(\)[\s\S]*?if-no-files-found: warn[\s\S]*?retention-days: 7/,
  );
  assert.match(
    requiredChecksStep,
    /required_checks=\("macOS Smoke" "Windows Smoke"\)/,
  );
  assertStepOrder(macosJob, [
    "Run full verification",
    "Run data-backed Companion E2E",
    "Build database upgrade candidate",
    "Prepare sanitized historical database fixture",
    "Exercise database upgrade and restart",
    "Upload database upgrade smoke logs",
  ]);
});

test("packaged releases preserve pinned v0.27 data on DMG and MSI", () => {
  const fixtureJob = readSection(
    releaseWorkflow,
    "  prepare-previous-release-fixture:",
    "  build-macos-dmg:",
  );
  const macosJob = readSection(
    releaseWorkflow,
    "  build-macos-dmg:",
    "  smoke-macos-dmg-intel:",
  );
  const windowsJob = readSection(
    releaseWorkflow,
    "  build-windows-msi:",
    "  generate-release-sbom:",
  );

  assert.equal(
    packageManifest.scripts["qa:release:previous-fixture"],
    "node ./scripts/prepare-previous-release-upgrade-fixture.mjs",
  );
  assert.match(
    previousReleaseFixturePreparer,
    /PREVIOUS_RELEASE_VERSION = "0\.27\.0"/,
  );
  assert.match(
    previousReleaseFixturePreparer,
    /PREVIOUS_RELEASE_SCHEMA_VERSION = 2/,
  );
  assert.match(
    previousReleaseFixturePreparer,
    /PREVIOUS_RELEASE_COMMIT =\s*\n\s*"4a1c57a10255c26f70f749fc33ff5ae25e23b1ce"/,
  );
  assert.match(
    previousReleaseFixturePreparer,
    /requiresSchemaMigration:[\s\S]*?source\.schemaVersion < expectedCurrentSchemaVersion/,
  );
  assert.match(
    previousReleaseFixturePreparer,
    /"same-schema-compatibility"/,
  );

  assert.match(fixtureJob, /name: Prepare v0\.27 database fixture/);
  assert.match(fixtureJob, /needs: validate-release/);
  assert.match(
    fixtureJob,
    /ref: 4a1c57a10255c26f70f749fc33ff5ae25e23b1ce/,
  );
  assert.match(fixtureJob, /path: previous-release-v0\.27\.0/);
  assert.match(fixtureJob, /npm --prefix \.\/previous-release-v0\.27\.0 ci/);
  assert.match(
    fixtureJob,
    /npm run qa:release:previous-fixture --[\s\S]*?--source=previous-release-v0\.27\.0[\s\S]*?--database="\$database_path"[\s\S]*?--manifest="\$manifest_path"/,
  );
  assert.match(
    fixtureJob,
    /npm run qa:release:previous-fixture --[\s\S]*?--verify/,
  );
  assert.match(
    fixtureJob,
    /name: filament-manager-v0\.27\.0-database-fixture-\$\{\{ github\.run_id \}\}[\s\S]*?if-no-files-found: error[\s\S]*?retention-days: 1/,
  );

  for (const job of [macosJob, windowsJob]) {
    assert.match(
      job,
      /needs:\s*\n\s+- validate-release\s*\n\s+- prepare-previous-release-fixture/,
    );
    assert.match(job, /- name: Download sanitized v0\.27 fixture/);
    assert.match(job, /- name: Verify downloaded v0\.27 fixture/);
    assert.match(
      job,
      /npm run qa:release:previous-fixture --[\s\S]*?--verify/,
    );
  }

  assert.match(
    macosJob,
    /- name: Exercise installed signed application on Apple Silicon[\s\S]*?--upgrade-fixture="\$PREVIOUS_RELEASE_FIXTURE_DIR\/filament-manager-v0\.27\.0\.db"[\s\S]*?--upgrade-source-release=v0\.27\.0/,
  );
  assert.match(macosDmgSmoke, /smokeReleaseDatabaseUpgrade/);
  assert.match(macosDmgSmoke, /allowCurrentSchema: true/);
  assert.match(macosDmgSmoke, /requireVisibleWindow: false/);

  assert.match(
    windowsJob,
    /-UpgradeFixturePath \(Join-Path \$env:PREVIOUS_RELEASE_FIXTURE_DIR "filament-manager-v0\.27\.0\.db"\)/,
  );
  assert.match(windowsJob, /-UpgradeSourceRelease "v0\.27\.0"/);
  assert.match(windowsMsiSmoke, /\[string\]\$UpgradeFixturePath = ""/);
  assert.match(windowsMsiSmoke, /\[string\]\$UpgradeSourceRelease = ""/);
  assert.match(
    windowsMsiSmoke,
    /smoke-release-database-upgrade\.mjs[\s\S]*?--database-readiness-only[\s\S]*?--allow-current-schema[\s\S]*?--source-release=\$UpgradeSourceRelease/,
  );
  assert.match(
    releaseDatabaseUpgradeSmoke,
    /if \(before\.schemaVersion === expectedSchemaVersion && !allowCurrentSchema\)/,
  );
  assert.match(
    releaseDatabaseUpgradeSmoke,
    /same-schema compatibility from \$\{sourceRelease\}/,
  );

  assertStepOrder(macosJob, [
    "Download sanitized v0.27 fixture",
    "Verify downloaded v0.27 fixture",
    "Build signed and notarized DMG",
    "Exercise installed signed application on Apple Silicon",
  ]);
  assertStepOrder(windowsJob, [
    "Download sanitized v0.27 fixture",
    "Verify downloaded v0.27 fixture",
    "Build MSI bundle",
    "Exercise release MSI installation from downloaded artifact",
  ]);
});

test("release workflow keeps the protected macOS signing sequence fail-closed", () => {
  const macosJob = readSection(
    releaseWorkflow,
    "  build-macos-dmg:",
    "  smoke-macos-dmg-intel:",
  );
  const intelMacosSmokeJob = readSection(
    releaseWorkflow,
    "  smoke-macos-dmg-intel:",
    "  build-windows-msi:",
  );

  assert.equal(existsSync(".github/workflows/macos-signed-release.yml"), false);
  assert.doesNotMatch(releaseWorkflow, /macos-signed-release\.yml/);
  assert.match(releaseWorkflow, /permissions:\s*\n\s*contents: read/);
  assert.match(macosJob, /environment: macos-release/);
  assert.match(macosJob, /runs-on: macos-15/);
  assert.match(
    macosJob,
    /targets: aarch64-apple-darwin,x86_64-apple-darwin/,
  );
  assert.match(macosJob, /runner_architecture="\$\(uname -m\)"/);
  assert.match(macosJob, /"\$runner_architecture" != "arm64"/);
  assert.match(macosJob, /- name: Prepare Apple credentials/);
  assert.match(macosJob, /APPLE_API_ISSUER: \$\{\{ secrets\.APPLE_API_ISSUER \}\}/);
  assert.match(macosJob, /APPLE_API_PRIVATE_KEY: \$\{\{ secrets\.APPLE_API_PRIVATE_KEY \}\}/);
  assert.match(macosJob, /APPLE_CERTIFICATE: \$\{\{ secrets\.APPLE_CERTIFICATE \}\}/);
  assert.match(macosJob, /APPLE_TEAM_ID: \$\{\{ secrets\.APPLE_TEAM_ID \}\}/);
  assert.match(
    macosJob,
    /EXPECTED_APPLE_TEAM_ID: \$\{\{ vars\.EXPECTED_APPLE_TEAM_ID \}\}/,
  );
  assert.match(
    macosJob,
    /"\$APPLE_TEAM_ID" != "\$EXPECTED_APPLE_TEAM_ID"/,
  );
  assert.match(macosJob, /FILAMENT_MANAGER_REQUIRE_MACOS_SIGNING: "1"/);
  assert.match(
    macosJob,
    /npm run tauri --[\s\S]*?build[\s\S]*?--target universal-apple-darwin[\s\S]*?--bundles dmg/,
  );
  assert.match(
    macosJob,
    /"\$CARGO_TARGET_DIR"\/universal-apple-darwin\/release\/bundle\/dmg\/\*\.dmg/,
  );
  assert.match(macosJob, /xcrun notarytool submit "\$FILAMENT_MANAGER_DMG_PATH"/);
  assert.match(macosJob, /--wait/);
  assert.match(macosJob, /xcrun stapler staple "\$FILAMENT_MANAGER_DMG_PATH"/);
  assert.match(macosJob, /xcrun stapler validate "\$FILAMENT_MANAGER_DMG_PATH"/);
  assert.match(
    macosJob,
    /npm run verify:macos-release --[\s\S]*?"\$FILAMENT_MANAGER_DMG_PATH"[\s\S]*?--architectures=arm64,x86_64/,
  );
  assert.match(macosJob, /npm run smoke:macos-dmg --/);
  assert.match(
    macosJob,
    /- name: Exercise installed signed application on Apple Silicon[\s\S]*?EXPECTED_APPLE_TEAM_ID: \$\{\{ vars\.EXPECTED_APPLE_TEAM_ID \}\}[\s\S]*?"\$FILAMENT_MANAGER_DMG_SMOKE_PATH"[\s\S]*?--expected-team-id="\$EXPECTED_APPLE_TEAM_ID"/,
  );
  assert.match(macosJob, /--launch-timeout-ms=120000/);
  assert.match(macosJob, /--signature-policy=release/);
  assert.match(
    macosJob,
    /- name: Upload installed macOS smoke logs\s+if: always\(\)[\s\S]*?if-no-files-found: warn[\s\S]*?retention-days: 7/,
  );
  assert.doesNotMatch(macosJob, /verify:macos-local/);
  assert.match(macosJob, /shasum -a 256 "\$dmg_name" > SHA256SUMS\.txt/);
  assert.match(
    macosJob,
    /name: filament-manager-macos-dmg-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(
    macosJob,
    /- name: Upload verified DMG artifact[\s\S]*?if-no-files-found: error\s+overwrite: true\s+retention-days: 14/,
  );
  assert.match(
    macosJob,
    /- name: Download release DMG candidate[\s\S]*?actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8\.0\.1[\s\S]*?name: filament-manager-macos-dmg-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(macosJob, /- name: Verify downloaded DMG candidate/);
  assert.match(macosJob, /shasum -a 256 --check SHA256SUMS\.txt/);
  assert.match(
    macosJob,
    /FILAMENT_MANAGER_DMG_SMOKE_PATH=\$\{candidate_dmgs\[0\]\}/,
  );
  assert.doesNotMatch(
    macosJob,
    /name: filament-manager-macos-dmg-\$\{\{ github\.ref_name \}\}/,
  );
  assert.match(
    macosJob,
    /universal-apple-darwin\/release\/bundle\/dmg\/\*\.dmg/,
  );
  assert.match(
    macosJob,
    /universal-apple-darwin\/release\/bundle\/dmg\/SHA256SUMS\.txt/,
  );
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
    "Download release DMG candidate",
    "Verify downloaded DMG candidate",
    "Exercise installed signed application on Apple Silicon",
    "Upload installed macOS smoke logs",
    "Remove Apple credentials",
  ]);

  assert.match(
    intelMacosSmokeJob,
    /needs:\s*\n\s+- validate-release\s*\n\s+- build-macos-dmg/,
  );
  assert.match(
    intelMacosSmokeJob,
    /if: >-\s+needs\['build-macos-dmg'\]\.result == 'success' &&\s+\(\s+github\.event_name == 'push' \|\|\s+github\.event\.inputs\.platform == 'both' \|\|\s+github\.event\.inputs\.platform == 'macos'\s+\)/,
  );
  assert.doesNotMatch(intelMacosSmokeJob, /environment:/);
  assert.match(intelMacosSmokeJob, /runs-on: macos-15-intel/);
  assert.match(intelMacosSmokeJob, /timeout-minutes: 30/);
  assert.match(
    intelMacosSmokeJob,
    /permissions:\s*\n\s+contents: read\s*\n\s+steps:/,
  );
  assert.match(intelMacosSmokeJob, /"\$runner_architecture" != "x86_64"/);
  assert.match(intelMacosSmokeJob, /- name: Install smoke dependencies\s+run: npm ci/);
  assert.match(
    intelMacosSmokeJob,
    /- name: Download Universal 2 DMG candidate[\s\S]*?actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8\.0\.1[\s\S]*?name: filament-manager-macos-dmg-\$\{\{ github\.run_id \}\}/,
  );
  assert.match(
    intelMacosSmokeJob,
    /- name: Verify downloaded Universal 2 DMG candidate[\s\S]*?shasum -a 256 --check SHA256SUMS\.txt[\s\S]*?npm run verify:macos-release --[\s\S]*?--architectures=arm64,x86_64/,
  );
  assert.match(
    intelMacosSmokeJob,
    /- name: Exercise installed signed application on Intel[\s\S]*?EXPECTED_APPLE_TEAM_ID: \$\{\{ vars\.EXPECTED_APPLE_TEAM_ID \}\}[\s\S]*?"\$FILAMENT_MANAGER_INTEL_DMG_SMOKE_PATH"[\s\S]*?--expected-team-id="\$EXPECTED_APPLE_TEAM_ID"/,
  );
  assert.match(intelMacosSmokeJob, /--launch-timeout-ms=120000/);
  assert.match(intelMacosSmokeJob, /--signature-policy=release/);
  assert.match(
    intelMacosSmokeJob,
    /- name: Upload Intel macOS smoke logs\s+if: always\(\)[\s\S]*?if-no-files-found: warn[\s\S]*?retention-days: 7/,
  );
  assert.doesNotMatch(
    intelMacosSmokeJob,
    /secrets\.|APPLE_API_(?:ISSUER|KEY|PRIVATE_KEY)|APPLE_CERTIFICATE|APPLE_SIGNING_IDENTITY|notarytool|stapler/,
  );
  assertStepOrder(intelMacosSmokeJob, [
    "Checkout release source",
    "Setup Node",
    "Require native Intel runner",
    "Install smoke dependencies",
    "Download Universal 2 DMG candidate",
    "Verify downloaded Universal 2 DMG candidate",
    "Exercise installed signed application on Intel",
    "Upload Intel macOS smoke logs",
  ]);
});
