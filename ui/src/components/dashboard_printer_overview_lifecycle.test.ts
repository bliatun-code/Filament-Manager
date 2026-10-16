import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

async function buildHarness() {
  const requireFromUi = createRequire(new URL("../../package.json", import.meta.url));
  const [{ build }, { default: react }] = await Promise.all([
    import(pathToFileURL(requireFromUi.resolve("vite")).href),
    import(pathToFileURL(requireFromUi.resolve("@vitejs/plugin-react")).href),
  ]);
  const entry = fileURLToPath(new URL("./__dashboard_printer_overview_lifecycle__.jsx", import.meta.url));
  const file = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)));
  const source = `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { DashboardPrinterOverview } from ${file("./dashboard_printer_overview.tsx")};
    import { I18nContext } from ${file("../lib/i18n.ts")};
    import { formatMessage } from ${file("../../../src-tauri/companion_browser/message_format.js")};
    const i18n={locale:"en",setLocale:()=>{},t:(_key,fallback="",params={})=>formatMessage(fallback,params,"en")};
    const root=createRoot(document.getElementById("root"));
    const printer={printer:{id:"printer",name:"Atlas",model:"Bambu Lab P1S"},usage:{},slots:[]};
    const config={enabled:true,tls_trust_state:"TRUSTED",observed_state:{online:true,mqtt_connected:true,last_seen_at:new Date().toISOString(),gcode_state:"RUNNING",progress_percent:64,trays:[]}};
    const calls=[];
    function render(overrides={}) {
      flushSync(()=>root.render(<I18nContext.Provider value={i18n}><DashboardPrinterOverview
        printers={[printer]} bambuLiveIntegrations={{printer:config}} resolvedTheme="light"
        onOpenPrinters={()=>calls.push("printers")} onOpenBambuLiveSettings={id=>calls.push(id)} {...overrides}/></I18nContext.Provider>));
    }
    window.cardsUI={render,calls:()=>calls,unmount:()=>flushSync(()=>root.unmount()),
      hidden:value=>Object.defineProperty(document,"hidden",{configurable:true,value}),
      visibility:()=>document.dispatchEvent(new Event("visibilitychange")),
      untrusted:()=>render({bambuLiveIntegrations:{printer:{...config,tls_trust_state:"CHANGED"}}})};
    render();
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") }, logLevel: "error",
    plugins: [{ name: "dashboard-printer-lifecycle", enforce: "pre", resolveId: (id: string) => id === entry ? entry : null, load: (id: string) => id === entry ? source : null }, react()],
    build: { write: false, minify: false, cssCodeSplit: false, lib: { entry, formats: ["iife"], name: "DashboardPrinterLifecycle" } },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((result) => result.output);
  const script = output.find((file) => file.type === "chunk" && file.isEntry)?.code;
  assert.ok(script);
  return `<html><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

test("dashboard live cards expire without data reloads and retain their navigation actions", async (context) => {
  const html = await buildHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    await context.test("visible observations expire through the local clock", async () => {
      const page = await browser.newPage();
      try {
        await page.clock.install({ time: new Date("2026-10-17T12:00:00Z") });
        await page.clock.pauseAt(new Date("2026-10-17T12:00:01Z"));
        await page.setContent(html);
        await page.getByRole("progressbar").waitFor({ state: "attached" });
        await page.clock.runFor(330_000);
        await page.getByText("Live data is out of date", { exact: true }).waitFor();
        assert.equal(await page.getByRole("progressbar").count(), 0);
        await page.getByRole("button", { name: "Open printers" }).click();
        assert.deepEqual(await page.evaluate("cardsUI.calls()"), ["printers"]);
      } finally { await page.close(); }
    });
    await context.test("hidden cards refresh freshness on visibility and trust actions target the actual printer", async () => {
      const page = await browser.newPage();
      try {
        await page.clock.install({ time: new Date("2026-10-17T12:00:00Z") });
        await page.clock.pauseAt(new Date("2026-10-17T12:00:01Z"));
        await page.setContent(html);
        await page.getByRole("progressbar").waitFor({ state: "attached" });
        await page.evaluate("cardsUI.hidden(true)");
        await page.clock.runFor(330_000);
        assert.equal(await page.getByRole("progressbar").count(), 1);
        await page.evaluate("cardsUI.hidden(false);cardsUI.visibility()");
        await page.getByText("Live data is out of date", { exact: true }).waitFor();
        await page.evaluate("cardsUI.untrusted()");
        await page.getByRole("button", { name: "Review live connection", exact: true }).click();
        assert.deepEqual(await page.evaluate("cardsUI.calls()"), ["printer"]);
        await page.evaluate("cardsUI.unmount()");
        await page.clock.runFor(60_000);
        assert.equal(await page.locator("#root").innerHTML(), "");
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
});
