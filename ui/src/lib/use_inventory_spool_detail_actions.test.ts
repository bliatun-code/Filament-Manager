import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function harness() {
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const entry = fileURLToPath(new URL("./__detail_save_virtual__.js", import.meta.url));
  const modulePath = JSON.stringify(fileURLToPath(new URL("./use_inventory_spool_detail_actions.ts", import.meta.url)));
  const source = `
    import React,{useState} from "react";
    import {createRoot} from "react-dom/client";
    import {flushSync} from "react-dom";
    import {useInventorySpoolDetailActions} from ${modulePath};
    let actions,state,oldAction;const calls=[],pending=[],reloads=[],marks=[];
    let failure="LIVE",hold=false,release;const noop=()=>{};
    window.__TAURI__={invoke:(command,payload)=>new Promise((resolve,reject)=>calls.push({command,payload,resolve,reject}))};
    function Harness({id="a",host="local",generation=1,open=true,tare="200",name="Blue",status="IN_STOCK",unlocked=true}) {
      const [busy,setBusy]=useState(false),[error,setError]=useState(null),[info,setInfo]=useState(null);
      const selectedSpool=open?{id,masterId:"master-"+id,status,qrCode:"qr-"+id,locationId:null,homeLocationId:null,
        location:null,homeLocation:null,ownershipType:"OWNED",purchasePrice:null,purchaseCurrency:null,
        purchasePriceBatchLocked:false,remainingGrams:500}:null;
      const reload=kind=>async(...args)=>{reloads.push(kind);if(hold&&kind==="spools")await new Promise(resolve=>release=resolve);
        const report=args.find(a=>typeof a==="function");if(kind==="catalog")report?.(failure==="LIVE");else report?.(kind,failure==="CATALOG"?"LIVE":failure);if(failure==="throw")throw Error("refresh failed");};
      actions=useInventorySpoolDetailActions({selectedSpool,tauriAvailable:true,manageBusy:busy,setManageBusy:setBusy,
        clientReadOnly:host!=="local",clientHostBaseUrl:"http://"+host,clientLibraryId:"library",clientTargetGeneration:generation,
        canUseClientHostWrite:()=>true,ensureLocalWriteAllowed:()=>true,cancelDangerZoneConfirmation:noop,
        editMasterColorName:name,editMasterFilamentName:"PLA Basic",editMasterHexColor:"#123456",editMasterMaterial:"PLA",editMasterVendor:"Vendor",
        locations:[],masterEditUnlocked:unlocked,selectedSpoolLocationDraft:"",selectedSpoolLoanedOut:false,
        selectedSpoolOwnerContactDraft:"",selectedSpoolOwnerNameDraft:"",selectedSpoolOwnershipDraft:"OWNED",selectedSpoolOwnershipNoteDraft:"",
        selectedSpoolPurchasePriceBatchLockedDraft:false,selectedSpoolPurchaseMetadataDraft:{pricePerRoll:"",currency:"",purchaseDate:"",batchCode:"",supplierReference:""},
        selectedSpoolResolvedTare:200,selectedSpoolTareDraft:tare,
        setError,setInfoMessage:setInfo,setMasterEditUnlocked:value=>marks.push(["unlock",value]),
        setSelectedSpoolOwnerContactDraft:noop,setSelectedSpoolOwnerNameDraft:noop,setSelectedSpoolOwnershipNoteDraft:noop,
        setSelectedSpoolPurchaseMetadataErrors:noop,setSelectedSpoolTareDraft:value=>marks.push(["tare",value]),
        markCommonDetailsSaved:()=>marks.push(["common",id,tare]),markMasterMetadataSaved:()=>marks.push(["master",id,name]),
        reloadSpools:reload("spools"),reloadCatalog:reload("catalog"),reloadActiveLoans:reload("loans"),
        reloadPrinterOverview:reload("printers"),reloadSpoolDetail:reload("detail"),t:(_key,fallback)=>fallback});
      state={busy,error:actions.detailSaveError??error,info};
      return React.createElement("div",null,state.error&&React.createElement("div",{role:"alert"},state.error),
        React.createElement("button",{disabled:busy,onClick:()=>pending.push(actions.handleSaveSpoolCommonDetails())},"Save roll"),
        React.createElement("button",{disabled:busy,onClick:()=>pending.push(actions.handleSaveMasterMetadata())},"Save catalog"));
    }
    const root=createRoot(document.getElementById("root"));const action=kind=>kind==="master"?actions.handleSaveMasterMetadata:actions.handleSaveSpoolCommonDetails;
    window.detail={render:(props={})=>flushSync(()=>root.render(React.createElement(Harness,props))),
      start:kind=>pending.push(action(kind)()),double:kind=>{pending.push(action(kind)());pending.push(action(kind)());},
      save:kind=>{oldAction=action(kind);},old:()=>pending.push(oldAction()),
      finish:async(index,reject=false,wait=true)=>{await Promise.resolve();if(reject)calls[index].reject(Error("write rejected"));else calls[index].resolve();
        if(wait&&!hold)await Promise.all(pending);flushSync(()=>{});},
      failure:value=>{failure=value;},hold:()=>{hold=true;},release:async()=>{release();await Promise.all(pending);flushSync(()=>{});},
      snapshot:()=>({...state,calls:calls.map(({command,payload})=>({command,payload})),reloads,marks})};
  `;
  const result = await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",
    define:{"process.env.NODE_ENV":JSON.stringify("production")},
    plugins:[{name:"detail-save",resolveId:(id:string)=>id===entry?entry:null,load:(id:string)=>id===entry?source:null}],
    build:{write:false,minify:false,lib:{entry,formats:["iife"],name:"DetailSave"}}});
  const script=(Array.isArray(result)?result:[result]).flatMap(value=>value.output).find(value=>value.type==="chunk"&&value.isEntry)?.code;
  assert.ok(script);
  return `<html><body><div id="root"></div><script>${script.replaceAll("</script","<\\/script")}</script></body></html>`;
}

test("rendered roll and catalog detail saves",async context=>{
  const html=await harness(),browser=await chromium.launch({headless:true});
  const scenario=async(name:string,run:(page:Awaited<ReturnType<typeof browser.newPage>>)=>Promise<void>)=>context.test(name,async()=>{
    const page=await browser.newPage();page.setDefaultTimeout(5000);const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    try{await page.setContent(html);await page.evaluate("detail.render()");await run(page);assert.deepEqual(errors,[]);}finally{await page.close();}
  });
  try {
    await scenario("catalog-only refresh failure is reported after confirmed save",async page=>{
      await page.evaluate("detail.failure('CATALOG');detail.start('master');detail.finish(0)");
      const state=await page.evaluate("detail.snapshot()");assert.equal(state.error,"Failed to load inventory.");assert.ok(state.marks.some((m:string[])=>m[0]==="master"));
    });
    await scenario("common and catalog share a synchronous submission lock",async page=>{
      await page.evaluate("detail.start('common');detail.start('master')");
      assert.equal((await page.evaluate("detail.snapshot()")).calls.length,1);await page.evaluate("detail.finish(0)");
    });
    for(const kind of ["common","master"]) {
      await scenario(`${kind}: same-event duplicate sends one write`,async page=>{
        await page.evaluate(`detail.double('${kind}')`);
        await page.waitForFunction("detail.snapshot().calls.length>0");
        assert.equal((await page.evaluate("detail.snapshot()")).calls.length,1);
        await page.evaluate("detail.finish(0)");
      });
      await scenario(`${kind}: late response cannot mark another roll saved`,async page=>{
        await page.evaluate(`detail.start('${kind}');detail.render({id:'b'});detail.finish(0)`);
        const state=await page.evaluate("detail.snapshot()");assert.deepEqual(state.marks,[]);assert.deepEqual(state.reloads,[]);assert.equal(state.info,null);
      });
      await scenario(`${kind}: committed save survives refresh rejection`,async page=>{
        await page.evaluate(`detail.failure('throw');detail.start('${kind}');detail.finish(0)`);
        const state=await page.evaluate("detail.snapshot()");assert.equal(state.error,"Failed to load inventory.");
        assert.ok(state.marks.some((m:string[])=>m[0]===kind));
        await page.evaluate(`detail.start('${kind}')`);assert.equal((await page.evaluate("detail.snapshot()")).calls.length,1);
      });
      await scenario(`${kind}: rejected write permits explicit retry`,async page=>{
        await page.evaluate(`detail.start('${kind}');detail.finish(0,true)`);
        assert.ok((await page.evaluate("detail.snapshot()")).error);
        await page.evaluate(`detail.start('${kind}');detail.finish(1)`);
        assert.equal((await page.evaluate("detail.snapshot()")).calls.length,2);
      });
      for(const props of ["{open:false}","{host:'other'}","{generation:2}"]) {
        await scenario(`${kind}: saved callback and late failure are discarded after ${props}`,async page=>{
          await page.evaluate(`detail.save('${kind}');detail.start('${kind}');detail.render(${props});detail.finish(0,true);detail.old()`);
          const state=await page.evaluate("detail.snapshot()");assert.equal(state.calls.length,1);assert.equal(state.error,null);assert.equal(state.busy,false);assert.deepEqual(state.marks,[]);
        });
      }
      for(const reject of [false,true]) {
        await scenario(`${kind}: old A completion cannot unlock a new A submission (${reject})`,async page=>{
          await page.evaluate(`detail.save('${kind}');detail.start('${kind}');detail.render({id:'b'});detail.render();detail.old();detail.start('${kind}')`);
          await page.waitForFunction("detail.snapshot().calls.length===2");
          await page.evaluate(`detail.finish(0,${reject},false)`);
          const state=await page.evaluate("detail.snapshot()");assert.equal(state.busy,true);assert.deepEqual(state.marks,[]);assert.deepEqual(state.reloads,[]);
          await page.evaluate("detail.finish(1)");
        });
      }
      await scenario(`${kind}: old draft callback stays invalid after A→B→A edits`,async page=>{
        await page.evaluate(`detail.save('${kind}');detail.render({tare:'201',name:'Red'});detail.render();detail.old()`);
        assert.equal((await page.evaluate("detail.snapshot()")).calls.length,0);
      });
      for(const failure of ["ERROR","OFFLINE","CACHED"]) {
        await scenario(`${kind}: ${failure} refresh preserves commit acknowledgement`,async page=>{
          await page.evaluate(`detail.failure('${failure}');detail.start('${kind}');detail.finish(0)`);
          const state=await page.evaluate("detail.snapshot()");assert.equal(state.error,"Failed to load inventory.");assert.ok(state.marks.some((m:string[])=>m[0]===kind));
        });
      }
      await scenario(`${kind}: refresh from a closed view cannot publish errors`,async page=>{
        await page.evaluate(`detail.hold();detail.failure('ERROR');detail.start('${kind}');detail.finish(0)`);
        await page.waitForFunction("detail.snapshot().reloads.length>=4");
        await page.evaluate("detail.render({id:'b'});detail.release()");
        assert.equal((await page.evaluate("detail.snapshot()")).error,null);
      });
      await scenario(`${kind}: newer draft can be submitted after the first commit`,async page=>{
        await page.evaluate(`detail.start('${kind}');detail.render({tare:'201',name:'Red'});detail.finish(0)`);
        const state=await page.evaluate("detail.snapshot()");
        assert.ok(!state.marks.some((m:string[])=>m[0]===(kind==="common"?"tare":"unlock")));
        await page.evaluate(`detail.start('${kind}');detail.finish(1)`);
        assert.equal((await page.evaluate("detail.snapshot()")).calls.length,2);
      });
      await scenario(`${kind}: Host request carries reviewed target generation`,async page=>{
        await page.evaluate(`detail.render({host:'host',generation:7});detail.start('${kind}')`);
        const call=(await page.evaluate("detail.snapshot()")).calls[0];
        if(kind==="common") assert.deepEqual(call.payload.expectedAuthority,{mode:"CLIENT",base_url:"http://host",library_id:"library",target_generation:7});
        else assert.equal(call.payload.input.expected_target_generation,7);
        await page.evaluate("detail.finish(0)");
      });
      await scenario(`${kind}: incomplete Host generation fails before invoking`,async page=>{
        await page.evaluate(`detail.render({host:'host',generation:null});detail.start('${kind}')`);
        await page.waitForFunction("detail.snapshot().error!==null");assert.equal((await page.evaluate("detail.snapshot()")).calls.length,0);
      });

    }
  } finally {await browser.close();}
});
