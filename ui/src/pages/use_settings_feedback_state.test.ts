import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

test("Settings success feedback expires without clearing errors or newer messages", async context => {
  const require=createRequire(new URL('../../package.json',import.meta.url));
  const {build}=await import(pathToFileURL(require.resolve('vite')).href);
  const entry=fileURLToPath(new URL('./__feedback_virtual__.js',import.meta.url));
  const source=`
    import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {useSettingsFeedbackState} from './use_settings_feedback_state';import {SettingsFeedbackStack} from './settings_feedback_stack';
    let state;function Harness(){state=useSettingsFeedbackState();return React.createElement(SettingsFeedbackStack,{tauri:true,desktopOnlyMessage:'Desktop only',error:state.error,info:state.info});}
    const root=createRoot(document.getElementById('root'));window.feedback={mount:()=>flushSync(()=>root.render(React.createElement(Harness))),
      info:message=>flushSync(()=>state.setInfo(message)),error:message=>flushSync(()=>state.setError(message)),busy:value=>flushSync(()=>state.setBusy(value)),
      unmount:()=>flushSync(()=>root.render(null))};feedback.mount();
  `;
  const result=await build({root:fileURLToPath(new URL('../../',import.meta.url)),configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},
    plugins:[{name:'feedback',resolveId:(id:string)=>id===entry?entry:null,load:(id:string)=>id===entry?source:null}],
    build:{write:false,minify:false,lib:{entry,formats:['iife'],name:'Feedback'}}});
  const script=(Array.isArray(result)?result:[result]).flatMap(value=>value.output).find(value=>value.type==='chunk'&&value.isEntry)?.code;
  assert.ok(script);
  const browser=await chromium.launch({headless:true});
  const scenario=async(name:string,run:(page:Awaited<ReturnType<typeof browser.newPage>>)=>Promise<void>)=>context.test(name,async()=>{
    const page=await browser.newPage();await page.clock.install({time:new Date('2026-09-16T10:00:00Z')});await page.clock.pauseAt(new Date('2026-09-16T10:00:01Z'));page.setDefaultTimeout(5000);
    try{await page.setContent(`<html><body><div id="root"></div><script>${script.replaceAll('</script','<\\/script')}</script></body></html>`);await run(page);}finally{await page.close();}
  });
  try {
    await scenario('Client import notification disappears after 20 seconds; errors remain',async page=>{
      await page.evaluate("feedback.info('eSUN ABS: Imported 45');feedback.error('Connection lost')");
      await page.clock.runFor(19_999);assert.equal(await page.getByText('eSUN ABS: Imported 45',{exact:true}).count(),1);
      await page.clock.runFor(1);await page.waitForFunction("!document.getElementById('root').textContent.includes('eSUN ABS: Imported 45')");
      assert.equal(await page.getByText('Connection lost',{exact:true}).count(),1);
    });
    await scenario('replacement message receives a full expiry period',async page=>{
      await page.evaluate("feedback.info('First import')");await page.clock.runFor(10_000);await page.evaluate("feedback.info('Second import')");
      await page.clock.runFor(10_000);assert.equal(await page.getByText('Second import',{exact:true}).count(),1);
      await page.clock.runFor(10_000);await page.waitForFunction("!document.getElementById('root').textContent.includes('Second import')");
    });
    await scenario('unrelated settings rerenders do not extend the notification',async page=>{
      await page.evaluate("feedback.info('Completed')");await page.clock.runFor(10_000);await page.evaluate('feedback.busy(true)');
      await page.clock.runFor(10_000);await page.waitForFunction("!document.getElementById('root').textContent.includes('Completed')");
    });
    await scenario('clearing and unmounting cancel the old notification timer',async page=>{
      await page.evaluate("feedback.info('Old')");await page.clock.runFor(10_000);await page.evaluate("feedback.info(null);feedback.unmount();feedback.mount();feedback.info('New')");
      await page.clock.runFor(10_000);assert.equal(await page.getByText('New',{exact:true}).count(),1);
      await page.clock.runFor(10_000);await page.waitForFunction("!document.getElementById('root').textContent.includes('New')");
    });
  } finally {await browser.close();}
});
