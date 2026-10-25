import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { CATALOG_LOCALES } from "../../../src-tauri/companion_browser/supported_locales.js";

const UI_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUTPUT = resolve("release-artifacts/visual-qa/balanced-dashboard-locales");

test("balanced dashboard renders every published locale, plural form and narrow purchase control", {timeout: 360_000}, async context => {
  const built = await build({
    root: UI_ROOT, configFile: false, logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [{
      name: "isolated-dashboard-locale-data", enforce: "pre",
      resolveId: (id, importer) => id === "./use_dashboard_page_data" && importer?.endsWith("/pages/dashboard.tsx") ? "\0dashboard-locale-data" : null,
      load: id => id === "\0dashboard-locale-data" ? "export function useDashboardPageData(){return window.dashboardLocaleQaData;}" : null,
    }, tailwindcss(), react()],
    build: { write: false, minify: false, cssCodeSplit: false, lib: {
      entry: fileURLToPath(new URL("../../test-fixtures/dashboard_locale_browser_entry.tsx", import.meta.url)),
      formats: ["iife"], name: "DashboardLocaleQa",
    } },
  });
  const outputs = (Array.isArray(built) ? built : [built]).flatMap(result => "output" in result ? result.output : []);
  const script = outputs.find(item => item.type === "chunk" && item.isEntry);
  assert.ok(script?.type === "chunk");
  const css = outputs.filter(item => item.type === "asset" && item.fileName.endsWith(".css")).map(item => item.source).join("\n");
  await mkdir(OUTPUT, {recursive: true, mode: 0o700});
  const browser = await chromium.launch({headless: true, args: ["--disable-gpu"]});
  const evidence: unknown[] = [];
  try {
    for (const {id: locale} of CATALOG_LOCALES.filter(locale => locale.selectable)) {
      await context.test(locale, async () => {
        const errors: string[] = [];
        const layouts = [];
        for (const [width, theme] of [[1200, "dark"], [390, "dark"], [1200, "light"]] as const) {
          const page = await browser.newPage({viewport: {width, height: 2400}, colorScheme: theme});
          page.on("pageerror", error => errors.push(error.message));
          try {
            await page.route("http://locale-qa.local/**", route => route.fulfill({contentType: "text/html", body: '<html><body><div id="root"></div></body></html>'}));
            await page.goto("http://locale-qa.local/");
            await page.addStyleTag({content: css});
            await page.addScriptTag({content: script.code});
            const rendered = await page.evaluate(async value => {
              const fixture = (window as unknown as {DashboardLocaleQa: {mountLocaleDashboard: (locale: string) => Promise<{title: string; plurals: string[]}>}}).DashboardLocaleQa;
              return fixture.mountLocaleDashboard(value);
            }, locale);
            await page.locator('[data-testid="dashboard-consumption-panel"]').waitFor();
            await page.getByRole("button", {name: new RegExp(rendered.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))}).first().waitFor();
            assert.ok(rendered.plurals.every(value => value.length > 0 && !/\{(?:count|grams)|plural,/.test(value)), `${locale}: ICU placeholders must resolve`);
            const disclosure = page.locator('[data-testid="dashboard-low-stock-suggestions"] button[aria-expanded]');
            assert.equal(await disclosure.getAttribute("aria-expanded"), "false");
            await disclosure.click();
            await page.locator('[data-low-stock-state="visible"]').waitFor();
            const geometry = await page.evaluate(() => ({
              width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
              overflowingButtons: [...document.querySelectorAll<HTMLButtonElement>('main button, .page-shell button')].filter(el => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 2).map(el => el.textContent?.trim()),
            }));
            assert.ok(geometry.scrollWidth <= width + 2, `${locale}/${width}: horizontal page overflow`);
            assert.deepEqual(geometry.overflowingButtons, [], `${locale}/${width}: clipped button text`);
            await page.evaluate(async () => {
              await document.fonts.ready;
              await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            });
            const footer = await page.locator("footer").boundingBox();
            assert.ok(footer);
            const screenshot = `${locale}-${width}-${theme}.png`;
            await page.screenshot({path: resolve(OUTPUT, screenshot), clip: {x: 0, y: 0, width, height: Math.min(2400, Math.ceil(footer.y + footer.height + 24))}, animations: "disabled"});
            layouts.push({width, theme, screenshot, ...geometry});
          } finally {await page.close();}
        }
        assert.deepEqual(errors, []);
        evidence.push({locale, layouts, runtimeErrors: errors, pluralCounts: [0,1,2,5,21]});
      });
    }
  } finally {
    await browser.close();
    await writeFile(resolve(OUTPUT, "results.json"), JSON.stringify({evidence}, null, 2), {mode: 0o600});
  }
});
