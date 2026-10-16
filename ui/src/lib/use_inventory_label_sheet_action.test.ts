import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function harness() {
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const entry = fileURLToPath(new URL("./__labels_virtual__.js", import.meta.url));
  const source = `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {I18nContext} from './i18n';import {useInventoryLabelSheetAction} from './use_inventory_label_sheet_action';
    import {InventoryLabelSheetModal} from '../components/inventory_label_sheet_modal';
    let api,state,oldSave,oldClose,oldOpen,oldOpenSaved,calls=[],hold=new Set();
    const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=';
    window.labelStage=(stage,data)=>{const value=stage==='shell'?'http://filament.local/companion':stage==='pdf'?'JVBERi0=':stage==='export'?'/Downloads/sheet-'+(calls.filter(c=>c.stage==='export').length+1)+'.pdf':stage==='open'?undefined:pixel;
      const call={stage,data};calls.push(call);if(!hold.has(stage))return Promise.resolve(value);
      return new Promise((resolve,reject)=>{call.resolve=()=>resolve(value);call.reject=(message='test failure')=>reject(Error(message));});};
    window.__TAURI__={invoke:(command,payload)=>window.labelStage(command==='open_exported_label_file'?'open':'export',{command,payload})};
    const t=(_key,fallback='',params={})=>fallback.replace(/\\{(\\w+)\\}/g,(_,key)=>params[key]??key);
    const spools=['a','b'].map((id,i)=>({id,masterId:'master',status:i?'EMPTY':'IN_STOCK',material:'PLA',vendor:'Vendor',filamentName:'Basic',colorName:'Blue',ownershipType:'OWNED'}));
    function Harness({workspace='STOCK',ready=true,loadingInventory=false,busy=false,host='local',generation=1,library='library',tauri=true}) {
      const [error,setError]=useState(null),[info,setInfo]=useState(null);
      api=useInventoryLabelSheetAction({workspaceView:workspace,ready,loadingInventory,busy,clientHostBaseUrl:host,clientReadOnly:host!=='local',clientLibraryId:library,
        clientTargetGeneration:generation,locale:'en',spools,tauriAvailable:tauri,t,setError,setInfoMessage:setInfo});
      state={error,info};return React.createElement(I18nContext.Provider,{value:{locale:'en',setLocale:()=>{},t}},
        React.createElement('button',{onClick:()=>api.openLabelSheet()},'Labels'),React.createElement(InventoryLabelSheetModal,api.modalProps));
    }
    const root=createRoot(document.getElementById('root'));const render=(p={})=>flushSync(()=>root.render(React.createElement(Harness,p)));
    window.labels={render,open:()=>{void api.openLabelSheet();},selected:()=>{void api.openLabelSheet({action:'LABELS',selectedCount:1,spoolIds:['b']});},stale:()=>{void api.openLabelSheet({action:'LABELS',selectedCount:1,spoolIds:['missing']});},
      close:()=>api.modalProps.onClose(),save:()=>{void api.modalProps.onSave('a4');},doubleOpen:()=>{api.openLabelSheet();api.openLabelSheet();},
      doubleSave:()=>{api.modalProps.onSave('a4');api.modalProps.onSave('a4');},capture:()=>{oldSave=api.modalProps.onSave;oldClose=api.modalProps.onClose;oldOpen=api.openLabelSheet;oldOpenSaved=api.modalProps.onOpenSavedFile;},
      oldSave:()=>{void oldSave('a4');},oldClose:()=>oldClose(),oldOpen:()=>{void oldOpen();},oldOpenSaved:()=>{void oldOpenSaved?.();},openSaved:()=>{void api.modalProps.onOpenSavedFile?.();},hold:stage=>hold.add(stage),
      finish:(index,fail=false,message)=>{fail?calls[index].reject(message):calls[index].resolve();},
      snapshot:()=>({...state,open:api.modalProps.open,loading:api.modalProps.loading,saving:api.modalProps.saving,saved:api.modalProps.savedMessage,opening:api.modalProps.openingSavedFile,items:api.modalProps.items,
        calls:calls.map(({stage,data})=>({stage,data}))})};
  `;
  const mocks: Record<string, string> = {
    spool_qr_artifacts: `export const resolveSpoolQrCompanionShellUrl=options=>window.labelStage('shell',options);`,
    filament_label_print: `export const buildFilamentLabelPngDataUrl=row=>window.labelStage('png',row);`,
    filament_qr_branding: `export const buildBrandedFilamentQrDataUrl=(payload,appearance)=>window.labelStage('qr',{payload,appearance});`,
    inventory_overview_print: `export const buildInventoryLabelSheetPdfBase64=(items,paper)=>window.labelStage('pdf',{items,paper});`,
  };
  const result = await build({ root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false, logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") }, plugins: [{ name: "labels", enforce: "pre",
      resolveId(id: string) { if (id === entry) return entry; const name=id.split('/').pop()!;return mocks[name]?`\0${name}`:null; },
      load(id: string) { return id===entry?source:mocks[id.slice(1)]??null; } }],
    build: { write: false, minify: false, lib: { entry, formats: ["iife"], name: "Labels" } } });
  const script=(Array.isArray(result)?result:[result]).flatMap(value=>value.output).find(value=>value.type==='chunk'&&value.isEntry)?.code;
  assert.ok(script);return `<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script>${script.replaceAll('</script','<\\/script')}</script></body></html>`;
}

test('rendered label sheet lifecycle', async context => {
  const html=await harness(),browser=await chromium.launch({headless:true});
  const scenario=async(name:string,run:(page:Awaited<ReturnType<typeof browser.newPage>>)=>Promise<void>)=>context.test(name,async()=>{
    const page=await browser.newPage();page.setDefaultTimeout(5000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    try {await page.setContent(html);await page.evaluate('labels.render()');await run(page);assert.deepEqual(errors,[]);}finally{await page.close();}
  });
  const ready=async(page:Awaited<ReturnType<typeof browser.newPage>>)=>page.waitForFunction('labels.snapshot().open&&!labels.snapshot().loading');
  try {
    await scenario('duplicate open renders the on-hand roll once',async page=>{
      await page.evaluate('labels.doubleOpen()');await ready(page);const s=await page.evaluate('labels.snapshot()');assert.deepEqual(s.items.map((item:{reference:string})=>item.reference),['a']);assert.equal(s.calls.filter((c:{stage:string})=>c.stage==='shell').length,1);
      assert.equal(s.calls.find((c:{stage:string})=>c.stage==='qr').data.appearance,'color');
    });
    await scenario('explicit selection includes the selected empty roll only',async page=>{
      await page.evaluate('labels.selected()');await ready(page);assert.deepEqual((await page.evaluate('labels.snapshot()')).items.map((item:{reference:string})=>item.reference),['b']);
    });
    await scenario('stale selection reports an error inside the builder before generating labels',async page=>{
      await page.evaluate('labels.stale()');const s=await page.evaluate('labels.snapshot()');assert.equal(s.open,true);assert.equal(s.calls.length,0);assert.match(await page.getByRole('dialog').getByRole('alert').innerText(),/Failed to create inventory label sheets/);
    });
    await scenario('missing Companion address explains the prerequisite inside the sheet',async page=>{
      await page.evaluate("labels.hold('shell');labels.open()");
      await page.waitForFunction("labels.snapshot().calls.length===1");
      await page.evaluate("labels.finish(0,true,'Companion QR link is unavailable.')");
      const alert=page.getByRole('dialog').getByRole('alert');
      await alert.waitFor();
      assert.match(await alert.innerText(),/stable local address.*Settings → Library & web app/);
      assert.equal((await page.evaluate('labels.snapshot()')).calls.length,1);
    });
    for(const stage of ['shell','qr','png']) {
      await scenario(`close during ${stage} discards late generation`,async page=>{
        await page.evaluate(`labels.hold('${stage}');labels.open()`);await page.waitForFunction(`labels.snapshot().calls.some(c=>c.stage==='${stage}')`);
        const index=await page.evaluate(`labels.snapshot().calls.findIndex(c=>c.stage==='${stage}')`);
        await page.evaluate(`labels.close();labels.finish(${index})`);await page.waitForTimeout(30);const s=await page.evaluate('labels.snapshot()');assert.equal(s.open,false);assert.equal(s.loading,false);assert.deepEqual(s.items,[]);assert.equal(s.error,null);
      });
    }
    await scenario('old generation failure cannot unlock or report into a reopened sheet',async page=>{
      await page.evaluate("labels.hold('png');labels.open()");await page.waitForFunction("labels.snapshot().calls.some(c=>c.stage==='png')");
      await page.evaluate('labels.close();labels.open()');await page.waitForFunction("labels.snapshot().calls.filter(c=>c.stage==='png').length===2");
      await page.evaluate('labels.finish(2,true)');await page.waitForTimeout(30);const s=await page.evaluate('labels.snapshot()');assert.equal(s.loading,true);assert.equal(s.error,null);await page.evaluate('labels.finish(5)');await ready(page);
    });
    await scenario('duplicate saves export exactly one reviewed PDF',async page=>{
      await page.evaluate('labels.open()');await ready(page);await page.evaluate("labels.hold('export');labels.doubleSave()");await page.waitForFunction("labels.snapshot().calls.some(c=>c.stage==='export')");
      const s=await page.evaluate('labels.snapshot()');assert.equal(s.calls.filter((c:{stage:string})=>c.stage==='export').length,1);assert.equal(s.calls.filter((c:{stage:string})=>c.stage==='pdf').length,1);await page.evaluate('labels.finish(4)');await page.waitForFunction('!labels.snapshot().saving&&labels.snapshot().saved');assert.match((await page.evaluate('labels.snapshot()')).info,/sheet-1.pdf/);assert.equal(await page.getByRole('button',{name:'Open saved file',exact:true}).count(),1);assert.equal((await page.evaluate('labels.snapshot()')).calls.filter((c:{stage:string})=>c.stage==='open').length,0);
    });
    await scenario('close during PDF creation prevents native export',async page=>{
      await page.evaluate('labels.open()');await ready(page);await page.evaluate("labels.hold('pdf');labels.save()");await page.waitForFunction("labels.snapshot().calls.some(c=>c.stage==='pdf')");await page.evaluate('labels.close();labels.finish(3)');await page.waitForTimeout(30);assert.equal((await page.evaluate('labels.snapshot()')).calls.filter((c:{stage:string})=>c.stage==='export').length,0);
    });
    await scenario('old save and close callbacks cannot affect a new sheet',async page=>{
      await page.evaluate('labels.open()');await ready(page);await page.evaluate('labels.capture();labels.close();labels.open()');await ready(page);await page.evaluate('labels.oldSave();labels.oldClose()');const s=await page.evaluate('labels.snapshot()');assert.equal(s.open,true);assert.equal(s.calls.filter((c:{stage:string})=>c.stage==='pdf').length,0);
    });
    for(const fail of [false,true]) {
      await scenario(`Host A→B→A ignores late export ${fail?'failure':'success'}`,async page=>{
        await page.evaluate('labels.open()');await ready(page);await page.evaluate("labels.hold('export');labels.save()");await page.waitForFunction("labels.snapshot().calls.some(c=>c.stage==='export')");
        await page.evaluate(`labels.render({host:'other'});labels.render();labels.open();labels.finish(4,${fail})`);await ready(page);const s=await page.evaluate('labels.snapshot()');assert.equal(s.open,true);assert.equal(s.error,null);assert.equal(s.info,null);
      });
    }
    await scenario('failed export retains preview for explicit retry',async page=>{
      await page.evaluate('labels.open()');await ready(page);await page.evaluate("labels.hold('export');labels.save()");await page.waitForFunction("labels.snapshot().calls.some(c=>c.stage==='export')");await page.evaluate('labels.finish(4,true)');await page.waitForFunction('!labels.snapshot().saving');assert.match(await page.getByRole('dialog').getByRole('alert').innerText(), /Failed to create inventory label sheets/);assert.equal((await page.evaluate('labels.snapshot()')).items.length,1);await page.evaluate('labels.save()');await page.waitForFunction("labels.snapshot().calls.filter(c=>c.stage==='export').length===2");await page.evaluate('labels.finish(6)');await page.waitForFunction('!labels.snapshot().saving&&labels.snapshot().saved');
    });
    for(const props of ['{workspace:"LOCATIONS"}','{ready:false}','{loadingInventory:true}','{busy:true}','{tauri:false}','{generation:2}','{library:"other"}']) {
      await scenario(`changed eligibility or authority blocks old callbacks: ${props}`,async page=>{
        await page.evaluate('labels.open()');await ready(page);await page.evaluate(`labels.capture();labels.render(${props});labels.oldSave();labels.oldOpen()`);assert.equal((await page.evaluate('labels.snapshot()')).calls.filter((c:{stage:string})=>c.stage==='pdf').length,0);
      });
    }
    await scenario('label sheets remain available from other inventory workspace views',async page=>{
      await page.evaluate("labels.render({workspace:'LOCATIONS'});labels.open()");await ready(page);assert.equal((await page.evaluate('labels.snapshot()')).items.length,1);
    });
    await scenario('failed preview offers only explicit retry for the original exact selection',async page=>{
      await page.evaluate("labels.hold('qr');labels.selected()");await page.waitForFunction("labels.snapshot().calls.some(c=>c.stage==='qr')");
      await page.evaluate("labels.finish(1,true)");await ready(page);await page.waitForTimeout(40);assert.equal((await page.evaluate('labels.snapshot()')).calls.length,2);
      await page.getByRole('button',{name:'Try preview again',exact:true}).click();await page.waitForFunction("labels.snapshot().calls.filter(c=>c.stage==='qr').length===2");
      await page.evaluate('labels.finish(3)');await ready(page);const s=await page.evaluate('labels.snapshot()');assert.deepEqual(s.items.map((item:{reference:string})=>item.reference),['b']);assert.equal(await page.getByRole('button',{name:'Try preview again',exact:true}).count(),0);
    });
    await scenario('saved PDF opens only on explicit request and changed paper invalidates old callbacks',async page=>{
      await page.evaluate('labels.open()');await ready(page);assert.match(await page.getByRole('dialog').innerText(),/100% or Actual size/);
      await page.getByRole('button',{name:'Save PDF to Downloads',exact:true}).click();await page.waitForFunction('labels.snapshot().saved');await page.evaluate('labels.capture()');
      await page.getByRole('button',{name:/^US Letter/}).click();assert.equal(await page.getByRole('button',{name:'Open saved file',exact:true}).count(),0);
      await page.evaluate('labels.oldOpenSaved()');assert.equal((await page.evaluate('labels.snapshot()')).calls.filter((c:{stage:string})=>c.stage==='open').length,0);
      await page.getByRole('button',{name:'Save PDF to Downloads',exact:true}).click();await page.waitForFunction('labels.snapshot().saved');
      let s=await page.evaluate('labels.snapshot()');assert.equal(s.calls.filter((c:{stage:string})=>c.stage==='pdf').at(-1).data.paper,'letter');
      await page.getByRole('button',{name:'Open saved file',exact:true}).click();await page.waitForFunction('!labels.snapshot().opening');
      s=await page.evaluate('labels.snapshot()');assert.deepEqual(s.calls.filter((c:{stage:string})=>c.stage==='open').map((c:{data:{payload:{path:string}}})=>c.data.payload.path),['/Downloads/sheet-2.pdf']);
    });
    await scenario('missing saved PDF explains save again, and native opening is single flight',async page=>{
      await page.evaluate('labels.open()');await ready(page);await page.evaluate('labels.save()');await page.waitForFunction('labels.snapshot().saved');
      await page.evaluate("labels.hold('open');labels.openSaved();labels.openSaved()");await page.waitForFunction("labels.snapshot().calls.some(c=>c.stage==='open')");
      const s=await page.evaluate('labels.snapshot()');assert.equal(s.calls.filter((c:{stage:string})=>c.stage==='open').length,1);assert.equal(await page.getByRole('button',{name:/^US Letter/}).isDisabled(),true);
      await page.evaluate(`labels.finish(5,true,JSON.stringify({code:'export.saved_file_unavailable',safe_detail:null,diagnostic_id:null}))`);await page.waitForFunction('!labels.snapshot().opening');
      assert.match(await page.getByRole('dialog').getByRole('alert').innerText(),/Save it again/);assert.equal(await page.getByRole('button',{name:'Save PDF to Downloads',exact:true}).isEnabled(),true);
    });
    await scenario('old saved-file callback and late opening errors cannot enter a new Host session',async page=>{
      await page.evaluate('labels.open()');await ready(page);await page.evaluate('labels.save()');await page.waitForFunction('labels.snapshot().saved');
      await page.evaluate("labels.capture();labels.hold('open');labels.openSaved()");await page.waitForFunction('labels.snapshot().opening');
      await page.evaluate(`labels.render({host:'other',generation:2});labels.render({generation:3});labels.open();labels.oldOpenSaved();labels.finish(5,true)`);await ready(page);
      assert.equal(await page.getByRole('dialog').getByRole('alert').count(),0);assert.equal(await page.getByRole('button',{name:'Open saved file',exact:true}).count(),0);
      assert.equal((await page.evaluate('labels.snapshot()')).calls.filter((c:{stage:string})=>c.stage==='open').length,1);
    });
    await scenario('rendered close and save controls preserve the lifecycle',async page=>{
      await page.getByRole('button',{name:'Labels',exact:true}).click();await ready(page);await page.getByRole('button',{name:'Save PDF to Downloads',exact:true}).click();await page.waitForFunction('!labels.snapshot().saving&&labels.snapshot().saved');await page.getByRole('button',{name:'Close',exact:true}).click();await page.waitForFunction('!labels.snapshot().open');await page.waitForFunction("document.activeElement?.textContent==='Labels'");
    });
  } finally {await browser.close();}
});
