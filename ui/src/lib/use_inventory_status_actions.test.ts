import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function harness() {
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const path = (file: string) => JSON.stringify(fileURLToPath(new URL(file, import.meta.url)));
  const entry = fileURLToPath(new URL("./__status_virtual__.js", import.meta.url));
  const source = `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { useInventoryStatusActions as useActions } from ${path("./use_inventory_status_actions.ts")};
    import { InventorySpoolLostStatusPanel } from ${path("../components/inventory_spool_maintenance_panels.tsx")};
    import { InventoryDangerZonePanel } from ${path("../components/inventory_danger_zone_panel.tsx")};
    import { hasInventorySpoolLoan } from ${path("./inventory_list_model.ts")};
    import { I18nContext } from ${path("./i18n.ts")};
    let actions, state, props, oldAction;
    const calls=[], pending=[], reloads=[];
    let resolution="LIVE", throwRefresh=false, hold=false, release;
    const t=(_key,fallback)=>fallback;
    window.__TAURI__={invoke:(command,payload)=>new Promise((resolve,reject)=>calls.push({command,payload,resolve,reject}))};
    function Harness({id="roll-a",status="IN_STOCK",host="local",generation=1,open=true,assigned=false,loaned=false,borrowed=false,grams=500}) {
      const [busy,setManageBusy]=useState(false),[error,setError]=useState(null),[info,setInfoMessage]=useState(null);
      const selectedSpool=open?{id,status,ownershipType:borrowed?"BORROWED_IN":"OWNED",locationId:assigned?"slot":"shelf",homeLocationId:"shelf",location:"Shelf",homeLocation:"Shelf",remainingGrams:grams}:null;
      const slot=assigned?{printerId:"printer",slotId:"slot"}:null;
      actions=useActions({selectedSpool,assignedSlot:slot,
        activeLoan:hasInventorySpoolLoan(selectedSpool,new Set(loaned?[id]:[])),loanedOut:loaned,
        clientReadOnly:host!=="local",clientHostBaseUrl:"http://"+host,clientLibraryId:"library",clientTargetGeneration:generation,
        tauriAvailable:true,manageBusy:busy,canUseClientHostWrite:()=>true,ensureLocalWriteAllowed:()=>true,
        cancelDangerZoneConfirmation:()=>{},setManageBusy,setError,setInfoMessage,t,
        reloadSpools:async report=>{reloads.push("spools");if(hold)await new Promise(resolve=>release=resolve);
          report?.("spools",resolution);if(throwRefresh)throw Error("refresh failed");},
        reloadPrinterOverview:async report=>{reloads.push("printers");report?.("printers",resolution);},
        reloadSpoolDetail:async(id,report)=>{reloads.push("detail:"+id);report?.("detail",resolution);},
      });
      state={busy,error:actions.statusError??error,info};
      return React.createElement(I18nContext.Provider,{value:{locale:"en",setLocale:()=>{},t}},
        state.error&&React.createElement("div",{role:"alert"},state.error),
        info&&React.createElement("output",null,info),
        open&&React.createElement(InventorySpoolLostStatusPanel,{status,disabled:busy,loanedOut:loaned,resolvedTheme:"light",spoolHexColor:"#fff",onToggle:()=>pending.push(actions.handleToggleLostStatus())}),
        open&&React.createElement(InventoryDangerZonePanel,{status,manageBusy:busy,runtimeAvailable:true,confirmDelete:false,confirmPurge:false,
          onCancelConfirmation:()=>{},onDelete:()=>{},onPurge:()=>{},onMarkEmpty:()=>{},onRefill:()=>pending.push(actions.handleRefillSpool())}));
    }
    const root=createRoot(document.getElementById("root"));
    const action=kind=>kind==="REFILL"?actions.handleRefillSpool:actions.handleToggleLostStatus;
    window.roll={
      render:(next={})=>{props=next;flushSync(()=>root.render(React.createElement(Harness,props)));},
      start:kind=>pending.push(action(kind)()),double:kind=>{pending.push(action(kind)());pending.push(action(kind)());},
      save:kind=>{oldAction=action(kind);},old:()=>{void oldAction();},
      finish:async(index,reject=false,wait=true,receipt={committed:true,affected_count:1,history_spool_count:1})=>{
        await Promise.resolve();if(reject)calls[index].reject(Error("write rejected"));else calls[index].resolve(receipt);
        if(wait&&!hold)await Promise.all(pending);flushSync(()=>{});
      },
      failure:value=>{throwRefresh=value==="throw";resolution=throwRefresh?"LIVE":value;},
      hold:()=>{hold=true;},release:async()=>{release();await Promise.all(pending);flushSync(()=>{});},
      snapshot:()=>({...state,calls:calls.map(({command,payload})=>({command,payload})),reloads}),
    };
  `;
  const result=await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",
    define:{"process.env.NODE_ENV":JSON.stringify("production")},
    plugins:[{name:"status",resolveId:(id:string)=>id===entry?entry:null,load:(id:string)=>id===entry?source:null}],
    build:{write:false,minify:false,lib:{entry,formats:["iife"],name:"Status"}}});
  const script=(Array.isArray(result)?result:[result]).flatMap(value=>value.output).find(value=>value.type==="chunk"&&value.isEntry)?.code;
  assert.ok(script);
  return `<html><body><div id="root"></div><script>${script.replaceAll("</script","<\\/script")}</script></body></html>`;
}

test("rendered lost, found and reactivation actions",async context=>{
  const html=await harness(),browser=await chromium.launch({headless:true});
  const scenario=async(name:string,run:(page:Awaited<ReturnType<typeof browser.newPage>>)=>Promise<void>)=>{
    await context.test(name,async()=>{const page=await browser.newPage();page.setDefaultTimeout(10_000);
      const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
      try{await page.setContent(html);await page.evaluate("roll.render()");await run(page);assert.deepEqual(errors,[]);}finally{await page.close();}});
  };
  try {
    for(const [status,kind,label,target] of [
      ["ASSIGNED","TOGGLE","Mark as lost","LOST"],
      ["LOST","TOGGLE","Mark as found (in stock)","IN_STOCK"],
      ["EMPTY","REFILL","Refill / Reactivate roll","IN_STOCK"],
    ]) {
      await scenario(`${status}: rendered action sends one reviewed status command`,async page=>{
        await page.evaluate(`roll.render({status:'${status}',assigned:${status==="ASSIGNED"}})`);
        if(kind==="REFILL")await page.locator("summary").click();
        await page.getByRole("button",{name:label,exact:true}).click();
        await page.waitForFunction("roll.snapshot().calls.length>0");
        const call=(await page.evaluate("roll.snapshot()")).calls[0];
        assert.equal(call.command,"execute_inventory_bulk_mutation");
        assert.equal(call.payload.input.action,"ROLL_STATUS");assert.equal(call.payload.input.target_status,target);
        assert.equal(call.payload.input.expected_slot_id,status==="ASSIGNED"?"slot":null);
        await page.evaluate("roll.finish(0)");
        assert.equal((await page.evaluate("roll.snapshot()")).calls.length,1);
      });
    }
    await scenario("same-event duplicate sends one Host command with generation",async page=>{
      await page.evaluate("roll.render({host:'host',generation:3});roll.double('TOGGLE')");
      await page.waitForFunction("roll.snapshot().calls.length>0");
      const state=await page.evaluate("roll.snapshot()");assert.equal(state.calls.length,1);
      assert.equal(state.calls[0].payload.input.expected_target_generation,3);await page.evaluate("roll.finish(0)");
    });
    await scenario("rejected write keeps inline error and supports explicit retry",async page=>{
      await page.evaluate("roll.start('TOGGLE');roll.finish(0,true)");assert.match(await page.getByRole("alert").innerText(),/Failed to/);
      await page.evaluate("roll.start('TOGGLE');roll.finish(1)");assert.equal((await page.evaluate("roll.snapshot()")).calls.length,2);
    });
    for(const next of ["{id:'roll-b'}","{host:'host',generation:2}","{generation:3}","{open:false}"]) {
      await scenario(`late result and callback cannot affect ${next}`,async page=>{
        await page.evaluate(`roll.save('TOGGLE');roll.start('TOGGLE');roll.render(${next});roll.finish(0).then(()=>roll.old())`);
        const state=await page.evaluate("roll.snapshot()");assert.equal(state.calls.length,1);assert.equal(state.busy,false);
        assert.equal(state.info,null);assert.equal(state.error,null);assert.deepEqual(state.reloads,[]);
      });
    }
    for(const failure of ["throw","ERROR","OFFLINE","CACHED"]) {
      await scenario(`accepted status remains committed after ${failure} refresh`,async page=>{
        await page.evaluate(`roll.failure('${failure}');roll.start('TOGGLE');roll.finish(0)`);
        const state=await page.evaluate("roll.snapshot()");assert.equal(state.info,"Roll marked as lost.");assert.equal(state.error,"Failed to load inventory.");
        await page.evaluate("roll.start('TOGGLE')");assert.equal((await page.evaluate("roll.snapshot()")).calls.length,1);
      });
    }
    for (const reject of [false,true]) {
      await scenario(`old A result preserves newer A write after A→B→A (${reject})`,async page=>{
        await page.evaluate("roll.save('TOGGLE');roll.start('TOGGLE');roll.render({id:'roll-b'});roll.render();roll.old();roll.start('TOGGLE')");
        await page.waitForFunction("roll.snapshot().calls.length===2");
        await page.evaluate(`roll.finish(0,${reject},false)`);
        const state=await page.evaluate("roll.snapshot()");assert.equal(state.busy,true);assert.equal(state.error,null);assert.equal(state.info,null);assert.deepEqual(state.reloads,[]);
        await page.evaluate("roll.finish(1)");
      });
    }
    await scenario("changed status invalidates old callbacks and permits the next explicit action",async page=>{
      await page.evaluate("(async()=>{roll.save('TOGGLE');roll.start('TOGGLE');await roll.finish(0);roll.render({status:'LOST'});roll.old();roll.start('TOGGLE');await roll.finish(1);roll.render();roll.old();})()");
      const state=await page.evaluate("roll.snapshot()");assert.equal(state.calls.length,2);
      assert.equal(state.calls[1].payload.input.target_status,"IN_STOCK");
    });
    for(const next of ["{status:'LOST'}","{id:'roll-b'}"]) {
      await scenario(`refresh feedback follows its roll through ${next}`,async page=>{
        await page.evaluate("roll.failure('ERROR');roll.hold();roll.start('TOGGLE');roll.finish(0)");
        await page.waitForFunction("roll.snapshot().reloads.length===3");
        await page.evaluate(`roll.render(${next});roll.release()`);
        assert.equal((await page.evaluate("roll.snapshot()")).error,next.includes("roll-b")?null:"Failed to load inventory.");
      });
    }
    await scenario("invalid receipt cannot publish success",async page=>{
      await page.evaluate("roll.start('TOGGLE');roll.finish(0,false,true,{committed:true,affected_count:2,history_spool_count:2})");
      const state=await page.evaluate("roll.snapshot()");assert.equal(state.info,null);assert.deepEqual(state.reloads,[]);assert.ok(state.error);
    });
    await scenario("borrowed-in roll status reviews the loan without blocking the change",async page=>{
      await page.evaluate("roll.render({borrowed:true});roll.start('TOGGLE');roll.finish(0)");
      const state=await page.evaluate("roll.snapshot()");assert.equal(state.calls.length,1);
      assert.equal(state.calls[0].payload.input.spool.expected_active_loan,true);
    });
    await scenario("outbound loan and empty weight block before writing",async page=>{
      await page.evaluate("roll.render({loaned:true});roll.start('TOGGLE');roll.render({status:'EMPTY',grams:0});roll.start('REFILL')");
      assert.equal((await page.evaluate("roll.snapshot()")).calls.length,0);
    });
  } finally {await browser.close();}
});
