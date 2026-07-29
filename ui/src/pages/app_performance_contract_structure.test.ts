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
    /\] = await Promise\.allSettled\(\[\s*validateHost\(/,
  );
  assert.match(
    loader,
    /const \[overview, printers, spoolRowsRaw, loans, wishlist, materialRows\] = await Promise\.all\(\[/,
  );
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
});

test("inventory page refresh does not serialize independent page reads", () => {
  const refreshStart = inventoryDataHookSource.indexOf(
    "const refreshInventoryData = useCallback",
  );
  assert.notEqual(refreshStart, -1);
  const refreshSource = inventoryDataHookSource.slice(refreshStart);

  assert.match(
    refreshSource,
    /const refreshes = \[\s*reloadSpools\(reportResult\),\s*reloadWishlist\(reportResult\),\s*reloadActiveLoans\(reportResult\),\s*reloadPrinterOverview\(reportResult\),\s*reloadCatalog\(reportResult\),\s*\];/,
  );
  assert.match(refreshSource, /await Promise\.all\(refreshes\)/);
  assert.doesNotMatch(refreshSource, /\bsetTimeout\s*\(/);
});

test("slow and interrupted hosts retain bounded validation and request timeouts", () => {
  const validation = rustFunctionSource(
    hostValidationSource,
    "validate_library_sync_host",
  );
  assert.match(
    validation,
    /\.timeout\(Duration::from_millis\(900\)\)/,
    "host validation must remain bounded to 0.9 seconds",
  );

  for (const [name, nextName] of [
    ["fetch_library_sync_host_json", "pair_library_sync_host_session"],
    ["pair_library_sync_host_session", "renew_library_sync_host_session"],
    ["renew_library_sync_host_session", "load_library_sync_device_token"],
    [
      "get_library_sync_host_json_authenticated",
      "post_library_sync_host_write_json",
    ],
  ] as const) {
    assert.match(
      rustFunctionSource(hostClientSource, name, nextName),
      /\.timeout\(Duration::from_millis\(2500\)\)/,
      `${name} must remain bounded to 2.5 seconds`,
    );
  }

  assert.match(
    rustFunctionSource(
      hostClientSource,
      "perform_library_sync_host_write_and_parse",
      "perform_library_sync_host_write_and_parse_with_timeout",
    ),
    /Duration::from_millis\(2500\)/,
    "default host writes must remain bounded to 2.5 seconds",
  );
});
