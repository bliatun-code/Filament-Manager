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
