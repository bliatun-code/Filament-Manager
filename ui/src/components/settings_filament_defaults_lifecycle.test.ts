import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium, type Page } from "playwright";

test("rendered filament standards saves retain their library and operation", async context => {
  const require = createRequire(new URL('../../package.json', import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);
  const entry = fileURLToPath(new URL('./__standards_virtual__.js', import.meta.url));
  const source = `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {SettingsFilamentDefaultsRoute} from '../pages/settings_filament_defaults_route';
    import {useSettingsLowStockSave} from '../pages/use_settings_low_stock_save';
    import {lookup} from '../lib/i18n';
    import {enDictionary} from '../lib/i18n_locales/locales/en';
    import {formatMessage} from '../../../src-tauri/companion_browser/message_format.js';
    const t=(key,fallback,params={})=>formatMessage(lookup(enDictionary,key)??fallback,params,'en');
    const row={spoolId:'s1',masterId:'m1',groupKey:'pla',vendor:'Bambu',material:'PLA',filamentName:'PLA Basic',colorName:'Blue',nominalWeightG:1000,purchasePrice:null,purchaseCurrency:null,purchasePriceSource:null,batchPriceLocked:false,ownershipType:'OWNED',status:'IN_STOCK'};
    let input={scope:'a',readOnly:false,rows:[row]}, calls=[], pending=[], receipt=null, mounted=true, lowSave, lowFeedback=[];
    let lowSettings={mode:'STANDALONE', low_stock_policy:{schema_version:1,default_threshold_g:200,material_overrides:[]}};
    window.__TAURI__={invoke:(command,payload)=>defer('threshold',payload)};
    function defer(kind,payload,onCommitted){calls.push({kind,payload});return new Promise((resolve,reject)=>pending.push({kind,resolve,reject,onCommitted}));}
    function Harness(){
      const [busy,setBusy]=React.useState(false);
      lowSave=useSettingsLowStockSave({scopeKey:input.scope,settings:input.readOnly?{...lowSettings,mode:'CLIENT'}:lowSettings,tauri:true,busy,setBusy,
        onSaved:s=>{lowSettings=s;lowFeedback.push('saved')},onSuccess:()=>lowFeedback.push('success'),onError:()=>lowFeedback.push('error'),clearFeedback:()=>{}});
      return React.createElement(SettingsFilamentDefaultsRoute,{tab:{mutationScopeKey:input.scope,busy,readOnly:input.readOnly,
        hostUnsupported:false,hostTargetMissing:false,loadFailed:false,locale:'en',t,defaultCurrency:'NOK',persistedGroupPrices:[{groupKey:'pla',price:199,currency:'NOK'}],spoolRows:input.rows,
        batchReceipt:receipt,onBatchReceiptChange:r=>{receipt=r;render()},onReload:()=>{},onOpenSpoolDetail:()=>{},
        onSaveDefaultCurrency:currency=>defer('currency',currency),onSaveGroupPrice:value=>defer('group',value),onApplyBatch:(value,onCommitted)=>defer('batch',value,onCommitted),
        lowStock:{busy,policy:lowSettings.low_stock_policy,policyValid:true,readOnly:input.readOnly,materialOptions:['PLA'],onSave:lowSave}}});
    }
    const root=createRoot(document.getElementById('root'));
    function render(){flushSync(()=>root.render(mounted?React.createElement(Harness):null))}
    window.standards={change:patch=>{input={...input,...patch};render()},unmount:()=>{mounted=false;render()},mount:()=>{mounted=true;render()},calls:()=>calls,receipt:()=>receipt,lowFeedback:()=>lowFeedback,
      lowHandler:()=>lowSave,
      result:()=>({batchId:'batch-1',scopeKey:input.scope,groupKey:'pla',mode:'OVERWRITE',price:199,currency:'NOK',committed:true,updated:[{spoolId:'s1',spoolLabel:'Blue'}],skipped:[]}),
      commit:()=>{const p=pending.find(p=>p.kind==='batch');p.onCommitted?.(standards.result())},
      resolve:()=>{const p=pending.shift();p.resolve(p.kind==='batch'?standards.result():p.kind==='threshold'?lowSettings:undefined)},
      reject:()=>pending.shift().reject(new Error('Synthetic save failure')),
      changeRows:()=>{input={...input,rows:[{...row,purchasePrice:99,purchaseCurrency:'NOK'}]};render()}};
    render();
  `;
  const built = await build({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, logLevel: 'error',
    define: {'process.env.NODE_ENV': JSON.stringify('production')},
    plugins:[{name:'standards-lifecycle',resolveId:(id:string)=>id===entry?entry:null,load:(id:string)=>id===entry?source:null}],
    build:{write:false,minify:false,lib:{entry,formats:['iife'],name:'Standards'}} });
  const script=(Array.isArray(built)?built:[built]).flatMap(value=>value.output).find(value=>value.type==='chunk'&&value.isEntry)?.code;
  assert.ok(script);
  const browser=await chromium.launch({headless:true});
  const scenario=async(name:string,run:(page:Page)=>Promise<void>)=>context.test(name,async()=>{
    const page=await browser.newPage();page.setDefaultTimeout(5000);
    try {
      await page.clock.install({time:new Date('2026-09-19T12:00:00Z')});await page.clock.pauseAt(new Date('2026-09-19T12:00:01Z'));
      await page.setContent(`<html><body><div id="root"></div><script>${script.replaceAll('</script','<\\/script')}</script></body></html>`);
      await page.locator('details').evaluateAll(elements=>elements.forEach(element=>element.setAttribute('open','')));
      await run(page);
    } finally {await page.close();}
  });
  const clickTwice=async(page:Page,name:string)=>page.getByRole('button',{name,exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
  const count=async(page:Page)=>page.evaluate('standards.calls().length');
  try {
    for(const [kind,label] of [['currency','Save default currency'],['group','Save group default']] as const){
      await scenario(`${kind} save blocks repeats, shows success, expires and permits retry`,async page=>{
        await clickTwice(page,label);assert.equal(await count(page),1);
        assert.equal(await page.getByRole('button',{name:/^(Save|Saving) thresholds/}).isDisabled(),true);
        await page.evaluate('standards.reject()');await page.getByText(kind==='currency'?'Could not save the default currency.':'Could not save the filament group price.',{exact:true}).waitFor();
        await page.getByRole('button',{name:label,exact:true}).click();assert.equal(await count(page),2);
        await page.evaluate('standards.resolve()');await page.getByRole('status').filter({hasText:'Saved'}).waitFor();
        await page.clock.runFor(20_000);await page.waitForFunction("!document.querySelector('[role=status]')");
      });
      await scenario(`${kind} completion cannot affect a replacement view`,async page=>{
        await page.getByRole('button',{name:label,exact:true}).click();
        await page.evaluate("standards.change({scope:'b'})");
        await page.locator('details').evaluateAll(elements=>elements.forEach(element=>element.setAttribute('open','')));
        await page.getByRole('button',{name:label,exact:true}).click();
        await page.evaluate('standards.resolve()');
        assert.equal(await page.getByRole('status').count(),0);
        assert.equal(await page.getByRole('button',{name:label,exact:true}).isDisabled(),true);
        await page.evaluate('standards.resolve()');await page.getByRole('status').waitFor();
      });
    }
    await scenario('threshold write blocks synchronous calls and rejects old callbacks after a target change',async page=>{
      await page.evaluate("window.oldSave=standards.lowHandler();window.a=oldSave({default_threshold_g:300,material_overrides:[]});window.b=oldSave({default_threshold_g:400,material_overrides:[]})");
      assert.equal(await count(page),1);
      await page.evaluate("standards.change({scope:'b'});oldSave({default_threshold_g:500,material_overrides:[]})");
      assert.equal(await count(page),1);
      await page.getByRole('button',{name:'Save thresholds',exact:true}).click();
      assert.equal(await count(page),2);
      await page.evaluate('standards.resolve()');
      assert.deepEqual(await page.evaluate('standards.lowFeedback()'),[]);
      assert.equal(await page.getByRole('button',{name:/^Saving thresholds/}).isDisabled(),true);
      await page.evaluate('standards.resolve()');
      await page.waitForFunction("standards.lowFeedback().includes('success')");
    });
    await scenario('threshold rejection allows retry; a late unmounted result emits no feedback',async page=>{
      await page.getByRole('button',{name:'Save thresholds',exact:true}).click();await page.evaluate('standards.reject()');
      await page.waitForFunction("standards.lowFeedback().includes('error')");
      await page.getByRole('button',{name:'Save thresholds',exact:true}).click();
      await page.evaluate('standards.unmount();standards.resolve()');
      assert.deepEqual(await page.evaluate('standards.lowFeedback()'),['error']);
    });
    await scenario('batch confirmation sends once and displays receipt before refresh completes',async page=>{
      await page.locator('input[type=radio][value=OVERWRITE]').check();
      await page.getByRole('button',{name:'Review and confirm overwrite',exact:true}).click();
      await clickTwice(page,'Confirm price update for 1 spool');assert.equal(await count(page),1);
      await page.evaluate('standards.commit()');await page.waitForFunction('standards.receipt()?.committed');
      await page.getByRole('dialog').waitFor({state:'hidden'});
      assert.equal(await page.getByRole('button',{name:'Dismiss receipt',exact:true}).count(),1);
      assert.equal(await page.getByRole('button',{name:'Save default currency',exact:true}).isDisabled(),true);
      await page.evaluate('standards.resolve()');
      await page.waitForFunction("!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save default currency').disabled");
      await page.evaluate("standards.change({scope:'b',readOnly:true})");
      assert.equal(await page.getByRole('button',{name:'Dismiss receipt',exact:true}).count(),0,'old receipt should not appear under another library');
    });
    await scenario('changed spool data invalidates an open overwrite review without submitting',async page=>{
      await page.locator('input[type=radio][value=OVERWRITE]').check();
      await page.getByRole('button',{name:'Review and confirm overwrite',exact:true}).click();
      await page.evaluate('standards.changeRows()');
      await page.getByRole('button',{name:'Confirm price update for 1 spool',exact:true}).click();
      assert.equal(await count(page),0);
      await page.getByRole('dialog').getByText('The selected rolls changed. Review the filament price group again.',{exact:true}).waitFor();
    });
    await scenario('Client view cannot invoke local threshold writes',async page=>{
      await page.evaluate("standards.change({scope:'client',readOnly:true});standards.lowHandler()({default_threshold_g:300,material_overrides:[]})");
      assert.equal(await count(page),0);
      assert.equal(await page.getByRole('button',{name:'Save default currency',exact:true}).isDisabled(),true);
      assert.equal(await page.getByRole('button',{name:/^(Save|Saving) thresholds/}).isDisabled(),true);
    });
  } finally {await browser.close();}
});
