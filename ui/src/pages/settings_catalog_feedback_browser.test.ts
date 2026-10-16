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
  const file = (path: string) => JSON.stringify(fileURLToPath(new URL(path, import.meta.url)));
  const entry = fileURLToPath(new URL("./__catalog_feedback_entry__.jsx", import.meta.url));
  const source = `
    import React,{useState} from "react";
    import {createRoot} from "react-dom/client";
    import {flushSync} from "react-dom";
    import {useSettingsCatalogRefreshResult} from ${file("./use_settings_catalog_refresh_result.ts")};
    import {useSettingsCatalogRefreshActions} from ${file("./use_settings_catalog_refresh_actions.ts")};
    import {SettingsCatalogRefreshPanel} from ${file("./settings_catalog_refresh_panel.tsx")};
    import {I18nContext} from ${file("../lib/i18n.ts")};
    const t=(key,fallback="")=>fallback, noop=()=>{};
    let result,phase,busy,mode="reject",calls=0,resolveAudit;
    window.__TAURI__={invoke:async command=>{
      if(command!=="audit_bambu_catalog_source")throw Error("Unexpected command "+command);
      calls++;
      if(mode==="defer")await new Promise(resolve=>resolveAudit=resolve);
      throw Error("Detailed synthetic network diagnostic <code>");
    }};
    function Harness(){
      result=useSettingsCatalogRefreshResult();
      const [currentPhase,setPhase]=useState("IDLE"),[currentBusy,setBusy]=useState(false);
      phase=currentPhase;busy=currentBusy;
      const actions=useSettingsCatalogRefreshActions({
        ...result,busy:false,catalogRefreshBusy:busy,getCatalogRefreshMaterial:()=>"PLA",
        locale:"en",reloadSettings:async()=>{},setCatalogRefreshBusy:setBusy,setCatalogRefreshPhase:setPhase,
        setCatalogRefreshKind:noop,setCatalogRefreshUnavailable:noop,setCatalogRefreshMaterial:noop,
        setCatalogRefreshStartedAt:noop,setCatalogRefreshVendor:noop,setError:noop,setInfo:noop,
        saveDiscoveredCatalogMaterials:()=>true,
        settingsCatalogRefreshMessageLabels:()=>({auditBambuFailed:"Check failed",discoveringCatalogMaterials:"Checking"}),
        settingsCatalogRefreshSummaryLabels:()=>({}),settingsClientReadOnly:false,
        startCatalogRefreshJob:async()=>{},swatchBusy:false,tauri:true,
      });
      return <I18nContext.Provider value={{locale:"en",setLocale:noop,t}}>
        <SettingsCatalogRefreshPanel activeCatalogMasterCount={5} activeCatalogMaterialOptions={["PLA"]}
          activeCatalogRefreshMaterial="PLA" busy={false} catalogCount={5}
          catalogRowsAvailable catalogRowsUnavailable={false} catalogRefreshBusy={busy}
          catalogRefreshElapsedSeconds={0} catalogRefreshPhase={phase} catalogRefreshKind="AUDIT"
          catalogRefreshUnavailable={false} catalogRefreshMaterial={null} catalogRefreshVendor="Bambu"
          catalogVendor="Bambu" settingsClientReadOnly={false} swatchBusy={false} tauri t={t}
          {...result} onAuditVendorCatalog={actions.handleAuditVendorCatalog}
          onRefreshVendorCatalog={noop} onSetCatalogVendor={noop} onToggleCatalogRefreshLog={result.toggleCatalogRefreshLog}
          onSelectCatalogRefreshMaterial={noop}/>
      </I18nContext.Provider>;
    }
    window.qa={inspect:()=>({phase,busy,calls,log:result.catalogRefreshLog,shown:result.showCatalogRefreshLog}),
      defer:()=>{mode="defer";},release:()=>resolveAudit?.(),failAgain:()=>result.failCatalogRefreshResult("Replacement diagnostic")};
    const root=createRoot(document.getElementById("root"));flushSync(()=>root.render(<Harness/>));
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") }, logLevel: "error",
    plugins: [{ name: "catalog-feedback-test", resolveId: (id: string) => id === entry ? entry : null,
      load: (id: string) => id === entry ? source : null }, react()],
    build: { write: false, minify: false, emptyOutDir: false, lib: { entry, formats: ["iife"], name: "CatalogFeedback" } },
  });
  const script = (Array.isArray(result) ? result : [result]).flatMap(item => item.output)
    .find(output => output.type === "chunk" && output.isEntry)?.code;
  assert.ok(script);
  return `<html><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

test("failed catalog checks show a manual next step while retaining opt-in diagnostic disclosure", async () => {
  const html = await buildHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://localhost/**", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://localhost/catalog-feedback");
    const audit = page.getByRole("button", { name: "Find available material types", exact: true });
    await audit.click();
    await page.waitForFunction("qa.inspect().phase==='FAILED' && !qa.inspect().busy");
    assert.equal(await page.locator("pre").count(), 0);
    assert.match(await page.locator("body").innerText(), /The check was not completed\. Check the refresh log/);
    assert.equal(await page.evaluate("qa.inspect().calls"), 1, "no automatic retry after failure");
    await page.getByRole("button", { name: "View refresh log", exact: true }).click();
    assert.equal(await page.locator("pre").innerText(), "Detailed synthetic network diagnostic <code>");
    await page.evaluate("qa.failAgain()");
    await page.waitForFunction("document.querySelector('pre')?.textContent==='Replacement diagnostic'");
    assert.equal(await page.locator("pre").innerText(), "Replacement diagnostic", "explicitly opened diagnostics stay open");
    await page.getByRole("button", { name: "Hide refresh log", exact: true }).click();
    await page.evaluate("qa.defer()");
    await audit.click();
    await page.waitForFunction("qa.inspect().busy");
    assert.equal(await page.locator("pre").count(), 0);
    assert.equal(await page.evaluate("qa.inspect().log"), "");
    assert.equal(await page.getByRole("button", { name: "Finding available material types...", exact: true }).isEnabled(), false, "existing busy lock remains effective");
    await page.evaluate("qa.release()");
    await page.waitForFunction("qa.inspect().phase==='FAILED' && !qa.inspect().busy");
    assert.equal(await page.locator("pre").count(), 0);
    assert.equal(await page.evaluate("qa.inspect().calls"), 2, "only explicit check starts a second request");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
