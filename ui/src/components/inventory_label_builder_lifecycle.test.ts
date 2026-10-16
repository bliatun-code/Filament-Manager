import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function buildHarness() {
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const entry = fileURLToPath(new URL("./__label_builder_virtual__.js", import.meta.url));
  const source = `
    import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {I18nContext} from '../lib/i18n';import {InventorySpoolQrRfidPanel} from './inventory_spool_qr_rfid_panel';
    const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=';
    const calls=[],held=new Set();let previewFails=false;
    window.labelStage=(stage,data)=>{
      const call={stage,data};calls.push(call);
      const value=stage==='export'?{success:true,message:'Saved label',exportedPath:'/Downloads/label-'+calls.filter(c=>c.stage==='export').length+'.png'}:stage==='open'?undefined:pixel;
      if(stage==='png'&&previewFails){previewFails=false;return Promise.reject(Error('synthetic preview failure'));}
      if(!held.has(stage))return Promise.resolve(value);
      return new Promise((resolve,reject)=>{call.resolve=()=>resolve(value);call.reject=message=>reject(Error(message??'synthetic failure'));});
    };
    window.__TAURI__={invoke:(command,payload)=>{if(command!=='open_exported_label_file')throw Error('Unexpected native command');return window.labelStage('open',payload);}};
    const t=(_key,fallback='')=>fallback;
    const spool={id:'spool-a',masterId:'master',status:'IN_STOCK',material:'PLA',vendor:'Bambu Lab',filamentName:'Basic',colorName:'Cobalt Blue',ownershipType:'OWNED'};
    function Harness({authority='host-a:library:1',target='https://host-a.local/companion/#/spools/spool-a',request=0}) {
      return React.createElement(I18nContext.Provider,{value:{locale:'en',setLocale:()=>{},t}},React.createElement(InventorySpoolQrRfidPanel,{
        authorityKey:authority,companionAvailable:true,dataUrl:pixel,target,spool,runtimeAvailable:true,supportsRfidCapture:false,
        deterministicLabelPreferences:false,initialLabelPanelOpen:true,labelPanelRequestId:request,loading:false,resolvedTheme:'dark',onStartRfidCapture:()=>{},
        onPrintLabel:(size,png)=>window.labelStage('export',{size,png})}));
    }
    const root=createRoot(document.getElementById('root'));
    window.labels={render:(props={})=>flushSync(()=>root.render(React.createElement(Harness,props))),
      failPreview:()=>previewFails=true,hold:stage=>held.add(stage),finish:(index,error)=>error?calls[index].reject(error):calls[index].resolve(),
      snapshot:()=>calls.map(({stage,data})=>({stage,data}))};
  `;
  const mocks: Record<string, string> = {
    filament_label_print: "export const buildFilamentLabelPngDataUrl=(row,size)=>window.labelStage('png',{row,size});",
    filament_qr_branding: "export const buildBrandedFilamentQrDataUrl=(target,appearance)=>window.labelStage('qr',{target,appearance});",
  };
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false, logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [{ name: "label-builder", enforce: "pre",
      resolveId(id: string) { if (id === entry) return entry; const name=id.split('/').pop()!; return mocks[name]?`\0${name}`:null; },
      load(id: string) { return id===entry?source:mocks[id.slice(1)]??null; },
    }],
    build: { write: false, minify: false, lib: { entry, formats: ["iife"], name: "LabelBuilder" } },
  });
  const script=(Array.isArray(result)?result:[result]).flatMap(value=>value.output).find(value=>value.type==='chunk'&&value.isEntry)?.code;
  assert.ok(script);
  return `<html><head><meta charset="UTF-8"></head><body><div id="root"></div><script>${script.replaceAll('</script','<\\/script')}</script></body></html>`;
}

test("individual label builder retries and opens only its current successful export", async context => {
  const html=await buildHarness(),browser=await chromium.launch({headless:true});
  type Page=Awaited<ReturnType<typeof browser.newPage>>;
  const scenario=async(name:string,run:(page:Page)=>Promise<void>)=>context.test(name,async()=>{
    const page=await browser.newPage();page.setDefaultTimeout(5000);const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    try {await page.setContent(html);await run(page);assert.deepEqual(errors,[]);}finally{await page.close();}
  });
  const save=(page:Page)=>page.getByRole('button',{name:'Save PNG to Downloads',exact:true});
  const ready=(page:Page)=>page.waitForFunction("[...document.querySelectorAll('button')].some(b=>b.textContent==='Save PNG to Downloads'&&!b.disabled)");
  const count=async(page:Page,stage:string)=>(await page.evaluate('labels.snapshot()')).filter((call:{stage:string})=>call.stage===stage).length;
  try {
    await scenario('failed preview has an explicit retry preserving URL, monochrome logo and label size',async page=>{
      await page.evaluate('labels.failPreview();labels.render()');await page.getByRole('button',{name:'Try preview again',exact:true}).waitFor();
      assert.equal(await save(page).isDisabled(),true);await page.waitForTimeout(250);assert.equal(await count(page,'png'),1);
      await page.getByRole('button',{name:'Try preview again',exact:true}).click();await ready(page);
      const calls=await page.evaluate('labels.snapshot()');const png=calls.filter((call:{stage:string})=>call.stage==='png');assert.deepEqual(png[0].data,png[1].data);
      assert.deepEqual(calls.filter((call:{stage:string})=>call.stage==='qr').map((call:{data:unknown})=>call.data),Array(2).fill({target:'https://host-a.local/companion/#/spools/spool-a',appearance:'monochrome'}));
      assert.match(await page.getByRole('dialog').innerText(),/100% or Actual size/);assert.equal(await count(page,'export'),0);assert.equal(await count(page,'open'),0);
    });
    await scenario('saving does not open a file; explicit Open uses the exact successful export path',async page=>{
      await page.evaluate('labels.render()');await ready(page);await save(page).click();await page.getByRole('button',{name:'Open saved file',exact:true}).waitFor();assert.equal(await count(page,'open'),0);
      await page.getByRole('button',{name:'Open saved file',exact:true}).click();await page.waitForFunction("labels.snapshot().some(c=>c.stage==='open')");
      assert.deepEqual((await page.evaluate('labels.snapshot()')).find((call:{stage:string})=>call.stage==='open').data,{path:'/Downloads/label-1.png'});
    });
    await scenario('changed size removes old success and Open until that new size is saved',async page=>{
      await page.evaluate('labels.render()');await ready(page);await save(page).click();await page.getByRole('button',{name:'Open saved file',exact:true}).waitFor();
      await page.getByRole('button',{name:/^Custom/}).click();await ready(page);assert.equal(await page.getByRole('button',{name:'Open saved file',exact:true}).count(),0);assert.equal(await page.getByText('Saved label',{exact:true}).count(),0);
      await save(page).click();await page.getByRole('button',{name:'Open saved file',exact:true}).click();const calls=await page.evaluate('labels.snapshot()');assert.equal(calls.filter((call:{stage:string})=>call.stage==='export').at(-1).data.size.selectionId,'custom');assert.equal(calls.find((call:{stage:string})=>call.stage==='open').data.path,'/Downloads/label-2.png');
    });
    await scenario('late save completion cannot expose an old file after Host A→B→A generation changes',async page=>{
      await page.evaluate("labels.render();labels.hold('export')");await ready(page);await save(page).click();await page.waitForFunction("labels.snapshot().some(c=>c.stage==='export')");
      const index=await page.evaluate("labels.snapshot().findIndex(c=>c.stage==='export')");
      await page.evaluate("labels.render({authority:'host-b:library:2',target:'https://host-b.local/companion/#/spools/spool-a'});labels.render({authority:'host-a:library:3'})");await ready(page);await page.evaluate(`labels.finish(${index})`);await page.waitForTimeout(30);
      assert.equal(await page.getByRole('button',{name:'Open saved file',exact:true}).count(),0);assert.equal(await page.getByText('Saved label',{exact:true}).count(),0);assert.equal(await count(page,'open'),0);
    });
    await scenario('missing file produces an actionable error and Save again creates a fresh export',async page=>{
      await page.evaluate("labels.render();labels.hold('open')");await ready(page);await save(page).click();await page.getByRole('button',{name:'Open saved file',exact:true}).click();
      const index=await page.evaluate("labels.snapshot().findIndex(c=>c.stage==='open')");await page.evaluate(`labels.finish(${index},JSON.stringify({code:'export.saved_file_unavailable',safe_detail:null,diagnostic_id:'fm-test-1'}))`);
      assert.match(await page.getByRole('dialog').getByRole('alert').innerText(),/Save it again before opening it/);assert.doesNotMatch(await page.getByRole('dialog').innerText(),/fm-test-1/);
      await save(page).click();await page.getByRole('button',{name:'Open saved file',exact:true}).waitFor();assert.equal(await page.getByRole('dialog').getByRole('alert').count(),0);assert.equal(await count(page,'export'),2);
    });
    await scenario('closing and reopening drops old success and ignores a late native error',async page=>{
      await page.evaluate("labels.render();labels.hold('open')");await ready(page);await save(page).click();await page.getByRole('button',{name:'Open saved file',exact:true}).click();
      const index=await page.evaluate("labels.snapshot().findIndex(c=>c.stage==='open')");await page.getByRole('button',{name:'Close',exact:true}).click();
      await page.evaluate('labels.render({request:1})');await ready(page);await page.evaluate(`labels.finish(${index},'native error')`);await page.waitForTimeout(30);
      assert.equal(await page.getByRole('button',{name:'Open saved file',exact:true}).count(),0);assert.equal(await page.getByRole('dialog').getByRole('alert').count(),0);
    });
  } finally {await browser.close();}
});
