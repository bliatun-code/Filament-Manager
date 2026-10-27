import assert from "node:assert/strict";
import test from "node:test";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { waitForAccessibilityReady } from "./run-data-backed-accessibility.mjs";

test("accessibility waits for loaded controls and their opacity transition without hiding real contrast failures", { timeout: 10_000 }, async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`<section aria-busy="true">
      <button disabled style="color:#1e293b;background:#f8f9fb;font-size:14px;opacity:.5;transition:opacity 150ms">Open consumption</button>
    </section>`);
    await page.evaluate(() => {
      const button = document.querySelector("button");
      // Force the initial disabled style to be rendered before loading finishes.
      void button.offsetWidth;
      setTimeout(() => {
        document.querySelector("section").setAttribute("aria-busy", "false");
        button.disabled = false;
        button.style.opacity = "1";
      }, 100);
    });
    await waitForAccessibilityReady(page, 2_000);
    assert.equal(await page.locator("button").isEnabled(), true);
    assert.equal(await page.locator("button").evaluate((button) => getComputedStyle(button).opacity), "1");
    const scan = () => new AxeBuilder({ page }).include("button").withRules(["color-contrast"]).analyze();
    assert.deepEqual((await scan()).violations, []);

    await page.locator("button").evaluate((button) => { button.style.opacity = ".5"; });
    await waitForAccessibilityReady(page, 2_000);
    assert.deepEqual((await scan()).violations.map((violation) => violation.id), ["color-contrast"]);
  } finally {
    await browser.close();
  }
});

test("accessibility does not scan a visible panel that never finishes loading", { timeout: 10_000 }, async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<section aria-busy="true">Loading</section>');
    await assert.rejects(waitForAccessibilityReady(page, 100), /Timeout/);
  } finally {
    await browser.close();
  }
});
