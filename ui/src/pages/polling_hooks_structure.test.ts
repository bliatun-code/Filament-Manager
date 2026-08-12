import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const printerSource = readFileSync(
  new URL("./use_printer_page_data.ts", import.meta.url),
  "utf8",
);
const settingsPollingSource = readFileSync(
  new URL("./use_settings_silent_reload.ts", import.meta.url),
  "utf8",
);
const trustedLanSource = readFileSync(
  new URL("./use_trusted_lan_browser_polling.ts", import.meta.url),
  "utf8",
);
const dashboardSource = readFileSync(
  new URL("./use_dashboard_page_data.ts", import.meta.url),
  "utf8",
);

test("printer, settings, and trusted-LAN polling use the visibility-aware scheduler", () => {
  for (const source of [printerSource, settingsPollingSource, trustedLanSource]) {
    assert.match(source, /useDocumentVisiblePolling/);
    assert.doesNotMatch(source, /window\.setInterval/);
  }
});

test("dashboard polling pauses hidden timers and backs off failed refreshes", () => {
  assert.match(dashboardSource, /document\.visibilityState !== "hidden"/);
  assert.match(dashboardSource, /boundedPollingBackoffDelay/);
  assert.match(dashboardSource, /DASHBOARD_RETRY_MAX_DELAY_MS = 30_000/);
  assert.doesNotMatch(dashboardSource, /window\.setInterval/);
});

test("dashboard coalesces concurrent browser, visibility, and native focus refreshes", () => {
  assert.doesNotMatch(dashboardSource, /refreshRequested/);
  assert.match(
    dashboardSource,
    /DASHBOARD_FOCUS_DEDUPE_WINDOW_MS = 250/,
  );
  assert.match(
    dashboardSource,
    /let lastFocusRefreshAt = Number\.NEGATIVE_INFINITY/,
  );
  assert.match(
    dashboardSource,
    /const requestFocusRefresh = \(\) => \{\s*if \(!documentAllowsPolling\(\)\) \{\s*return;\s*\}[\s\S]*loading \|\|[\s\S]*now - lastFocusRefreshAt < DASHBOARD_FOCUS_DEDUPE_WINDOW_MS/,
  );
  assert.match(
    dashboardSource,
    /if \(payload\) \{\s*requestFocusRefresh\(\);/,
  );
});

test("trusted-LAN polling reports failures to the bounded scheduler", () => {
  assert.match(trustedLanSource, /failureMaxDelayMs: 30_000/);
  assert.match(trustedLanSource, /runImmediately: true/);
});

test("data polling checks domain revisions before full page reloads", () => {
  assert.match(printerSource, /fetchLibraryDomainRevisionsForSource/);
  assert.match(printerSource, /PRINTER_REVISION_DOMAINS/);
  assert.match(printerSource, /revisionPollComplete/);

  assert.match(settingsPollingSource, /revisionCheck: true/);

  assert.match(dashboardSource, /fetchLibraryDomainRevisionsForSource/);
  assert.match(dashboardSource, /DASHBOARD_REVISION_DOMAINS/);
  assert.match(dashboardSource, /getTrustedLanCompanionStatus/);
});

test("revision outages retain bounded periodic full-refresh fallbacks", () => {
  assert.match(
    printerSource,
    /await performReload\(\{ silent: true, refreshCatalog: true \}\)/,
  );
  assert.doesNotMatch(printerSource, /status !== "unavailable"/);

  assert.match(dashboardSource, /await performDashboardRefresh\(cancelledRef\)/);
  assert.doesNotMatch(dashboardSource, /status !== "unavailable"/);
});

test("one dashboard revision miss defers rather than doubling full refresh work", () => {
  assert.match(dashboardSource, /missedPolls >= 2/);
  assert.match(dashboardSource, /hostFailureConfirmationDue/);
  assert.match(
    dashboardSource,
    /DASHBOARD_REVISION_FALLBACK_INTERVAL_MS = 30_000/,
  );
  assert.match(
    dashboardSource,
    /if \(fallbackRefreshDue\) \{\s*await performDashboardRefresh\(cancelledRef\);/,
  );
});

test("an authenticated host revision poll closes a previous failure grace window", () => {
  assert.match(
    dashboardSource,
    /if \(source\.kind === "host"\) \{[\s\S]*createDashboardHostConnectionState\("live"\)[\s\S]*clientHostNeedsRepair: false,[\s\S]*clientHostPaired: true/,
  );
  assert.match(
    dashboardSource,
    /previousClientHostNeedsRepair:\s*clientHostNeedsRepairRef\.current/,
  );
  assert.match(
    dashboardSource,
    /clientHostNeedsRepairRef\.current = false/,
  );
});
