import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function harness() {
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const entry = fileURLToPath(new URL("./__locations_virtual__.js", import.meta.url));
  const source = `
    import React,{useState} from "react";import {createRoot} from "react-dom/client";import {flushSync} from "react-dom";
    import {useInventoryLocationActions} from "./use_inventory_location_actions";
    import {InventoryLocationManagementPanel} from "../components/inventory_location_management_panel";
    import {I18nContext} from "./i18n";
    let actions,state,old,pending=[],results=[],calls=[],refreshes=0,failure="LIVE",held=false,release,refreshRows=false;
    const t=(_key,fallback="",params={})=>fallback.replace(/\\{(\\w+)\\}/g,(_,key)=>params[key]??key);
    const rows=[{id:"a",name:"Box A",location_type:"GENERIC",can_delete:true,reference_count:0,created_at:"",updated_at:""},
      {id:"b",name:"Box B",location_type:"GENERIC",can_delete:true,reference_count:0,created_at:"",updated_at:""},
      {id:"c",name:"Old box",location_type:"GENERIC",archived_at:"2026-01-01",can_delete:true,reference_count:0,created_at:"",updated_at:""}];
    window.__TAURI__={invoke:(command,payload)=>new Promise((resolve,reject)=>calls.push({command,payload,resolve,reject}))};
    const track=promise=>{pending.push(promise.then(result=>{results.push(result);return result;}));return promise;};
    function Harness({host="local",generation=1,open=true,ready=true,loading=false,source="LIVE",supported=true,paired=true,revision=0}) {
      const [busy,setBusy]=useState(false),[error,setError]=useState(null),[info,setInfo]=useState(null);
      const [refreshing,setRefreshing]=useState(false),[refreshedRevision,setRefreshedRevision]=useState(0);
      actions=useInventoryLocationActions({active:open,ready,loading:loading||refreshing,source,context:{clientReadOnly:host!=="local",clientHostBaseUrl:"http://"+host,
        clientLibraryId:"library",clientTargetGeneration:generation,clientHostWritePaired:paired,mutationsSupported:supported},
        tauri:true,manageBusy:busy,setManageBusy:setBusy,setError,setInfoMessage:setInfo,t,
        reloadSpools:async report=>{refreshes++;if(refreshRows){setRefreshing(true);await new Promise(resolve=>setTimeout(resolve,0));setRefreshedRevision(v=>v+1);setRefreshing(false);}if(held)await new Promise(resolve=>release=resolve);if(failure==="throw")throw Error("refresh rejected");report?.("locations",failure);}});
      state={busy,error:actions.locationError??error,info:actions.locationInfo??info};
      return React.createElement(I18nContext.Provider,{value:{locale:"en",setLocale:()=>{},t}},
        state.error&&React.createElement("div",{role:"alert"},state.error),
        open&&React.createElement(InventoryLocationManagementPanel,{authorityKey:actions.authorityKey,busy,canMutate:ready&&paired,loading:loading||refreshing,source,
          mutationsSupported:supported,rows:rows.map(row=>({...row,updated_at:String(revision+refreshedRevision)})),usageByLocationId:new Map(),onReload:()=>{},onOpenLinkedSpools:()=>{},
          onCreate:name=>track(actions.createLocation(name)),onRename:(id,name)=>track(actions.renameLocation(id,name)),
          onArchive:id=>track(actions.archiveLocation(id)),onDelete:id=>track(actions.deleteLocation(id)),onRestore:id=>track(actions.restoreLocation(id)),
          onMerge:(a,b)=>track(actions.mergeLocations(a,b))}));
    }
    const root=createRoot(document.getElementById("root"));
    const action=kind=>({create:()=>actions.createLocation("New box"),rename:()=>actions.renameLocation("a","Renamed box"),
      archive:()=>actions.archiveLocation("a"),restore:()=>actions.restoreLocation("c"),delete:()=>actions.deleteLocation("a"),merge:()=>actions.mergeLocations("a","b")})[kind];
    const capture=kind=>{const copy={...actions};return ()=>{const live=actions;actions=copy;const result=action(kind)();actions=live;return result;};};
    window.locations={render:(props={})=>flushSync(()=>root.render(React.createElement(Harness,props))),
      start:kind=>{track(action(kind)());},double:kind=>{track(action(kind)());track(action(kind)());},save:kind=>{old=capture(kind);},old:()=>{track(old());},
      finish:async(index,reject=false,wait=true)=>{await Promise.resolve();if(reject)calls[index].reject(Error("write rejected"));else calls[index].resolve({});
        if(wait&&!held)await Promise.all(pending);await new Promise(resolve=>setTimeout(resolve,0));flushSync(()=>{});},failure:value=>{failure=value;},refreshRows:()=>{refreshRows=true;},
      hold:()=>{held=true;},release:async()=>{release();await Promise.all(pending);flushSync(()=>{});},
      snapshot:()=>({...state,calls:calls.map(({command,payload})=>({command,payload})),refreshes,results})};
  `;
  const result = await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",
    define:{"process.env.NODE_ENV":JSON.stringify("production")},
    plugins:[{name:"locations",resolveId:(id:string)=>id===entry?entry:null,load:(id:string)=>id===entry?source:null}],
    build:{write:false,minify:false,lib:{entry,formats:["iife"],name:"Locations"}}});
  const script=(Array.isArray(result)?result:[result]).flatMap(value=>value.output).find(value=>value.type==="chunk"&&value.isEntry)?.code;
  assert.ok(script);
  return `<html><body><div id="root"></div><script>${script.replaceAll("</script","<\\/script")}</script></body></html>`;
}

test("rendered location management lifecycle",async context=>{
  const html=await harness(),browser=await chromium.launch({headless:true});
  const scenario=async(name:string,run:(page:Awaited<ReturnType<typeof browser.newPage>>)=>Promise<void>)=>context.test(name,async()=>{
    const page=await browser.newPage();page.setDefaultTimeout(5000);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    try{await page.setContent(html);await page.evaluate("locations.render()");await run(page);assert.deepEqual(errors,[]);}finally{await page.close();}
  });
  try {
    for(const kind of ["create","rename","archive","restore","delete","merge"]) {
      await scenario(`${kind}: duplicate submissions share one write`,async page=>{
        await page.evaluate(`locations.double('${kind}')`);assert.equal((await page.evaluate("locations.snapshot()")).calls.length,1);await page.evaluate("locations.finish(0)");
      });
      await scenario(`${kind}: accepted write survives refresh rejection`,async page=>{
        await page.evaluate(`locations.failure('throw');locations.start('${kind}');locations.finish(0)`);
        const state=await page.evaluate("locations.snapshot()");assert.deepEqual(state.results,[true]);assert.ok(state.info);assert.equal(state.error,"Failed to load inventory.");assert.equal(state.busy,false);
      });
      await scenario(`${kind}: rejected write permits explicit retry`,async page=>{
        await page.evaluate(`locations.start('${kind}');locations.finish(0,true)`);assert.deepEqual((await page.evaluate("locations.snapshot()")).results,[false]);
        await page.evaluate(`locations.start('${kind}');locations.finish(1)`);assert.deepEqual((await page.evaluate("locations.snapshot()")).results,[false,true]);
      });
      await scenario(`${kind}: old callback and completion cannot change a new Host`,async page=>{
        await page.evaluate(`locations.save('${kind}');locations.start('${kind}');locations.render({host:'other'});locations.finish(0);locations.old()`);
        const state=await page.evaluate("locations.snapshot()");assert.equal(state.calls.length,1);assert.equal(state.refreshes,0);assert.equal(state.info,null);assert.equal(state.error,null);
      });
      await scenario(`${kind}: A→B→A invalidates old callbacks and keeps newer write locked`,async page=>{
        await page.evaluate(`locations.render({host:'host'});locations.save('${kind}');locations.start('${kind}');locations.render({host:'other'});locations.render({host:'host',generation:1});locations.old();locations.start('${kind}');locations.finish(0,true,false)`);
        const state=await page.evaluate("locations.snapshot()");assert.equal(state.calls.length,2);assert.equal(state.busy,true);assert.equal(state.error,null);await page.evaluate("locations.finish(1)");
      });
      await scenario(`${kind}: Client request carries original generation`,async page=>{
        await page.evaluate(`locations.render({host:'host',generation:7});locations.start('${kind}')`);
        assert.equal((await page.evaluate("locations.snapshot()")).calls[0].payload.input.expected_target_generation,7);await page.evaluate("locations.finish(0)");
      });
    }
    for(const props of ["{ready:false}","{loading:true}","{source:'CACHED'}","{source:'OFFLINE'}","{supported:false}","{host:'host',paired:false}","{host:'host',generation:null}","{open:false}"]) {
      await scenario(`mutations are blocked for ${props}`,async page=>{
        await page.evaluate(`locations.render(${props});locations.start('merge')`);assert.equal((await page.evaluate("locations.snapshot()")).calls.length,0);
      });
    }
    for(const failure of ["ERROR","CACHED","OFFLINE"]) {
      await scenario(`${failure} refresh is reported without losing acknowledgement`,async page=>{
        await page.evaluate(`locations.failure('${failure}');locations.start('create');locations.finish(0)`);const state=await page.evaluate("locations.snapshot()");assert.deepEqual(state.results,[true]);assert.equal(state.error,"Failed to load inventory.");
      });
    }
    await scenario("a late refresh cannot show feedback in another workspace",async page=>{
      await page.evaluate("locations.hold();locations.failure('ERROR');locations.start('create');locations.finish(0)");
      await page.waitForFunction("locations.snapshot().refreshes===1");await page.evaluate("locations.render({open:false});locations.release()");
      const state=await page.evaluate("locations.snapshot()");assert.equal(state.info,null);assert.equal(state.error,null);assert.equal(state.busy,false);
    });
    await scenario("delete rejection retains its error when eligibility refresh throws",async page=>{
      await page.evaluate("locations.failure('throw');locations.start('delete');locations.finish(0,true)");const state=await page.evaluate("locations.snapshot()");assert.equal(state.refreshes,1);assert.ok(state.error);assert.notEqual(state.error,"Failed to load inventory.");assert.equal(state.busy,false);
    });
    await scenario("actual create form clears after acknowledged write despite failed refresh",async page=>{
      await page.locator('#inventory-location-new-name').fill('Fresh box');await page.evaluate("locations.failure('throw')");
      await page.getByRole('button',{name:'Create',exact:true}).click();await page.evaluate("locations.finish(0)");
      assert.equal(await page.locator('#inventory-location-new-name').inputValue(),'');assert.equal((await page.evaluate("locations.snapshot()")).calls.length,1);
    });
    for(const action of ["Archive","Delete"]) {
      await scenario(`${action} confirmation is discarded when the Host changes`,async page=>{
        await page.getByRole('button',{name:action==='Archive'?'Archive Box A':'Delete Box A permanently',exact:true}).click();
        assert.equal(await page.getByRole('button',{name:action==='Archive'?'Archive location':'Delete location permanently',exact:true}).count(),1);
        await page.evaluate("locations.render({host:'other'})");assert.equal(await page.getByRole('button',{name:action==='Archive'?'Archive location':'Delete location permanently',exact:true}).count(),0);
      });
    }
    await scenario("merge review is discarded after refreshed location data",async page=>{
      await page.locator('summary').filter({hasText:'Advanced: merge locations'}).click();await page.getByLabel('Source location',{exact:true}).selectOption('a');await page.getByLabel('Target location',{exact:true}).selectOption('b');
      await page.getByRole('button',{name:'Review merge',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Confirm merge & archive',exact:true}).count(),1);
      await page.evaluate("locations.render({revision:1})");assert.equal(await page.getByRole('button',{name:'Confirm merge & archive',exact:true}).count(),0);
    });
    await scenario("rename keeps a rejected draft and restores focus after a successful retry",async page=>{
      await page.getByRole('button',{name:'Rename Box A',exact:true}).click();
      await page.getByRole('textbox',{name:'Rename Box A',exact:true}).fill('Renamed');
      await page.getByRole('button',{name:'Save',exact:true}).click();await page.evaluate("locations.finish(0,true)");
      assert.equal(await page.getByRole('textbox',{name:'Rename Box A',exact:true}).inputValue(),'Renamed');
      await page.getByRole('button',{name:'Save',exact:true}).click();await page.evaluate("locations.finish(1)");
      await page.waitForFunction("document.activeElement?.getAttribute('aria-label')==='Rename Box A'");
      assert.equal(await page.getByRole('button',{name:'Save',exact:true}).count(),0);
    });
    await scenario("merge confirmation sends its reviewed pair and clears choices after success",async page=>{
      await page.locator('summary').filter({hasText:'Advanced: merge locations'}).click();
      await page.getByLabel('Source location',{exact:true}).selectOption('a');await page.getByLabel('Target location',{exact:true}).selectOption('b');
      await page.getByRole('button',{name:'Review merge',exact:true}).click();await page.evaluate("locations.refreshRows()");await page.getByRole('button',{name:'Confirm merge & archive',exact:true}).click();
      assert.deepEqual((await page.evaluate("locations.snapshot()")).calls[0].payload.input,{source_id:'a',target_id:'b'});
      await page.evaluate("locations.finish(0)");assert.equal(await page.getByLabel('Source location',{exact:true}).inputValue(),'');
      assert.equal(await page.getByLabel('Target location',{exact:true}).inputValue(),'');
      await page.waitForFunction("document.activeElement?.getAttribute('aria-label')==='Rename Box B'");
    });
    await scenario("rejected delete dismisses the old confirmation and returns focus",async page=>{
      await page.getByRole('button',{name:'Delete Box A permanently',exact:true}).click();
      await page.evaluate("locations.refreshRows()");await page.getByRole('button',{name:'Delete location permanently',exact:true}).click();await page.evaluate("locations.finish(0,true)");
      assert.equal(await page.getByRole('button',{name:'Delete location permanently',exact:true}).count(),0);
      await page.waitForFunction("document.activeElement?.getAttribute('aria-label')==='Delete Box A permanently'");
      assert.equal((await page.evaluate("locations.snapshot()")).refreshes,1);
    });
    await scenario("late create completion cannot clear the new Host draft or move focus",async page=>{
      await page.locator('#inventory-location-new-name').fill('Old draft');await page.getByRole('button',{name:'Create',exact:true}).click();await page.evaluate("locations.render({host:'other'})");
      await page.locator('#inventory-location-new-name').fill('New draft');await page.evaluate("locations.finish(0)");assert.equal(await page.locator('#inventory-location-new-name').inputValue(),'New draft');assert.equal(await page.locator('#inventory-location-new-name').evaluate(el=>el===document.activeElement),true);
    });
  } finally {await browser.close();}
});
