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
    import { useInventoryWeightAction as useActions } from ${path("./use_inventory_weight_action.ts")};
    import { WeightInput } from ${path("../components/weight_input.tsx")};
    import { hasInventorySpoolLoan } from ${path("./inventory_list_model.ts")};
    import { I18nContext } from ${path("./i18n.ts")};
    let actions, state, props, oldAction;
    const calls=[], pending=[], reloads=[];
    let resolution="LIVE", throwRefresh=false, hold=false, release;
    const t=(_key,fallback)=>fallback;
    window.__TAURI__={invoke:(command,payload)=>new Promise((resolve,reject)=>calls.push({command,payload,resolve,reject}))};
    function Harness({id="roll-a",status="IN_STOCK",host="local",generation=1,open=true,assigned=false,loaned=false,borrowed=false,grams=500,tare=250}) {
      const [busy,setManageBusy]=useState(false),[error,setError]=useState(null),[info,setInfoMessage]=useState(null);
      const selectedSpool=open?{id,status,ownershipType:borrowed?"BORROWED_IN":"OWNED",locationId:assigned?"slot":"shelf",homeLocationId:"shelf",location:"Shelf",homeLocation:"Shelf",remainingGrams:grams}:null;
      const slot=assigned?{printerId:"printer",slotId:"slot"}:null;
      actions=useActions({selectedSpool,assignedSlot:slot,resolvedTare:tare,
        activeLoan:hasInventorySpoolLoan(selectedSpool,new Set(loaned?[id]:[])),loanedOut:loaned,
        clientReadOnly:host!=="local",clientHostBaseUrl:"http://"+host,clientLibraryId:"library",clientTargetGeneration:generation,
        tauriAvailable:true,manageBusy:busy,canUseClientHostWrite:()=>true,ensureLocalWriteAllowed:()=>true,
        cancelDangerZoneConfirmation:()=>{},setManageBusy,setError,setInfoMessage,t,
        reloadSpools:async report=>{reloads.push("spools");if(hold)await new Promise(resolve=>release=resolve);
          report?.("spools",resolution);if(throwRefresh)throw Error("refresh failed");},
        reloadPrinterOverview:async report=>{reloads.push("printers");report?.("printers",resolution);},
        reloadSpoolDetail:async(id,report)=>{reloads.push("detail:"+id);report?.("detail",resolution);},
      });
      state={busy,error:actions.weightError??error,info};
      return React.createElement(I18nContext.Provider,{value:{locale:"en",setLocale:()=>{},t}},
        state.error&&React.createElement("div",{role:"alert"},state.error),
        info&&React.createElement("output",null,info),
        open&&React.createElement(WeightInput,{value:grams+tare,onSubmit:value=>pending.push(actions.handleWeightSubmit(value))}));
    }
    const root=createRoot(document.getElementById("root"));
    const action=()=>actions.handleWeightSubmit;
    window.roll={
      render:(next={})=>{props=next;flushSync(()=>root.render(React.createElement(Harness,props)));},
      start:(value=650)=>pending.push(action()(value)),double:(value=650)=>{pending.push(action()(value));pending.push(action()(value));},
      save:kind=>{oldAction=action(kind);},old:()=>{void oldAction(650);},
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

test("rendered inventory measured weight", async context => {
  const html = await harness(), browser = await chromium.launch({headless:true});
  const scenario = async (name:string, run:(page:Awaited<ReturnType<typeof browser.newPage>>)=>Promise<void>) => {
    await context.test(name,async()=>{const page=await browser.newPage();page.setDefaultTimeout(10_000);
      const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
      try {await page.setContent(html);await page.evaluate("roll.render()");await run(page);assert.deepEqual(errors,[]);} finally {await page.close();}
    });
  };
  try {
    for (const options of ["{}", "{status:'EMPTY',grams:0}", "{status:'ASSIGNED',assigned:true,host:'host'}"]) {
      await scenario(`one reviewed command from rendered Save: ${options}`,async page=>{
        await page.evaluate(`roll.render(${options})`);
        await page.getByRole("spinbutton").fill("650");await page.getByRole("button",{name:"Save",exact:true}).click();
        await page.waitForFunction("roll.snapshot().calls.length>0");
        const call=(await page.evaluate("roll.snapshot()")).calls[0];
        const mutation=call.payload.input.mutation ?? call.payload.input;
        assert.equal(mutation.action,"ROLL_WEIGHT");
        assert.equal(mutation.measured_total_g,650);assert.equal(mutation.expected_tare_g,250);
        assert.equal(mutation.expected_remaining_g,options.includes("EMPTY")?0:500);
        assert.equal(mutation.expected_slot_id,options.includes("assigned:true")?"slot":null);
        if(options.includes("host"))assert.equal(call.payload.input.expected_target_generation,1);
        await page.evaluate("roll.finish(0)");assert.equal((await page.evaluate("roll.snapshot()")).calls.length,1);
      });
    }
    await scenario("synchronous duplicate is blocked; rejected write permits explicit retry",async page=>{
      await page.evaluate("roll.double();roll.finish(0,true)");
      assert.equal((await page.evaluate("roll.snapshot()")).calls.length,1);
      assert.match(await page.getByRole("alert").innerText(),/Failed to update weight/);
      await page.evaluate("roll.start();roll.finish(1)");assert.equal((await page.evaluate("roll.snapshot()")).error,null);
    });
    for(const next of ["{id:'roll-b'}","{host:'host',generation:2}","{open:false}"]) {
      await scenario(`late reply and saved callback cannot affect ${next}`,async page=>{
        await page.evaluate(`roll.save();roll.start();roll.render(${next});roll.finish(0).then(()=>roll.old())`);
        const state=await page.evaluate("roll.snapshot()");assert.equal(state.calls.length,1);assert.equal(state.busy,false);
        assert.equal(state.info,null);assert.equal(state.error,null);assert.deepEqual(state.reloads,[]);
      });
    }
    for(const reject of [false,true]) {
      await scenario(`old A cannot clear newer A after A→B→A (${reject})`,async page=>{
        await page.evaluate("roll.save();roll.start();roll.render({id:'roll-b'});roll.render();roll.old();roll.start()");
        await page.evaluate(`roll.finish(0,${reject},false)`);
        const state=await page.evaluate("roll.snapshot()");assert.equal(state.busy,true);assert.equal(state.calls.length,2);assert.deepEqual(state.reloads,[]);
        await page.evaluate("roll.finish(1)");
      });
    }
    for(const next of ["{tare:260}","{grams:450}","{status:'LOST'}","{assigned:true}"]) {
      await scenario(`old callback is invalid after snapshot change ${next} and back`,async page=>{
        await page.evaluate(`roll.save();roll.render(${next});roll.render();roll.old()`);
        assert.equal((await page.evaluate("roll.snapshot()")).calls.length,0);
      });
    }
    for(const failure of ["ERROR","OFFLINE","CACHED","throw"]) {
      await scenario(`accepted weight survives ${failure} refresh without replay`,async page=>{
        await page.evaluate(`roll.render({status:'EMPTY',grams:0});roll.failure('${failure}');roll.start();roll.finish(0);`);
        const state=await page.evaluate("roll.snapshot()");assert.equal(state.info,"Roll reactivated from new measured weight.");
        assert.equal(state.error,"Failed to load inventory.");await page.evaluate("roll.start()");
        assert.equal((await page.evaluate("roll.snapshot()")).calls.length,1);
      });
    }
    await scenario("refresh feedback follows same roll through weight/status refresh",async page=>{
      await page.evaluate("roll.render({status:'EMPTY',grams:0});roll.failure('ERROR');roll.hold();roll.start();roll.finish(0)");
      await page.waitForFunction("roll.snapshot().reloads.length===3");
      await page.evaluate("roll.render({status:'IN_STOCK',grams:400});roll.release()");
      assert.equal((await page.evaluate("roll.snapshot()")).error,"Failed to load inventory.");
    });
    await scenario("new measured value allowed after an accepted no-op",async page=>{
      await page.evaluate("roll.start(750);roll.finish(0,false,true,{committed:true,affected_count:0,history_spool_count:0})");
      await page.evaluate("roll.start(650);roll.finish(1)");assert.equal((await page.evaluate("roll.snapshot()")).calls.length,2);
    });
    await scenario("borrowed-in is included in review and outbound loan blocks",async page=>{
      await page.evaluate("roll.render({borrowed:true});roll.start();roll.finish(0)");
      assert.equal((await page.evaluate("roll.snapshot()")).calls[0].payload.input.spool.expected_active_loan,true);
      await page.evaluate("roll.render({loaned:true});roll.start()");assert.equal((await page.evaluate("roll.snapshot()")).calls.length,1);
    });
    await scenario("invalid receipt or numeric input never reports success",async page=>{
      await page.evaluate("roll.start(NaN);roll.start(Infinity);roll.start(-Infinity);roll.start(Number.MAX_VALUE)");
      assert.equal((await page.evaluate("roll.snapshot()")).calls.length,0);
      await page.evaluate("roll.start();roll.finish(0,false,true,{committed:true,affected_count:2,history_spool_count:2})");
      const state=await page.evaluate("roll.snapshot()");assert.equal(state.info,null);assert.deepEqual(state.reloads,[]);assert.ok(state.error);
    });
  } finally {await browser.close();}
});
