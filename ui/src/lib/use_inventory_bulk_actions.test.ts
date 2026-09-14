import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function harness() {
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const entry = fileURLToPath(new URL("./__bulk_virtual__.js", import.meta.url));
  const source = `
    import React,{useState} from "react";import {createRoot} from "react-dom/client";import {flushSync} from "react-dom";
    import {useInventoryBulkActions} from "./use_inventory_bulk_actions";
    import {InventoryBulkActionsPanelView} from "../components/inventory_bulk_actions_panel";
    let api,state,props={},old,calls=[],failure="LIVE",held=false,release,refreshes=[],labels=[];
    const t=(_key,fallback="",params={})=>fallback.replace(/\\{(\\w+)\\}/g,(_,key)=>params[key]??key);
    window.__TAURI__={invoke:(command,payload)=>new Promise((resolve,reject)=>calls.push({command,payload,resolve,reject}))};
    function Harness({host="local",generation=1,active=true,ready=true,live=true,loading=false,paired=true,status="IN_STOCK",filtered=false,loan=false,otherStatus="IN_STOCK"}) {
      const [busy,setBusy]=useState(false),[error,setError]=useState(null),[info,setInfo]=useState(null);
      const spools=['a','b','c'].map(id=>({id,masterId:'master',status:id==='c'?otherStatus:status,homeLocationId:'old',locationId:'old',remainingGrams:500,
        vendor:'Vendor',material:'PLA',filamentName:'Basic',colorName:'Blue',ownershipType:'OWNED'}));
      const reload=kind=>async report=>{refreshes.push(kind);if(held&&kind==='spools')await new Promise(resolve=>release=resolve);
        if(failure==='throw')throw Error('refresh rejected');report?.(kind,failure);};
      api=useInventoryBulkActions({active,ready,clientDataLive:live,clientTargetGeneration:generation,
        activeLoanSpoolIds:new Set(loan?['a']:[]),busy,clientHostBaseUrl:'http://'+host,clientHostWritePaired:paired,
        clientLibraryId:'library',clientReadOnly:host!=='local',filteredSpools:filtered?[spools[0]]:spools.slice(0,2),loading,
        locations:[{id:'new',name:'New shelf',location_type:'GENERIC',created_at:'',updated_at:''}],
        openLabelSheet:async plan=>{labels.push(plan);},printerSlotBySpoolId:new Map(),
        reloadSpools:reload('spools'),reloadActiveLoans:reload('loans'),reloadPrinterOverview:reload('printers'),
        setBusy,setError,setInfoMessage:setInfo,spools,tauriAvailable:true,t});
      state={busy,error:api.bulkError??error,info:api.bulkInfo??info};
      return React.createElement('div',null,React.createElement('button',{id:'inventory-bulk-selection-mode-trigger',disabled:api.selectionModeTriggerProps.disabled,
        onClick:()=>api.selectionModeTriggerProps.onActiveChange(!api.selectionModeTriggerProps.active)},'Select rolls'),
        state.error&&React.createElement('div',{role:'alert'},state.error),React.createElement(InventoryBulkActionsPanelView,api.panelProps));
    }
    const root=createRoot(document.getElementById('root'));
    const render=(p={})=>{props=p;flushSync(()=>root.render(React.createElement(Harness,p)));};
    const prepare=kind=>{flushSync(()=>api.selectionModeTriggerProps.onActiveChange(true));flushSync(()=>api.panelProps.onSelectVisibleChange(true));
      flushSync(()=>kind==='MOVE'?api.panelProps.onRequestMoveReview(api.panelProps.locationTargets[0]):api.panelProps.onRequestStatusReview('LOST'));};
    const confirm=()=>api.panelProps.onConfirmReview(api.panelProps.review);
    window.bulk={render,prepare,confirm,double:()=>{confirm();confirm();},save:()=>{const fn=api.panelProps.onConfirmReview,plan=api.panelProps.review;old=()=>fn(plan);},old:()=>old(),
      cancel:()=>api.panelProps.onCancelReview(),clear:()=>api.panelProps.onClearSelection(),failure:value=>{failure=value;},hold:()=>{held=true;},
      finish:async(index,reject=false,mismatch=false)=>{await Promise.resolve();if(reject)calls[index].reject(Error('write rejected'));else calls[index].resolve({committed:true,affected_count:mismatch?1:2,history_spool_count:2});await new Promise(resolve=>setTimeout(resolve,0));},
      release:async()=>{release();await new Promise(resolve=>setTimeout(resolve,0));},
      labels:()=>api.panelProps.onCreateLabels(api.panelProps.labelsPlan),
      snapshot:()=>({...state,calls:calls.map(({command,payload})=>({command,payload})),refreshes,labels,
        count:api.panelProps.selectedCount,active:api.panelProps.active,review:api.panelProps.review,reviewCurrent:api.panelProps.reviewCurrent})};
  `;
  const result=await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",
    define:{"process.env.NODE_ENV":JSON.stringify("production")},
    plugins:[{name:"bulk",resolveId:(id:string)=>id===entry?entry:null,load:(id:string)=>id===entry?source:null}],
    build:{write:false,minify:false,lib:{entry,formats:["iife"],name:"Bulk"}}});
  const script=(Array.isArray(result)?result:[result]).flatMap(value=>value.output).find(value=>value.type==="chunk"&&value.isEntry)?.code;
  assert.ok(script);return `<html><body><div id="root"></div><script>${script.replaceAll("</script","<\\/script")}</script></body></html>`;
}

test("rendered inventory bulk review lifecycle",async context=>{
  const html=await harness(),browser=await chromium.launch({headless:true});
  const scenario=async(name:string,run:(page:Awaited<ReturnType<typeof browser.newPage>>)=>Promise<void>)=>context.test(name,async()=>{
    const page=await browser.newPage();page.setDefaultTimeout(5000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    try{await page.setContent(html);await page.evaluate('bulk.render()');await run(page);assert.deepEqual(errors,[]);}finally{await page.close();}
  });
  try {
    for(const kind of ['MOVE','STATUS']) {
      await scenario(`${kind}: same-event duplicate sends one command for both rolls`,async page=>{
        await page.evaluate(`bulk.prepare('${kind}');bulk.double()`);const state=await page.evaluate('bulk.snapshot()');assert.equal(state.calls.length,1);
        assert.equal(state.calls[0].payload.input.spools.length,2);await page.evaluate('bulk.finish(0)');
      });
      await scenario(`${kind}: accepted mutation is consumed before refresh completes`,async page=>{
        await page.evaluate(`bulk.prepare('${kind}');bulk.save();bulk.hold();bulk.confirm();bulk.finish(0)`);
        await page.waitForFunction('bulk.snapshot().refreshes.length===3');const state=await page.evaluate('bulk.snapshot()');assert.equal(state.count,0);assert.equal(state.review,null);assert.ok(state.info);
        await page.evaluate('bulk.release();bulk.old()');assert.equal((await page.evaluate('bulk.snapshot()')).calls.length,1);
      });
      for(const failure of ['throw','ERROR','OFFLINE','CACHED']) {
        await scenario(`${kind}: ${failure} refresh cannot turn a committed write into write failure`,async page=>{
          await page.evaluate(`bulk.prepare('${kind}');bulk.failure('${failure}');bulk.confirm();bulk.finish(0)`);await page.waitForFunction('!bulk.snapshot().busy');
          const state=await page.evaluate('bulk.snapshot()');assert.equal(state.count,0);assert.equal(state.error,'Failed to load inventory.');assert.ok(state.info);
        });
      }
      await scenario(`${kind}: rejected write preserves review for explicit retry`,async page=>{
        await page.evaluate(`bulk.prepare('${kind}');bulk.confirm();bulk.finish(0,true)`);await page.waitForFunction('!bulk.snapshot().busy');
        assert.equal((await page.evaluate('bulk.snapshot()')).count,2);await page.evaluate('bulk.confirm();bulk.finish(1)');assert.equal((await page.evaluate('bulk.snapshot()')).count,0);
      });
      await scenario(`${kind}: cancel invalidates the old confirmation in the same event`,async page=>{
        await page.evaluate(`bulk.prepare('${kind}');bulk.save();bulk.cancel();bulk.old()`);assert.equal((await page.evaluate('bulk.snapshot()')).calls.length,0);
      });
      await scenario(`${kind}: changed then restored data never revives the original review`,async page=>{
        await page.evaluate(`bulk.prepare('${kind}');bulk.save();bulk.render({status:'EMPTY'});bulk.render();bulk.old()`);
        const state=await page.evaluate('bulk.snapshot()');assert.equal(state.calls.length,0);assert.equal(state.reviewCurrent,false);
      });
      await scenario(`${kind}: changed loan state invalidates review`,async page=>{
        await page.evaluate(`bulk.prepare('${kind}');bulk.save();bulk.render({loan:true});bulk.old()`);assert.equal((await page.evaluate('bulk.snapshot()')).calls.length,0);
      });
      await scenario(`${kind}: Host switch clears selection and ignores old success`,async page=>{
        await page.evaluate(`bulk.prepare('${kind}');bulk.save();bulk.confirm();bulk.render({host:'other'});bulk.finish(0);bulk.old()`);
        const state=await page.evaluate('bulk.snapshot()');assert.equal(state.count,0);assert.equal(state.calls.length,1);assert.equal(state.info,null);assert.deepEqual(state.refreshes,[]);
      });
      await scenario(`${kind}: A→B→A old failure cannot unlock a new batch`,async page=>{
        await page.evaluate(`bulk.prepare('${kind}');bulk.save();bulk.confirm();bulk.render({host:'other'});bulk.render();bulk.prepare('${kind}');bulk.old();bulk.confirm();bulk.finish(0,true)`);
        const state=await page.evaluate('bulk.snapshot()');assert.equal(state.calls.length,2);assert.equal(state.busy,true);assert.equal(state.error,null);await page.evaluate('bulk.finish(1)');
      });
      await scenario(`${kind}: mismatched receipt never reports success or replays its review`,async page=>{
        await page.evaluate(`bulk.prepare('${kind}');bulk.save();bulk.confirm();bulk.finish(0,false,true)`);await page.waitForFunction('!bulk.snapshot().busy');await page.evaluate('bulk.old()');
        const state=await page.evaluate('bulk.snapshot()');assert.equal(state.calls.length,1);assert.equal(state.count,2);assert.equal(state.info,null);assert.ok(state.error);assert.equal(state.review,null);
      });
      await scenario(`${kind}: Client request binds the reviewed generation`,async page=>{
        await page.evaluate(`bulk.render({host:'host',generation:7});bulk.prepare('${kind}');bulk.confirm()`);
        assert.equal((await page.evaluate('bulk.snapshot()')).calls[0].payload.input.expected_target_generation,7);await page.evaluate('bulk.finish(0)');
      });
    }
    for(const props of ['{ready:false}','{loading:true}','{live:false}','{host:"host",paired:false}','{host:"host",generation:null}','{active:false}']) {
      await scenario(`stale confirmation is blocked for ${props}`,async page=>{
        await page.evaluate(`bulk.prepare('STATUS');bulk.save();bulk.render(${props});bulk.old()`);assert.equal((await page.evaluate('bulk.snapshot()')).calls.length,0);
      });
    }
    await scenario('unselected roll changes do not invalidate a reviewed batch',async page=>{
      await page.evaluate("bulk.prepare('STATUS');bulk.render({otherStatus:'EMPTY'});bulk.confirm()");assert.equal((await page.evaluate('bulk.snapshot()')).calls.length,1);await page.evaluate('bulk.finish(0)');
    });
    await scenario('filtering keeps explicitly selected hidden rolls in the reviewed batch',async page=>{
      await page.evaluate("bulk.prepare('STATUS');bulk.render({filtered:true});bulk.confirm()");assert.equal((await page.evaluate('bulk.snapshot()')).calls[0].payload.input.spools.length,2);await page.evaluate('bulk.finish(0)');
    });
    await scenario('the rendered confirmation completes and restores keyboard focus after refresh',async page=>{
      await page.evaluate("bulk.prepare('STATUS')");await page.getByRole('button',{name:'Confirm Change status for 2',exact:true}).click();await page.evaluate('bulk.finish(0)');
      await page.waitForFunction("document.activeElement?.id==='inventory-bulk-selection-mode-trigger'");assert.equal((await page.evaluate('bulk.snapshot()')).active,false);
    });
    await scenario('leaving during refresh cannot show feedback in the next workspace',async page=>{
      await page.evaluate("bulk.prepare('MOVE');bulk.hold();bulk.failure('ERROR');bulk.confirm();bulk.finish(0)");await page.waitForFunction('bulk.snapshot().refreshes.length===3');
      await page.evaluate('bulk.render({active:false});bulk.release()');const state=await page.evaluate('bulk.snapshot()');assert.equal(state.info,null);assert.equal(state.error,null);
    });
  } finally {await browser.close();}
});
