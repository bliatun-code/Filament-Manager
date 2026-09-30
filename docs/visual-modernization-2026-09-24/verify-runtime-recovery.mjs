// Read-only frontend regression through the repository fixture bridge.
// Requires review.db and Vite on port 5173; this is not native pairing evidence.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { installTauriFixtureBridge } from "../../scripts/run-data-backed-accessibility.mjs";
import { buildUiBrowserPerformanceFixture } from "../../scripts/ui-browser-performance-probe.mjs";

const fixture = buildUiBrowserPerformanceFixture("tmp/visual-modernization/review.db");
fixture.librarySyncSettings.mode = "HOST";
Object.assign(fixture.trustedLanStatus, {
  enabled: true,
  running: true,
  listen_port: 4287,
  local_name_running: false,
  local_name_error: "Synthetic temporary local-name failure",
  shell_reachable: false,
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const calls = [];
  await installTauriFixtureBridge(page, fixture, calls);
  await page.goto("http://127.0.0.1:5173/?bfm_locale=en");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Library & web app", exact: true }).click();
  const pairing = page.getByRole("button", { name: "Create pairing link", exact: true });
  await pairing.waitFor();
  assert.equal(await pairing.isDisabled(), true);
  await page.getByRole("button", { name: "Network details", exact: true }).click();
  await page.getByRole("button", { name: "Edit network", exact: true }).click();
  const port = page.getByLabel("Web app port", { exact: true });
  await port.fill("4499");
  const statusCalls = () => calls.filter(({ command }) => command === "get_trusted_lan_companion_status").length;
  const countBefore = statusCalls();

  Object.assign(fixture.trustedLanStatus, {
    local_name_running: true,
    local_name_error: null,
    shell_reachable: true,
    shell_url: "http://fm-synthetic.local:4287/companion",
    base_url: "http://fm-synthetic.local:4287",
    advertised_hostname: "fm-synthetic.local",
  });
  await page.waitForTimeout(6500);
  assert.equal(await pairing.isDisabled(), false, "Recovery must not require remounting Settings");
  assert.equal(await port.inputValue(), "4499", "Polling must preserve the unsaved network draft");
  assert.ok(statusCalls() > countBefore);
  console.log(JSON.stringify({ countBefore, countAfter: statusCalls(), pairingEnabled: true, draftPreserved: true }));
} finally {
  await browser.close();
}
