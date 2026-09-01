import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageManifest = JSON.parse(readFileSync("package.json", "utf8"));
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const releaseWorkflow = readFileSync(
  ".github/workflows/release-build.yml",
  "utf8",
);
const qualityGates = readFileSync("docs/QUALITY_GATES.md", "utf8");
const performanceBaseline = readFileSync(
  "docs/PERFORMANCE_BASELINE.md",
  "utf8",
);
const localizationWorkflow = readFileSync("docs/LOCALIZATION.md", "utf8");
const accessibilityGate = readFileSync(
  "scripts/run-data-backed-accessibility.mjs",
  "utf8",
);
const tauriMain = readFileSync("src-tauri/src/main.rs", "utf8");
const hostClientResilienceGate = readFileSync(
  "src-tauri/src/library_sync_resilience_tests.rs",
  "utf8",
);
const packagedHostClientGate = readFileSync(
  "scripts/run-packaged-host-client-e2e.mjs",
  "utf8",
);

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  const endIndex = end
    ? source.indexOf(end, startIndex + start.length)
    : source.length;
  if (end) {
    assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  }
  return source.slice(startIndex, endIndex);
}

test("blocking quality gates retain named ownership and measurable thresholds", () => {
  for (const gate of [
    "Performance",
    "Host/Client resilience",
    "Client/Companion workflow parity",
    "Backup and database upgrade",
    "Accessibility",
    "Localization",
  ]) {
    assert.equal(
      new RegExp(
        `\\|\\s+${gate.replaceAll("/", "\\/")}\\s+\\|\\s+` + "`@bliatun-code`",
      ).test(qualityGates),
      true,
      `${gate} must retain a named owner`,
    );
  }

  assert.match(qualityGates, /10,000-spool/);
  assert.match(qualityGates, /separate Host operating-system process/);
  assert.match(
    qualityGates,
    /without reading or writing the Client's unrelated local library/,
  );
  assert.match(qualityGates, /SQLite `quick_check` is `ok`/);
  assert.match(qualityGates, /zero axe violations/);
  assert.match(qualityGates, /100% key and placeholder coverage/);
  assert.match(qualityGates, /zero English catalog-overlay fallback/);
  assert.match(qualityGates, /at least 95% translation signal/);

  assert.match(performanceBaseline, /10,000 spools/);
  assert.match(performanceBaseline, /Entry \(`index-\*`\) \| 300,000 bytes/);
  assert.match(performanceBaseline, /Inventory \| 260,000 bytes/);
  assert.match(localizationWorkflow, /100% key and placeholder coverage/);
  assert.match(localizationWorkflow, /at least 95% overall translation signal/);
  for (const tag of ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]) {
    assert.match(accessibilityGate, new RegExp(`"${tag}"`));
  }
});

test("Host Client resilience gate keeps its real process and authority coverage", () => {
  assert.match(tauriMain, /mod library_sync_resilience_tests;/);
  assert.match(
    hostClientResilienceGate,
    /Command::new\(std::env::current_exe\(\)/,
  );
  assert.match(hostClientResilienceGate, /CLIENT_DECOY_SPOOL_ID/);
  assert.match(hostClientResilienceGate, /client_shadow_spool/);
  assert.match(hostClientResilienceGate, /client_local_snapshot/);
  assert.match(hostClientResilienceGate, /ActiveLibraryGateway::new/);
  assert.match(hostClientResilienceGate, /fetch_library_sync_spools_blocking/);
  assert.match(
    hostClientResilienceGate,
    /fetch_cached_library_sync_spools_blocking/,
  );
  assert.match(
    hostClientResilienceGate,
    /start_trusted_lan_server_with_bound_listener/,
  );
  assert.match(hostClientResilienceGate, /refresh_library_sync_spool_cache/);
  assert.match(
    hostClientResilienceGate,
    /offline live Host read must fail explicitly/,
  );
  assert.match(hostClientResilienceGate, /offline Host write must fail closed/);
  assert.match(
    hostClientResilienceGate,
    /assert_ne!\(session_after_restart, session_before_restart\)/,
  );
  assert.match(
    hostClientResilienceGate,
    /real_tcp_client_completes_the_five_fixed_workflows_on_the_host/,
  );
  const fixedWorkflowGate = section(
    hostClientResilienceGate,
    "async fn real_tcp_client_completes_the_five_fixed_workflows_on_the_host()",
  );
  const cachedSpoolReadHelper = section(
    hostClientResilienceGate,
    "fn client_cached_spools(",
    "async fn run_blocking",
  );
  const hostSpoolReadHelper = section(
    hostClientResilienceGate,
    "async fn read_host_spools(",
    "async fn refresh_host_spool_cache",
  );
  assert.match(
    cachedSpoolReadHelper,
    /fetch_cached_library_sync_spools_blocking/,
  );
  assert.match(hostSpoolReadHelper, /fetch_library_sync_spools_blocking/);
  for (const productionPath of [
    "create_library_sync_host_spool_blocking",
    "read_host_spools",
    "client_cached_spools",
    "assign_library_sync_host_printer_slot_blocking",
    "fetch_cached_library_sync_printer_overview_blocking",
    "lend_library_sync_host_spool_blocking",
    "fetch_cached_library_sync_loans_blocking",
    "receive_library_sync_host_wishlist_item_blocking",
    "fetch_cached_library_sync_wishlist_blocking",
  ]) {
    assert.match(fixedWorkflowGate, new RegExp(productionPath));
  }
  assert.match(
    qualityGates,
    /cargo test -p bambu-filament-manager library_sync_resilience_tests -- --nocapture/,
  );
  assert.match(
    qualityGates,
    /npm run smoke:release:packaged-host-client-e2e --/,
  );
  assert.match(packagedHostClientGate, /host-generation-1/);
  assert.match(packagedHostClientGate, /client-offline/);
  assert.match(packagedHostClientGate, /client-recover/);
  assert.match(packagedHostClientGate, /client-cleanup/);
  assert.match(packagedHostClientGate, /hostHistoryCount !== 3/);
  assert.match(packagedHostClientGate, /clientHistoryCount !== 1/);
});

test("required platform jobs keep every documented gate blocking", () => {
  const smoke = packageManifest.scripts.smoke;
  for (const command of [
    "npm run test:a11y:app-modal",
    "npm run test:a11y:data-backed",
    "npm run test:scripts",
    "npm run test:performance",
    "npm run check:contracts",
  ]) {
    assert.match(smoke, new RegExp(command.replaceAll(" ", "\\s+")));
  }
  assert.match(packageManifest.scripts.verify, /npm run smoke/);
  assert.match(packageManifest.scripts.verify, /npm run test:rust/);
  assert.match(packageManifest.scripts["test:rust"], /cargo test/);
  assert.match(
    packageManifest.scripts["check:contracts"],
    /npm run check:shared-contracts/,
  );
  for (const command of [
    "npm run check:i18n-fallbacks",
    "npm run check:i18n-locales",
    "npm run check:companion-i18n",
    "npm run check:i18n-ui-copy",
    "npm run check:i18n-readiness",
  ]) {
    assert.match(
      packageManifest.scripts["check:contracts"],
      new RegExp(command.replaceAll(" ", "\\s+")),
    );
  }

  const sharedContractsJob = section(
    ciWorkflow,
    "  shared-contracts:",
    "  migration-integrity:",
  );
  assert.match(
    sharedContractsJob,
    /cargo run --locked --bin generate_shared_contracts -- --check/,
  );
  assert.match(
    sharedContractsJob,
    /cargo test --locked --lib shared_contracts::tests/,
  );
  assert.match(
    sharedContractsJob,
    /cargo test --locked --bin generate_shared_contracts/,
  );

  const macosJob = section(ciWorkflow, "  macos-smoke:", "  windows-smoke:");
  const windowsJob = section(ciWorkflow, "  windows-smoke:");
  const companionE2eStep = section(
    macosJob,
    "      - name: Run data-backed Companion E2E",
    "      - name: Build database upgrade candidate",
  );
  assert.match(macosJob, /run: npm run verify/);
  assert.match(companionE2eStep, /npm run qa:visual:companion:data-e2e/);
  assert.doesNotMatch(companionE2eStep, /continue-on-error:\s*true/);
  assert.match(windowsJob, /run: npm run verify/);
  assert.match(macosJob, /npm run smoke:release:database-upgrade/);
  assert.match(macosJob, /--packaged-host-client-e2e/);
  assert.match(windowsJob, /-RunPackagedHostClientE2E/);

  const publishJob = section(releaseWorkflow, "  publish-github-release:");
  assert.match(
    publishJob,
    /required_checks=\("Database Migration Integrity" "macOS Smoke" "Windows Smoke"\)/,
  );
});
