import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function harness() {
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const path = (file: string) => JSON.stringify(fileURLToPath(new URL(file, import.meta.url)));
  const entry = fileURLToPath(new URL("./__removal_virtual__.js", import.meta.url));
  const source = `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { useInventoryRemovalActions } from ${path("./use_inventory_removal_actions.ts")};
    import { InventoryDangerZonePanel } from ${path("../components/inventory_danger_zone_panel.tsx")};
    import { hasInventorySpoolLoan } from ${path("./inventory_list_model.ts")};
    import { I18nContext } from ${path("./i18n.ts")};
    let actions, snapshot, props, oldAction;
    const calls = [], pending = [], reloads = [], removed = [];
    let resolution = "LIVE", failReload = false, holdReload = false, finishReload;
    const t = (_key, fallback) => fallback;
    window.__TAURI__ = { invoke: (command, payload) => new Promise((resolve, reject) => calls.push({command,payload,resolve,reject})) };
    function Harness({ id = "roll-a", host = "local", generation = 1, open = true, loaned = false, borrowed = false }) {
      const [busy, setManageBusy] = useState(false);
      const [error, setError] = useState(null);
      const [info, setInfoMessage] = useState(null);
      const [closedFor, setClosedFor] = useState(null);
      const viewKey = JSON.stringify([id,host,generation]);
      const visible = open && closedFor !== viewKey;
      const selectedSpool = visible ? { id, masterId:"master", vendor:"Maker", material:"PLA", filamentName:"Basic",
        colorName:"Blue", initialWeightGrams:1000, ownershipType:borrowed?"BORROWED_IN":"OWNED", status:"IN_STOCK" } : null;
      const input = {
        selectedSpool, activeLoan: hasInventorySpoolLoan(selectedSpool,new Set(loaned?[id]:[])), tauriAvailable:true, manageBusy:busy,
        clientReadOnly:host !== "local", clientHostBaseUrl:"http://" + host, clientLibraryId:"library",
        clientTargetGeneration:generation, canUseClientHostWrite:()=>true, ensureLocalWriteAllowed:()=>true,
        setManageBusy, setError, setInfoMessage, t,
        onRemoved:()=>{removed.push(id);setClosedFor(viewKey);},
        reloadSpools:async report=>{ reloads.push("spools"); if (holdReload) await new Promise(resolve => finishReload = resolve);
          report?.("spools", resolution); if (failReload) throw Error("refresh failed"); },
        reloadPrinterOverview:async report=>{reloads.push("printers"); report?.("printers", resolution);},
        reloadActiveLoans:async report=>{reloads.push("loans"); report?.("loans", resolution);},
      };
      actions = useInventoryRemovalActions(input);
      snapshot = { busy, error:actions.removalError ?? error, info, confirmDelete:actions.confirmDelete, confirmPurge:actions.confirmPurge };
      return React.createElement(I18nContext.Provider, { value:{locale:"en",setLocale:()=>{},t} },
        snapshot.error && React.createElement("div", {role:"alert"}, snapshot.error),
        info && React.createElement("output", null, info),
        visible && React.createElement(InventoryDangerZonePanel, {
          confirmDelete:actions.confirmDelete, confirmPurge:actions.confirmPurge, manageBusy:busy,
          onCancelConfirmation:actions.cancelConfirmation, onDelete:()=>pending.push(actions.handleDeleteSelected()),
          onPurge:()=>pending.push(actions.handlePurgeSelected()), onMarkEmpty:actions.cancelConfirmation, onRefill:()=>{},
          runtimeAvailable:true, status:"IN_STOCK", rollLabel:"Maker PLA Blue",
        }));
    }
    const root = createRoot(document.getElementById("root"));
    const action = kind => kind === "DELETE" ? actions.handleDeleteSelected : actions.handlePurgeSelected;
    window.removal = {
      render:(next={})=>{props=next; flushSync(()=>root.render(React.createElement(Harness, props)));},
      request:kind=>flushSync(()=>{void action(kind)();}),
      start:kind=>{pending.push(action(kind)());},
      double:kind=>{pending.push(action(kind)()); pending.push(action(kind)());},
      save:kind=>{oldAction=action(kind);}, old:()=>{void oldAction();},
      cancel:()=>flushSync(()=>actions.cancelConfirmation()),
      finish:async(index,reject=false,wait=true)=>{await Promise.resolve();
        if(reject) calls[index].reject(Error("write rejected")); else calls[index].resolve();
        await Promise.resolve(); await Promise.resolve();
        if (!holdReload && wait) await Promise.all(pending);
        flushSync(()=>{});
      },
      failure:value=>{failReload=value === "throw"; resolution=value === "throw" ? "LIVE" : value;},
      hold:()=>{holdReload=true;}, release:async()=>{finishReload(); await Promise.all(pending); flushSync(()=>{});},
      snapshot:()=>({...snapshot, calls:calls.map(({command,payload})=>({command,payload})), reloads, removed}),
    };
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile:false,
    define:{"process.env.NODE_ENV":JSON.stringify("production")}, logLevel:"error",
    plugins:[{name:"removal",resolveId:(id:string)=>id===entry?entry:null,load:(id:string)=>id===entry?source:null}],
    build:{write:false,minify:false,lib:{entry,formats:["iife"],name:"Removal"}},
  });
  const script = (Array.isArray(result)?result:[result]).flatMap(result=>result.output)
    .find(output=>output.type==="chunk" && output.isEntry)?.code;
  assert.ok(script);
  return `<html><body><div id="root"></div><script>${script.replaceAll("</script","<\\/script")}</script></body></html>`;
}

test("rendered inventory removal confirmations and asynchronous results", async context => {
  const html = await harness();
  const browser = await chromium.launch({headless:true});
  const scenario = async (name:string, run:(page:Awaited<ReturnType<typeof browser.newPage>>)=>Promise<void>) => {
    await context.test(name, async ()=>{
      const page = await browser.newPage(); page.setDefaultTimeout(10_000);
      const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
      try {await page.setContent(html);await page.evaluate("removal.render()");await run(page);assert.deepEqual(errors,[]);}
      finally {await page.close();}
    });
  };
  try {
    for (const kind of ["DELETE","PURGE"]) {
      await scenario(`${kind}: rendered request and confirmation send one local command`,async page=>{
        await page.locator("summary").click();
        const request=kind==="DELETE"?"Delete roll from active inventory":"Purge roll + all history permanently";
        const confirm=kind==="DELETE"?"Delete from active inventory":"Purge roll permanently";
        await page.getByRole("button",{name:request,exact:true}).click();
        assert.equal((await page.evaluate("removal.snapshot()")).calls.length,0);
        await page.getByRole("button",{name:confirm,exact:true}).click();
        await page.waitForFunction("removal.snapshot().calls.length===1");
        const call=(await page.evaluate("removal.snapshot()")).calls[0];
        assert.equal(call.command,kind==="DELETE"?"delete_spool":"purge_spool");
        assert.equal(call.payload.input.spool_id,"roll-a");
        await page.evaluate("removal.finish(0)");
      });
      await scenario(`${kind}: same-event confirmation duplicates cannot write twice`,async page=>{
        await page.evaluate(`removal.request('${kind}');removal.double('${kind}')`);
        await page.waitForFunction("removal.snapshot().calls.length>0");
        assert.equal((await page.evaluate("removal.snapshot()")).calls.length,1);
        await page.evaluate("removal.finish(0)");
      });
      await scenario(`${kind}: rejected write keeps confirmation and permits explicit retry`,async page=>{
        await page.evaluate(`removal.request('${kind}');removal.start('${kind}');removal.finish(0,true)`);
        assert.equal((await page.evaluate("removal.snapshot()"))[kind==="DELETE"?"confirmDelete":"confirmPurge"],true);
        assert.match(await page.getByRole("alert").innerText(),/Failed to/);
        await page.evaluate(`removal.start('${kind}')`);
        await page.waitForFunction("removal.snapshot().calls.length===2");
        await page.evaluate("removal.finish(1)");
      });
      await scenario(`${kind}: cancel and reopen invalidates an old confirmed callback`,async page=>{
        await page.evaluate(`removal.request('${kind}');removal.save('${kind}');removal.cancel();removal.request('${kind}');removal.old()`);
        assert.equal((await page.evaluate("removal.snapshot()")).calls.length,0);
      });
      for (const next of ["{id:'roll-b'}","{host:'host',generation:2}","{generation:3}","{open:false}"]) {
        await scenario(`${kind}: late result cannot remove or clear ${next}`,async page=>{
          await page.evaluate(`removal.request('${kind}');removal.start('${kind}');removal.render(${next});removal.finish(0)`);
          const state=await page.evaluate("removal.snapshot()");
          assert.deepEqual(state.removed,[]);
          assert.deepEqual(state.reloads,[]);
          assert.equal(state.busy,false);
          assert.equal(state.info,null);
        });
      }
    }
    for (const reject of [false, true]) {
      await scenario(`A→B→A late ${reject ? "rejection" : "success"} keeps the newer write busy`, async page => {
        await page.evaluate("removal.request('DELETE');removal.start('DELETE');removal.render({id:'roll-b'});removal.render({id:'roll-a'});removal.request('PURGE');removal.start('PURGE')");
        await page.waitForFunction("removal.snapshot().calls.length===2");
        await page.evaluate(`removal.finish(0,${reject},false)`);
        const state = await page.evaluate("removal.snapshot()");
        assert.equal(state.busy,true);
        assert.equal(state.error,null);
        assert.equal(state.info,null);
        assert.deepEqual(state.removed,[]);
        await page.evaluate("removal.finish(1)");
        assert.deepEqual((await page.evaluate("removal.snapshot()")).removed,["roll-a"]);
      });
    }
    for (const failure of ["throw","ERROR","OFFLINE","CACHED"]) {
      await scenario(`committed removal stays successful after ${failure} refresh`,async page=>{
        await page.evaluate(`removal.failure('${failure}');removal.request('DELETE');removal.start('DELETE');removal.finish(0)`);
        const state=await page.evaluate("removal.snapshot()");
        assert.equal(state.info,"All changes are saved.");
        assert.equal(state.error,"Failed to load inventory.");
        assert.deepEqual(state.removed,["roll-a"]);
        await page.evaluate("removal.request('DELETE');removal.start('DELETE')");
        assert.equal((await page.evaluate("removal.snapshot()")).calls.length,1);
      });
    }
    for (const next of ["{}", "{id:'roll-b'}", "{host:'host',generation:2}"]) {
      await scenario(`refresh completion after automatic close respects the next view ${next}`, async page => {
        await page.evaluate("removal.failure('ERROR');removal.hold();removal.request('DELETE');removal.start('DELETE');removal.finish(0)");
        await page.waitForFunction("removal.snapshot().removed.length === 1");
        if (next !== "{}") await page.evaluate(`removal.render(${next})`);
        await page.evaluate("removal.release()");
        const state = await page.evaluate("removal.snapshot()");
        assert.deepEqual(state.removed, ["roll-a"]);
        assert.equal(state.error, next === "{}" ? "Failed to load inventory." : null);
        assert.equal(state.busy, false);
      });
    }
    await scenario("Host removal includes the reviewed authority generation",async page=>{
      await page.evaluate("removal.render({host:'host',generation:3});removal.request('PURGE');removal.start('PURGE')");
      await page.waitForFunction("removal.snapshot().calls.length===1");
      const call=(await page.evaluate("removal.snapshot()")).calls[0];
      assert.equal(call.command,"purge_library_sync_host_spool");
      assert.equal(call.payload.input.expected_target_generation,3);
      await page.evaluate("removal.finish(0)");
    });
    await scenario("inbound ownership blocks removal even when the outbound feed is empty", async page => {
      await page.evaluate("removal.render({borrowed:true});removal.request('PURGE');removal.start('PURGE')");
      assert.equal((await page.evaluate("removal.snapshot()")).calls.length,0);
      assert.match(await page.getByRole("alert").innerText(),/Return the active loan/);
    });
    await scenario("active inbound or outbound loan blocks removal before confirmation",async page=>{
      await page.evaluate("removal.render({loaned:true});removal.request('DELETE');removal.start('DELETE')");
      assert.equal((await page.evaluate("removal.snapshot()")).calls.length,0);
    });
  } finally {await browser.close();}
});
