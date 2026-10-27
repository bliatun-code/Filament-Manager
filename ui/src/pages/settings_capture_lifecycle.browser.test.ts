import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

test("diagnostic captures continue for collapsed printers and stop independently", { timeout: 30_000 }, async () => {
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const entry = fileURLToPath(new URL("./__capture_review__.js", import.meta.url));
  const source = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { useSettingsBambuLiveDiagnostics } from './use_settings_bambu_live_diagnostics';
    import { useSettingsCatalogRefreshResult } from './use_settings_catalog_refresh_result';
    import { useSettingsSwatchConfirm } from './use_settings_swatch_confirm';
    const observed = (n) => ({mqtt_connected:true,online:true,trays:[],last_seen_at:'2026-10-25T10:00:0'+n+'Z',progress_percent:n});
    let latest;
    function Harness() {
      const [configs,setConfigs] = React.useState({a:{enabled:true,observed_state:observed(0)},b:{enabled:true,observed_state:observed(0)}});
      const [expanded,setExpanded] = React.useState('a');
      const [confirmed,setConfirmed] = React.useState(false);
      const [ids,setIds] = React.useState('a');
      const result = useSettingsCatalogRefreshResult();
      const state = useSettingsBambuLiveDiagnostics({bambuLiveIntegrations:configs,expandedBambuDetailsPrinterId:expanded});
      useSettingsSwatchConfirm({confirmBulkSwatch:confirmed,setConfirmBulkSwatch:setConfirmed,swatchVendorFilter:'ALL',visibleMissingSwatchCount:1,visibleMissingSwatchIds:ids});
      latest = {...state,...result,confirmed,confirm:()=>setConfirmed(true),changeIds:()=>setIds('b'),collapse:()=>setExpanded(null),update:n=>setConfigs({a:{enabled:true,observed_state:observed(n)},b:{enabled:true,observed_state:observed(n)}})};
      return null;
    }
    window.captureReview = {
      start:id=>latest.ensureDiagnosticSession(id),
      collapse:()=>latest.collapse(), update:n=>latest.update(n),
      stop:id=>latest.toggleBambuLiveCapture(id,true),
      resume:id=>latest.toggleBambuLiveCapture(id,false),
      samples:id=>latest.diagnosticCaptureByPrinterId[id]?.samples.length,
      complete:()=>latest.completeCatalogRefreshResult({imported:12,reactivated_count:0,discontinued_count:0,output:''}),
      result:()=>latest.catalogRefreshSummary?.imported,
      last:id=>latest.diagnosticCaptureByPrinterId[id]?.lastCapturedAt,
      confirm:()=>latest.confirm(), changeIds:()=>latest.changeIds(), confirmed:()=>latest.confirmed,
    };
    createRoot(document.getElementById('root')).render(React.createElement(Harness));
  `;
  const result = await build({ root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false, logLevel: "error", define: { "process.env.NODE_ENV": JSON.stringify("production") }, plugins: [{ name: "capture-review", resolveId: (id: string) => id === entry ? entry : null, load: (id: string) => id === entry ? source : null }], build: { write: false, minify: false, lib: { entry, formats: ["iife"], name: "CaptureReview" } } });
  const code = (Array.isArray(result) ? result : [result]).flatMap(r => r.output).find(o => o.type === "chunk" && o.isEntry)?.code;
  assert.ok(code);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.clock.install();
    await page.addScriptTag({ content: code });
    // Drive the production hooks without depending on a printer or network timing.
    const run = (body: string) => page.evaluate(body);
    await page.waitForFunction("window.captureReview && window.captureReview.confirmed() === false");
    await run("captureReview.start('a'); captureReview.start('b'); captureReview.collapse()");
    await page.waitForFunction("captureReview.last('a') && captureReview.last('b')");
    await run("captureReview.update(1)");
    await page.waitForFunction("captureReview.last('a') === '2026-10-25T10:00:01Z' && captureReview.last('b') === '2026-10-25T10:00:01Z'");
    await run("captureReview.stop('a')");
    await run("captureReview.update(2)");
    await page.waitForFunction("captureReview.last('b') === '2026-10-25T10:00:02Z'");
    assert.equal(await run("captureReview.last('a')"), "2026-10-25T10:00:01Z");
    const before = await run("captureReview.samples('a')");
    await run("captureReview.resume('a')");
    await page.waitForFunction("captureReview.last('a') === '2026-10-25T10:00:02Z'");
    assert.ok((await run("captureReview.samples('a')")) > before);
    await run("captureReview.complete()");
    await page.waitForFunction("captureReview.result() === 12");
    await page.clock.fastForward(25_000);
    await page.waitForFunction("captureReview.result() === undefined");
    // The catalog receipt expires independently of the printer capture sessions.
    await run("captureReview.update(3)");
    await page.waitForFunction("captureReview.last('a') === '2026-10-25T10:00:03Z' && captureReview.last('b') === '2026-10-25T10:00:03Z'");
    await run("captureReview.confirm()");
    await page.waitForFunction("captureReview.confirmed()");
    await run("captureReview.changeIds()");
    await page.waitForFunction("!captureReview.confirmed()");
  } finally {
    await browser.close();
  }
});
