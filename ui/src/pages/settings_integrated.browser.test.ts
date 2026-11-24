import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser } from "playwright";
import { createVisualQaFixture } from "../../../scripts/create-visual-qa-fixture.mjs";
import { buildUiBrowserPerformanceFixture, resolveUiBrowserPerformanceInvoke } from "../../../scripts/ui-browser-performance-probe.mjs";
import { createUiViteServer, installTauriFixtureBridge } from "../../../scripts/run-data-backed-accessibility.mjs";
import { cleanupVisualQaDatabase } from "../../../scripts/visual-qa-db.mjs";

async function verifyOfflineInventoryActions(
  browser: Browser,
  url: string,
  fixture: ReturnType<typeof buildUiBrowserPerformanceFixture>,
) {
  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  const target = { base_url: "http://filament.local", expected_library_id: "offline-library", target_generation: 7 };
  const source = fixture.spoolRows[0];
  const saved = { ...source, spool: { ...source.spool, id: "cached-roll", status: "IN_STOCK" } };
  const client = { ...fixture, librarySyncSettings: { ...fixture.librarySyncSettings, mode: "CLIENT",
    host_base_url: target.base_url, library_id: target.expected_library_id, target_generation: 7, client_auth_paired: true } };
  let cacheReads = 0;
  try {
    await installTauriFixtureBridge(page, client, [], (data, command, payload) => {
      if (command === "fetch_cached_library_sync_spools") {
        assert.deepEqual(payload.input, target);
        cacheReads++;
        return { captured_at: "2026-01-01T12:00:00Z", rows: [saved] };
      }
      if (command.startsWith("fetch_library_sync_")) throw new Error("Host is offline");
      return resolveUiBrowserPerformanceInvoke(data, command, payload);
    });
    await page.goto(url + "/?bfm_locale=en&bfm_visual_qa=settings-general");
    await page.locator(".settings-general-balanced").waitFor();
    await page.locator("#settings-tab-maintenance").click();
    assert.equal(cacheReads, 0);
    for (const format of ["CSV", "JSON"]) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export inventory " + format, exact: true }).click();
      const path = await (await download).path();
      assert.ok(path);
      const content = await readFile(path, "utf8");
      const ids = format === "JSON"
        ? JSON.parse(content).map((row: { spool_id: string }) => row.spool_id)
        : content.trim().split(/\r?\n/).slice(1).map(line => line.split(",")[0]);
      assert.deepEqual(ids, ["cached-roll"]);
    }
    assert.equal(cacheReads, 2);
    await page.goto(url + "/?bfm_locale=en&bfm_visual_qa=inventory-label-sheet");
    await page.getByRole("img", { name: "Label preview cached-roll", exact: true }).waitFor();
    assert.ok(cacheReads > 2);
  } finally { await page.close(); }
}

test("all Settings sections work together in the app at desktop, narrow and enlarged-text sizes", { timeout: 120_000 }, async t => {
  const generated = createVisualQaFixture();
  const fixture = buildUiBrowserPerformanceFixture(generated.outputPath);
  const server = await createUiViteServer({ configFile: resolve("ui/vite.config.ts"), root: resolve("ui"), logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== "string");
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const calls: { command: string }[] = [];
    await installTauriFixtureBridge(page, fixture, calls);
    await page.goto(`http://127.0.0.1:${address.port}/?bfm_locale=en`);
    const navigation = page.getByRole("navigation", { name: "Navigation", exact: true });
    calls.length = 0;
    await navigation.getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator(".settings-general-balanced").waitFor();
    const tabs = page.getByRole("tablist", { name: "Settings", exact: true });
    const sections = ["General", "Filament defaults", "Library & web app", "3D printers", "Filament catalogue", "App maintenance"];
    const out = resolve("release-artifacts/visual-qa/settings-integrated");
    await mkdir(out, { recursive: true });
    for (const [name, width, fontSize] of [["desktop", 1440, 16], ["narrow", 390, 16], ["text-200", 1440, 32]] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, fontSize);
      for (let index = 0; index < sections.length; index++) {
        // Use the accessible tab order; translated labels are verified in the per-section gates.
        const tab = tabs.getByRole("tab").nth(index);
        await tab.click();
        await page.getByRole("tabpanel").waitFor();
        assert.equal(await page.getByRole("tabpanel").count(), 1);
        await page.getByRole("tabpanel").getByText("Loading page...", { exact: true }).waitFor({ state: "hidden" });
        await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))); });
        const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(geometry.scroll <= geometry.width + 2, `${name} · ${sections[index]}: ${JSON.stringify(geometry)}`);
        const result = await new AxeBuilder({ page }).include(".settings-balanced-layout").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `${name} · ${sections[index]}`);
        if (name === "desktop" && index < 2) {
          assert.ok(calls.some(call => call.command === "get_library_sync_settings"));
          for (const command of ["list_spools", "get_filament_standards"]) {
            assert.equal(calls.some(call => call.command === command), index === 1, sections[index] + " " + command);
          }
        }
        await page.screenshot({ path: resolve(out, `${name}-${index}.png`), fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    const url = `http://127.0.0.1:${address.port}`;
    await t.test("CSV, JSON and label sheets use the paired library's offline copy", () =>
      verifyOfflineInventoryActions(browser, url, fixture));
  } finally {
    if (browser) await browser.close();
    await server.close();
    cleanupVisualQaDatabase(generated.outputPath);
  }
});
