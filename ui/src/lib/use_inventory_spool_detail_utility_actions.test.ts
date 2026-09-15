import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function harness() {
  const require=createRequire(new URL('../../package.json',import.meta.url));
  const {build}=await import(pathToFileURL(require.resolve('vite')).href);
  const entry=fileURLToPath(new URL('./__utilities_virtual__.js',import.meta.url));
  const source=`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {useInventorySpoolDetailUtilityActions} from './use_inventory_spool_detail_utility_actions';
    let api,state,calls=[],reloads=[],old,held=false,release,failure='LIVE';
    window.__TAURI__={invoke:(command,payload)=>new Promise((resolve,reject)=>calls.push({command,payload,resolve,reject}))};
    const t=(_key,fallback='')=>fallback;
    function Harness({active=true,ready=true,host='local',generation=1,id='a',capture=true,tag='TAG-123',slot='slot-a',paired=true,allowed=true,tauri=true}) {
      const [busy,setBusy]=useState(false),[error,setError]=useState(null),[info,setInfo]=useState(null),[rfidError,setRfidError]=useState(null),[open,setOpen]=useState(true);
      const reload=kind=>async report=>{reloads.push(kind);if(held&&(kind==='spools'||reloads.length===1&&kind==='printers'))await new Promise(resolve=>release=resolve);if(failure==='throw')throw Error('refresh rejected');report?.(kind,failure);};
      api=useInventorySpoolDetailUtilityActions({active,ready,captureOpen:capture&&open,selectedRfidCaptureSlotId:slot,clientTargetGeneration:generation,
        canUseClientHostWrite:()=>paired,clientHostBaseUrl:'http://'+host,clientLibraryId:'library',clientReadOnly:host!=='local',closeRfidCaptureModal:()=>setOpen(false),
        ensureLocalWriteAllowed:()=>allowed,manageBusy:busy,openRfidCaptureModal:()=>setOpen(true),reloadPrinterOverview:reload('printers'),reloadSpoolDetail:()=>reload('detail')(),reloadSpools:reload('spools'),
        rfidCaptureLastSeenAt:'2026-09-15T12:00:00Z',rfidCaptureSummary:{rfidTag:tag},selectedRfidCaptureLiveIntegration:null,selectedSpool:{id},
        selectedSpoolAssignedSlot:null,selectedSpoolRfidCaptureSlots:[],setError,setInfoMessage:setInfo,setManageBusy:setBusy,setRfidCaptureError:setRfidError,
        setSelectedRfidCaptureSlotId:()=>{},setShowRfidCapturedFields:()=>{},tauriAvailable:tauri,t});
      state={busy,error,info,rfidError,open};return React.createElement('div');
    }
    const root=createRoot(document.getElementById('root'));const render=(props={})=>flushSync(()=>root.render(React.createElement(Harness,props)));
    const run=kind=>{void(kind==='RFID'?api.handleSaveCapturedRfid():api.handlePrintLabel('ptouch-24','data:image/png;base64,cG5n'));};
    window.utility={render,run,start:()=>api.handleStartRfidCapture(),double:kind=>{run(kind);run(kind);},capture:kind=>{const fn=api.handlePrintLabel;old=kind==='RFID'?api.handleSaveCapturedRfid:()=>fn('ptouch-24','data:image/png;base64,cG5n');},old:()=>{void old();},
      hold:()=>{held=true;},failure:value=>{failure=value;},release:()=>release(),finish:async(index,fail=false)=>{await new Promise(resolve=>setTimeout(resolve,0));fail?calls[index].reject(Error('write rejected')):calls[index].resolve('/Downloads/label.png');},
      snapshot:()=>({...state,calls:calls.map(({command,payload})=>({command,payload})),reloads})};
  `;
  const result=await build({root:fileURLToPath(new URL('../../',import.meta.url)),configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},
    plugins:[{name:'utilities',resolveId:(id:string)=>id===entry?entry:null,load:(id:string)=>id===entry?source:null}],
    build:{write:false,minify:false,lib:{entry,formats:['iife'],name:'Utilities'}}});
  const script=(Array.isArray(result)?result:[result]).flatMap(value=>value.output).find(value=>value.type==='chunk'&&value.isEntry)?.code;
  assert.ok(script);return `<html><body><div id="root"></div><script>${script.replaceAll('</script','<\\/script')}</script></body></html>`;
}

test('inventory detail utility lifecycle',async context=>{
  const html=await harness(),browser=await chromium.launch({headless:true});
  const scenario=async(name:string,run:(page:Awaited<ReturnType<typeof browser.newPage>>)=>Promise<void>)=>context.test(name,async()=>{
    const page=await browser.newPage();page.setDefaultTimeout(5000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    try{await page.setContent(html);await page.evaluate('utility.render()');await run(page);assert.deepEqual(errors,[]);}finally{await page.close();}
  });
  try {
    await scenario('capture opening refresh is single flight and ignores a late error after close',async page=>{
      await page.evaluate("utility.render({capture:false});utility.hold();utility.failure('throw');utility.start();utility.start();utility.render()");
      await page.waitForFunction('utility.snapshot().reloads.length===1');await page.evaluate('utility.render({capture:false});utility.release()');await page.waitForTimeout(30);assert.equal((await page.evaluate('utility.snapshot()')).rfidError,null);
    });
    for(const kind of ['RFID','PNG']) {
      await scenario(`${kind}: duplicate submission sends one command`,async page=>{
        await page.evaluate(`utility.double('${kind}')`);assert.equal((await page.evaluate('utility.snapshot()')).calls.length,1);await page.evaluate('utility.finish(0)');await page.waitForFunction('!utility.snapshot().busy');const done=await page.evaluate('utility.snapshot()');assert.equal(done.error,null);assert.equal(done.rfidError,null);assert.ok(done.info);if(kind==='RFID')assert.equal(done.open,false);
      });
      for(const fail of [false,true]) {
        await scenario(`${kind}: old ${fail?'failure':'success'} cannot alter a new detail operation`,async page=>{
          await page.evaluate(`utility.run('${kind}');utility.render({id:'b'});utility.run('${kind}');utility.finish(0,${fail})`);await page.waitForTimeout(30);
          const s=await page.evaluate('utility.snapshot()');assert.equal(s.busy,true);assert.equal(s.error,null);assert.equal(s.rfidError,null);assert.equal(s.info,null);assert.deepEqual(s.reloads,[]);await page.evaluate('utility.finish(1)');
        });
      }
      for(const props of ['{active:false}','{ready:false}','{host:"other"}','{generation:2}','{id:"b"}','{tauri:false}']) {
        await scenario(`${kind}: old callback is blocked after ${props}`,async page=>{
          await page.evaluate(`utility.capture('${kind}');utility.render(${props});utility.old()`);assert.equal((await page.evaluate('utility.snapshot()')).calls.length,0);
        });
      }
    }
    for(const failure of ['throw','ERROR','OFFLINE','CACHED']) {
      await scenario(`RFID: ${failure} refresh preserves committed success and closes capture`,async page=>{
        await page.evaluate(`utility.failure('${failure}');utility.run('RFID');utility.finish(0)`);await page.waitForFunction('!utility.snapshot().busy');
        const s=await page.evaluate('utility.snapshot()');assert.ok(s.info);assert.equal(s.error,'Failed to load inventory.');assert.equal(s.rfidError,null);assert.equal(s.open,false);assert.equal(s.reloads.length,3);
      });
    }
    await scenario('RFID: confirmed capture cannot replay after delayed refresh',async page=>{
      await page.evaluate("utility.capture('RFID');utility.hold();utility.run('RFID');utility.finish(0)");await page.waitForFunction('utility.snapshot().reloads.length===3');await page.evaluate('utility.old();utility.release()');await page.waitForFunction('!utility.snapshot().busy');await page.evaluate('utility.old()');assert.equal((await page.evaluate('utility.snapshot()')).calls.length,1);
    });
    await scenario('RFID: rejected save allows explicit retry',async page=>{
      await page.evaluate("utility.run('RFID');utility.finish(0,true)");await page.waitForFunction('!utility.snapshot().busy');assert.equal((await page.evaluate('utility.snapshot()')).open,true);await page.evaluate("utility.run('RFID');utility.finish(1)");await page.waitForFunction('!utility.snapshot().busy');assert.equal((await page.evaluate('utility.snapshot()')).open,false);
    });
    for(const props of ['{capture:false}','{tag:"different"}','{slot:"different"}','{host:"host",generation:null}','{host:"host",paired:false}','{allowed:false}','{tag:" "}']) {
      await scenario(`RFID: invalid or changed capture cannot submit: ${props}`,async page=>{
        await page.evaluate(`utility.capture('RFID');utility.render(${props});utility.old()`);assert.equal((await page.evaluate('utility.snapshot()')).calls.length,0);
      });
    }
    await scenario('RFID: Client request carries observed time and reviewed generation',async page=>{
      await page.evaluate("utility.render({host:'host',generation:7});utility.run('RFID')");const s=await page.evaluate('utility.snapshot()');assert.equal(s.calls[0].payload.input.expected_target_generation,7);assert.equal(s.calls[0].payload.input.rfid_observed_at,'2026-09-15T12:00:00Z');await page.evaluate('utility.finish(0)');
    });
    await scenario('RFID: new capture is not closed by an old accepted write',async page=>{
      await page.evaluate("utility.run('RFID');utility.render({capture:false});utility.render();utility.finish(0)");await page.waitForFunction('!utility.snapshot().busy');assert.equal((await page.evaluate('utility.snapshot()')).open,true);
    });
  } finally {await browser.close();}
});
