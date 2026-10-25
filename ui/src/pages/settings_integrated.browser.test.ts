import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { createVisualQaFixture } from "../../../scripts/create-visual-qa-fixture.mjs";
import { buildUiBrowserPerformanceFixture } from "../../../scripts/ui-browser-performance-probe.mjs";
import { createUiViteServer, installTauriFixtureBridge } from "../../../scripts/run-data-backed-accessibility.mjs";
import { cleanupVisualQaDatabase } from "../../../scripts/visual-qa-db.mjs";

test("all Settings sections work together in the app at desktop, narrow and enlarged-text sizes", { timeout: 120_000 }, async () => {
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
    await installTauriFixtureBridge(page, fixture, []);
    await page.goto(`http://127.0.0.1:${address.port}/?bfm_locale=en`);
    const navigation = page.getByRole("navigation", { name: "Navigation", exact: true });
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
        await page.screenshot({ path: resolve(out, `${name}-${index}.png`), fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await server.close();
    cleanupVisualQaDatabase(generated.outputPath);
  }
});
