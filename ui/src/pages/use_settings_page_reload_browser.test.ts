import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium, type Page } from "playwright";

function normalizedModuleId(id: string) {
  return id.replaceAll("\\", "/");
}

async function buildHarness(windowsDataSourcePath = false) {
  const requireFromUi = createRequire(new URL("../../package.json", import.meta.url));
  const [{ build }, { default: react }] = await Promise.all([
    import(pathToFileURL(requireFromUi.resolve("vite")).href),
    import(pathToFileURL(requireFromUi.resolve("@vitejs/plugin-react")).href),
  ]);
  const entry = fileURLToPath(new URL("./__settings_reload_entry__.jsx", import.meta.url));
  const hook = fileURLToPath(new URL("./use_settings_page_reload.ts", import.meta.url));
  const resolvedDataSource = fileURLToPath(new URL("../lib/settings_data_source.ts", import.meta.url));
  // Exercise Vite's slash-normalized module ID against a Windows filesystem path
  // on every test platform, so this cannot regress unnoticed on macOS/Linux.
  const dataSource = windowsDataSourcePath ? resolvedDataSource.replaceAll("/", "\\") : resolvedDataSource;
  let mockedDataSource = false;
  const source = `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {flushSync} from "react-dom";
    import {useSettingsPageReload} from ${JSON.stringify(hook)};
    let suspended=false, mounted=true, reload, pending=[], calls=[], settled=0, reads=0;
    const setters=new Map();
    const setter=name=>{
      if(!setters.has(name)) setters.set(name,value=>calls.push({name,value:typeof value==="function"?"updater":value}));
      return setters.get(name);
    };
    function Harness() {
      reload=useSettingsPageReload({
        suspendSilentReload:suspended,tauri:true,
        settingsClientReadOnly:false,settingsClientHostBaseUrl:null,settingsClientHostWritePaired:false,
        settingsClientLibraryId:"original-library",settingsClientTargetGeneration:0,
        settingsPageMessageLabels:()=>({loadFailed:"Settings load failed"}),
        onDataReloaded:()=>calls.push({name:"secondaryReload"}),
        ...Object.fromEntries(["setBambuLiveIntegrations","setCatalogData","setError",
          "setLibrarySyncDeviceNameDraft","setLibrarySyncHostBaseUrlDraft","setLibrarySyncModeDraft",
          "setLibrarySyncSettings","setLibrarySyncSnapshot","setLibrarySyncValidation","setLoading",
          "setPrinterOverview","setPrinters","setSpoolRows","setSwatchDraftById"].map(name=>[name,setter(name)])),
      });
      return <div>Settings</div>;
    }
    const root=createRoot(document.getElementById("root"));
    const render=()=>root.render(mounted?<Harness/>:<div>Closed</div>);
    const data=library=>({
      syncSettings:{mode:"STANDALONE",host_base_url:null,client_auth_paired:false,
        library_id:library,target_generation:0,device_name:"Synthetic library"},
      bambuLiveIntegrations:{},catalogRows:[],catalogRowsAvailable:true,librarySyncSnapshot:null,
      overviewRows:[],snapshot:{printers:[]},revisionPollComplete:true,spoolRows:[],
    });
    window.qa={
      load:()=>{reads++;return new Promise((resolve,reject)=>pending.push({resolve,reject}));},
      suspend:value=>{suspended=value;flushSync(render);},
      unmount:()=>{mounted=false;flushSync(render);},
      start:silent=>{void reload({silent}).then(()=>settled++,error=>{calls.push({name:"rejected",value:error.message});settled++;});},
      resolve:library=>pending.shift().resolve(data(library)),
      reject:()=>pending.shift().reject(Error("Late background read failed")),
      clear:()=>{calls=[];},
      inspect:()=>({reads,calls,settled,pending:pending.length}),
    };
    flushSync(render);
    calls=[];
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)),
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "error",
    plugins: [{
      name: "settings-reload-harness",
      enforce: "pre",
      resolveId: (id: string) => normalizedModuleId(id) === normalizedModuleId(entry) ? entry : null,
      load: (id: string) => {
        if (normalizedModuleId(id) === normalizedModuleId(entry)) return source;
        if (normalizedModuleId(id) === normalizedModuleId(dataSource)) {
          mockedDataSource = true;
          return "export const loadSettingsPageData=()=>window.qa.load();";
        }
        return null;
      },
    }, react()],
    build: { write: false, minify: false, emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "SettingsReloadHarness" } },
  });
  assert.equal(mockedDataSource, true, "Settings reload harness must replace settings_data_source before launching Chromium");
  const output = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
  const script = output.find(output => output.type === "chunk" && output.isEntry)?.code;
  assert.ok(script);
  return `<html><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

test("Settings reload harness replaces a Windows data source path during the real Vite build", async () => {
  await buildHarness(true);
});

test("Settings silent reload cannot replace an active import scope", async context => {
  const document = await buildHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    async function scenario(name: string, run: (page: Page) => Promise<void>) {
      await context.test(name, async () => {
        const page = await browser.newPage();
        page.setDefaultTimeout(5_000);
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.route("http://localhost/**", route => route.fulfill({ contentType: "text/html", body: document }));
          await page.goto("http://localhost/settings-reload");
          await run(page);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      });
    }

    for (const rejected of [false, true]) {
      await scenario(`a silent read started before import cannot publish ${rejected ? "failure" : "a restored identity"} while busy`, async page => {
        await page.evaluate("qa.start(true)");
        await page.waitForFunction("qa.inspect().pending===1");
        await page.evaluate("qa.suspend(true);qa.clear()");
        await page.evaluate(rejected ? "qa.reject()" : "qa.resolve('restored-library')");
        await page.waitForFunction("qa.inspect().settled===1");
        assert.deepEqual(await page.evaluate("qa.inspect().calls"), [],
          "no settings identity, role, catalog, error or secondary refresh may invalidate the import");
      });
    }

    await scenario("silent starts are skipped while busy, then resume when the import settles", async page => {
      await page.evaluate("qa.suspend(true);qa.start(true)");
      await page.waitForFunction("qa.inspect().settled===1");
      assert.equal(await page.evaluate("qa.inspect().reads"), 0);
      await page.evaluate("qa.suspend(false);qa.start(true)");
      await page.waitForFunction("qa.inspect().pending===1");
      await page.evaluate("qa.resolve('original-library')");
      await page.waitForFunction("qa.inspect().settled===2");
      const calls = await page.evaluate("qa.inspect().calls") as { name: string; value?: unknown }[];
      assert.equal(calls.filter(call => call.name === "setLibrarySyncSettings").length, 1);
      assert.equal(calls.filter(call => call.name === "secondaryReload").length, 1);
    });

    await scenario("explicit refresh after commit works while busy and rejects the older silent response", async page => {
      await page.evaluate("qa.start(true)");
      await page.waitForFunction("qa.inspect().pending===1");
      await page.evaluate("qa.suspend(true);qa.start(false)");
      await page.waitForFunction("qa.inspect().pending===2");
      await page.evaluate("qa.resolve('stale-background-library')");
      await page.waitForFunction("qa.inspect().settled===1");
      await page.evaluate("qa.resolve('restored-library')");
      await page.waitForFunction("qa.inspect().settled===2");
      const calls = await page.evaluate("qa.inspect().calls") as { name: string; value?: { library_id?: string } }[];
      const settings = calls.filter(call => call.name === "setLibrarySyncSettings");
      assert.equal(settings.length, 1);
      assert.equal(settings[0].value?.library_id, "restored-library");
      assert.equal(calls.filter(call => call.name === "secondaryReload").length, 1);
    });

    await scenario("unmount discards a pending silent read", async page => {
      await page.evaluate("qa.start(true)");
      await page.waitForFunction("qa.inspect().pending===1");
      await page.evaluate("qa.unmount();qa.clear();qa.resolve('late-library')");
      await page.waitForFunction("qa.inspect().settled===1");
      assert.deepEqual(await page.evaluate("qa.inspect().calls"), []);
    });
  } finally { await browser.close(); }
});
