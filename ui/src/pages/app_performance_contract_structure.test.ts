import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../App.tsx", import.meta.url),
  "utf8",
);
const dashboardDataSource = readFileSync(
  new URL("../lib/dashboard_data_source.ts", import.meta.url),
  "utf8",
);
const dashboardHookSource = readFileSync(
  new URL("./use_dashboard_page_data.ts", import.meta.url),
  "utf8",
);
const inventoryDataHookSource = readFileSync(
  new URL("../lib/use_inventory_page_data.ts", import.meta.url),
  "utf8",
);
const printerDataHookSource = readFileSync(
  new URL("./use_printer_page_data.ts", import.meta.url),
  "utf8",
);
const hostClientSource = readFileSync(
  new URL(
    "../../../src-tauri/src/library_sync_host_client.rs",
    import.meta.url,
  ),
  "utf8",
);
const hostValidationSource = readFileSync(
  new URL(
    "../../../src-tauri/src/library_sync_validation_commands.rs",
    import.meta.url,
  ),
  "utf8",
);

const pageModules = [
  "dashboard",
  "inventory",
  "loans",
  "printers",
  "settings",
  "statistics",
] as const;

function rustFunctionSource(
  source: string,
  name: string,
  nextName?: string,
): string {
  const start = source.indexOf(`fn ${name}`);
  const end = nextName
    ? source.indexOf(`fn ${nextName}`, start + 1)
    : source.length;
  assert.notEqual(start, -1, `missing Rust function ${name}`);
  if (nextName) {
    assert.notEqual(end, -1, `missing Rust function ${nextName}`);
  }
  return source.slice(start, end);
}

test("cold startup and first navigation keep every page behind a lazy chunk", () => {
  for (const page of pageModules) {
    assert.match(
      appSource,
      new RegExp(
        `const\\s+\\w+Page\\s*=\\s*lazy\\(\\(\\)\\s*=>\\s*import\\("\\./pages/${page}"\\)\\)`,
      ),
      `${page} must remain lazy-loaded`,
    );
    assert.doesNotMatch(
      appSource,
      new RegExp(`^import\\s+\\w+Page\\s+from\\s+"\\./pages/${page}";`, "m"),
      `${page} must not move into the cold-start chunk`,
    );
  }
  const navigationStart = appSource.indexOf("const navigateToPage =");
  const settingsNavigationStart = appSource.indexOf(
    "const openSettingsTab =",
    navigationStart,
  );
  assert.notEqual(navigationStart, -1);
  assert.notEqual(settingsNavigationStart, -1);
  const navigation = appSource.slice(
    navigationStart,
    settingsNavigationStart,
  );
  assert.match(
    navigation,
    /startTransition\(\(\) => \{[\s\S]*setActivePage\(page\);[\s\S]*\}\);/,
  );
  assert.doesNotMatch(navigation, /\bsetTimeout\s*\(/);
  assert.doesNotMatch(navigation, /\b(?:sleep|delay|wait)\s*\(/i);
});

test("dashboard startup has no artificial wait and keeps independent reads concurrent", () => {
  const loaderStart = dashboardDataSource.indexOf(
    "export async function loadDashboardData",
  );
  assert.notEqual(loaderStart, -1);
  const loader = dashboardDataSource.slice(loaderStart);

  assert.doesNotMatch(loader, /\bsetTimeout\s*\(/);
  assert.doesNotMatch(loader, /\b(?:sleep|delay|wait)\s*\(/i);
  assert.match(
    loader,
    /const \[syncSettings, trustedLan\] = await Promise\.all\(\[/,
  );
  assert.match(
    loader,
    /\] =\s*await Promise\.allSettled\(\[\s*fetchHostSnapshot\(/,
  );
  assert.doesNotMatch(loader, /\bvalidateHost\(/);
  assert.match(
    loader,
    /const \[overview, printers, spoolRowsRaw, loans, wishlist, printerSettings\] =\s*await Promise\.all\(\[/,
  );
  assert.ok(
    loader.indexOf("if (clientMode)") < loader.indexOf("loadPrinterSettings().catch"),
    "Host-only printer settings must not be read until Client mode has returned",
  );
  assert.doesNotMatch(loader, /fetchHostConsumption|listLocalTopMaterials/);
});

test("dashboard navigation restores its last-good view before background I/O", () => {
  const snapshotRead = dashboardHookSource.indexOf(
    "readDashboardPageSnapshot(locale)",
  );
  const refreshEffect = dashboardHookSource.indexOf(
    "const performDashboardRefresh = useCallback",
  );

  assert.notEqual(snapshotRead, -1);
  assert.notEqual(refreshEffect, -1);
  assert.ok(snapshotRead < refreshEffect);
  assert.match(
    dashboardHookSource,
    /usePageRefreshState\(tauri, initialSnapshot !== null\)/,
  );
  assert.match(
    dashboardHookSource,
    /\(\) => initialSnapshot\?\.stats \?\? createDefaultStats\(t, locale\)/,
  );
  assert.match(
    dashboardHookSource,
    /previousClientHostConnectionState:\s*clientHostConnectionStateRef\.current/,
  );
  assert.match(
    dashboardHookSource,
    /clientHostConnectionObservation === "checking"[\s\S]*settings\.librarySyncRefreshingSnapshot/,
  );
  assert.match(
    dashboardHookSource,
    /isDashboardHostFailureInGrace\([\s\S]*completeRefresh\(\);[\s\S]*succeeded: false/,
  );
});

test("inventory page refresh does not serialize independent page reads", () => {
  const refreshStart = inventoryDataHookSource.indexOf(
    "const refreshInventoryData = useCallback",
  );
  assert.notEqual(refreshStart, -1);
  const refreshSource = inventoryDataHookSource.slice(refreshStart);

  assert.match(
    refreshSource,
    /const refreshes = \[\s*reloadSpools\(reportResult\),\s*reloadWishlist\(reportResult\),\s*reloadActiveLoans\(reportResult\),\s*reloadPrinterOverview\(reportResult\),\s*\];/,
  );
  assert.doesNotMatch(refreshSource, /reloadCatalog\(reportResult\)/);
  assert.match(refreshSource, /await Promise\.all\(refreshes\)/);
  assert.doesNotMatch(refreshSource, /\bsetTimeout\s*\(/);
});

test("printer reloads discard stale library targets without dropping the replacement", () => {
  assert.match(printerDataHookSource, /const reloadRequestRef = useRef\(0\)/);
  assert.match(printerDataHookSource, /const dataSourceIdentity = \[/);
  assert.match(
    printerDataHookSource,
    /const loaded = await loadPrinterPageData\([\s\S]*?if \(!requestIsCurrent\(\)\) \{\s*return \{ succeeded: false, revisionPollComplete: false \};/,
  );
  assert.match(
    printerDataHookSource,
    /reloadRequestRef\.current \+= 1;[\s\S]*?setPrinters\(\[\]\);[\s\S]*?void reloadData\(\)/,
  );
  assert.doesNotMatch(printerDataHookSource, /reloadInFlightRef/);
});

test("Host reads stay bounded while non-idempotent mutations wait for a definitive result", () => {
  const validation = rustFunctionSource(
    hostValidationSource,
    "validate_library_sync_host",
  );
  assert.match(
    validation,
    /send_library_sync_request\([\s\S]*Duration::from_millis\(900\)/,
    "host validation must remain bounded to 0.9 seconds",
  );
  assert.match(
    hostClientSource,
    /fn library_sync_http_client_builder[\s\S]*\.timeout\(timeout\)/,
    "all host requests must apply their supplied timeout",
  );
  assert.match(
    hostClientSource,
    /const LIBRARY_SYNC_REQUEST_TIMEOUT: Duration = Duration::from_millis\(2500\)/,
    "standard host requests must remain bounded to 2.5 seconds",
  );

  for (const [name, nextName] of [
    ["fetch_library_sync_host_json", "pair_library_sync_host_session"],
    [
      "get_library_sync_host_json_authenticated",
      "post_library_sync_host_write_json",
    ],
  ] as const) {
    assert.match(
      rustFunctionSource(hostClientSource, name, nextName),
      /send_library_sync_request\([\s\S]*LIBRARY_SYNC_REQUEST_TIMEOUT/,
      `${name} must remain bounded to 2.5 seconds`,
    );
  }

  for (const [name, nextName] of [
    ["pair_library_sync_host_session", "renew_library_sync_host_session"],
    ["renew_library_sync_host_session", "load_library_sync_device_token"],
    ["post_library_sync_host_write_json", "perform_library_sync_host_write"],
  ] as const) {
    const source = rustFunctionSource(hostClientSource, name, nextName);
    assert.match(
      source,
      /send_library_sync_mutation_request/,
      `${name} must wait for one definitive non-replayed mutation result`,
    );
    assert.doesNotMatch(
      source,
      /LIBRARY_SYNC_REQUEST_TIMEOUT|\.timeout\(/,
      `${name} must not report a timeout while a non-cancellable Host mutation can still commit`,
    );
  }
});
