import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import AxeBuilder from "@axe-core/playwright";

test("balanced roll dialog preserves weight, properties, labels and guarded actions without filament tint", { timeout: 120_000 }, async () => {
  const built = await build({ root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false, logLevel: "error", define: { "process.env.NODE_ENV": JSON.stringify("production") }, plugins: [tailwindcss(), react()], build: { write: false, minify: false, cssCodeSplit: false, lib: { entry: fileURLToPath(new URL("../../test-fixtures/inventory_spool_balanced_browser_entry.tsx", import.meta.url)), formats: ["iife"], name: "BalancedSpoolPreview" } } });
  const output = (Array.isArray(built) ? built : [built]).flatMap(r => r.output);
  const script = output.find(o => o.type === "chunk" && o.isEntry); assert.ok(script?.type === "chunk");
  const css = output.filter(o => o.type === "asset" && o.fileName.endsWith(".css")).map(o => o.source).join("\n");
  const out = resolve("release-artifacts/visual-qa/inventory-spool-balanced"); await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--disable-gpu"] });
  try {
    for (const locale of ["nb", "en", "de"]) for (const width of [1440, 390]) for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({ viewport: { width, height: 1100 } }); const page = await context.newPage(); page.setDefaultTimeout(10_000);
      const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
      try {
        await page.route("http://spool-preview.local/**", r => r.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
        await page.goto("http://spool-preview.local/"); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: script.code });
        await page.evaluate(async args => { await (window as unknown as { BalancedSpoolPreview: { mountBalancedSpoolPreview: (locale: string, theme: string) => Promise<void> } }).BalancedSpoolPreview.mountBalancedSpoolPreview(args.locale, args.theme); }, { locale, theme });
        const dialog = page.locator(".inventory-balanced-dialog"); try { await dialog.waitFor(); } catch (error) { throw new Error(JSON.stringify({errors,body:await page.locator("body").innerText()}),{cause:error}); }
        assert.equal(await dialog.locator("details[open]").count(), 0);
        assert.equal(await dialog.locator(".inventory-balanced-weight-summary strong").innerText(), "520 g");
        const backgrounds = await dialog.locator(".inventory-balanced-section").evaluateAll(nodes => nodes.map(n => getComputedStyle(n).backgroundImage)); assert.ok(backgrounds.every(b => b === "none"));
        const a11y = await new AxeBuilder({ page }).include(".inventory-balanced-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        assert.deepEqual(a11y.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
        const geometry = await dialog.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, buttons: [...el.querySelectorAll("button")].filter(b => b.clientWidth > 0 && b.scrollWidth > b.clientWidth + 2).map(b => b.textContent) })); assert.ok(geometry.scroll <= geometry.width + 2, JSON.stringify(geometry)); assert.deepEqual(geometry.buttons, []);
        await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))); });
        await page.screenshot({ path: resolve(out, `${locale}-${width}-${theme}.png`), fullPage: true });
        if (locale === "en" && width === 1440 && theme === "dark") {
          const weight = dialog.getByRole("spinbutton", { name: "Measured total weight (g)", exact: true });
          const update = dialog.getByRole("button", { name: "Update weight", exact: true });
          await weight.fill(""); assert.equal(await update.isDisabled(), true); await weight.fill("770");
          const tare = dialog.getByRole("spinbutton", { name: "Empty spool weight (g)", exact: true }); await tare.fill("300"); assert.equal(await update.isDisabled(), true);
          await dialog.getByRole("button", { name: "Save roll changes", exact: true }).click(); await weight.fill("800"); await update.click();
          await page.waitForFunction(() => document.querySelector(".inventory-balanced-weight-summary strong")?.textContent === "500 g");
          await page.evaluate(() => (window as unknown as { setFilamentBusy: (busy: boolean) => void }).setFilamentBusy(true)); await page.waitForFunction(() => document.querySelector(".inventory-balanced-weight-input")?.hasAttribute("disabled")); assert.equal(await update.isDisabled(), true);
          await page.evaluate(() => (window as unknown as { setFilamentBusy: (busy: boolean) => void }).setFilamentBusy(false));
          // Label builder must open from the toolbar while the inline QR disclosure stays closed.
          await dialog.getByRole("button", { name: "Print label", exact: true }).first().click();
          await page.getByRole("dialog").last().getByText("Create label image", { exact: true }).waitFor(); assert.equal(await page.getByRole("dialog").count(), 2);
          await page.getByRole("dialog").last().getByRole("button", { name: "Close", exact: true }).click();
          const reference = dialog.locator("details").filter({ has: page.locator("summary", { hasText: "RFID ·" }) }).first(); await reference.locator("summary").first().click(); await reference.getByRole("button", { name: "RFID", exact: true }).click();
          assert.equal(await page.evaluate(() => (window as unknown as { lastFilamentAction: string }).lastFilamentAction), "rfid");
          const catalog = dialog.locator("details").filter({ has: page.locator("summary", { hasText: "Catalog details" }) }).first(); await catalog.locator("summary").first().click(); await catalog.getByRole("button", { name: "Unlock metadata", exact: true }).click();
          await catalog.getByRole("textbox", { name: "Vendor", exact: true }).waitFor();
          const activity = dialog.locator(".inventory-balanced-activity > details"); await activity.locator("summary").click(); await page.locator("#inventory-roll-history-list").waitFor();await dialog.locator(".inventory-balanced-activity-content svg").waitFor();
          const danger = page.locator("#inventory-danger-zone-panel"); await danger.locator("summary").click(); await danger.getByRole("button", { name: "Mark as used up (empty)", exact: true }).click(); await page.locator("#inventory-mark-empty-confirmation").waitFor();
          assert.notEqual(await page.evaluate(() => (window as unknown as { lastFilamentAction: string }).lastFilamentAction), "empty-confirmed");
          await page.locator("#inventory-mark-empty-confirmation").getByRole("button", { name: "Cancel", exact: true }).click();
          await dialog.getByRole("combobox", { name: "Ownership type", exact: true }).selectOption("BORROWED_IN");
          const owner = dialog.getByRole("textbox", { name: "Owner name (required)", exact: true }); await owner.fill("QA Owner");
          await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
          await page.getByRole("button", { name: "Keep editing", exact: true }).click(); assert.equal(await owner.inputValue(), "QA Owner");
          await dialog.locator(".inventory-balanced-purchase-more > summary").click();
          const expandedA11y = await new AxeBuilder({page}).include(".inventory-balanced-dialog").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
          assert.deepEqual(expandedA11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
          await dialog.locator("[data-inventory-detail-scroll]").evaluate(el=>{el.scrollTop=0;});
          await page.screenshot({path:resolve(out,"en-expanded-1440-dark.png"),fullPage:true});
        }
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    for (const scenario of ["offline", "loaned"]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 1000 } }); const page = await context.newPage();
      try {
        await page.route("http://spool-preview.local/**", r => r.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
        await page.goto(`http://spool-preview.local/?${scenario}=1`); await page.addStyleTag({content:css}); await page.addScriptTag({content:script.code});
        await page.evaluate(async () => { await (window as unknown as { BalancedSpoolPreview: { mountBalancedSpoolPreview: (locale: string, theme: string) => Promise<void> } }).BalancedSpoolPreview.mountBalancedSpoolPreview("en", "dark"); });
        const dialog = page.locator(".inventory-balanced-dialog"); await dialog.waitFor();
        assert.equal(await dialog.getByRole("button",{name:"Update weight",exact:true}).isDisabled(),true);
        assert.equal(await dialog.getByRole("combobox",{name:"Ownership type",exact:true}).isDisabled(),true);
        if (scenario === "offline") assert.equal(await dialog.getByRole("button",{name:"Print label",exact:true}).first().isDisabled(),true);
        await page.screenshot({path:resolve(out,`en-${scenario}-390.png`),fullPage:true});
      } finally {await context.close();}
    }
  } finally { await browser.close(); }
});
