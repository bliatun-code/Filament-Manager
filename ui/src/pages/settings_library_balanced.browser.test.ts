import assert from "node:assert/strict";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {chromium} from "playwright";
import {build} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import AxeBuilder from "@axe-core/playwright";

test("balanced library settings keeps pairing, version checks and guided role actions available", {timeout:120_000}, async () => {
  const built=await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("production")},plugins:[tailwindcss(),react()],build:{write:false,minify:false,cssCodeSplit:false,lib:{entry:fileURLToPath(new URL("../../test-fixtures/settings_library_balanced_browser_entry.tsx",import.meta.url)),formats:["iife"],name:"LibrarySettingsPreview"}}});
  const output=(Array.isArray(built)?built:[built]).flatMap(r=>"output" in r?r.output:[]);
  const script=output.find(o=>o.type==="chunk"&&o.isEntry);assert.ok(script?.type==="chunk");
  const css=output.filter(o=>o.type==="asset"&&o.fileName.endsWith(".css")).map(o=>o.source).join("\n");
  const out=resolve("release-artifacts/visual-qa/settings-library-balanced");await mkdir(out,{recursive:true});
  const browser=await chromium.launch({args:["--disable-gpu"]});
  try {for(const locale of ["nb","en","de"]){for(const width of [1200,390]){for(const theme of ["dark","light"]){
    const context=await browser.newContext({viewport:{width,height:1100}});const page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    try {
      await page.route("http://settings-preview.local/**",r=>r.fulfill({contentType:"text/html",body:'<div id="root"></div>'}));await page.goto("http://settings-preview.local/");await page.addStyleTag({content:css});await page.addScriptTag({content:script.code});
      await page.evaluate(async args=>{const api=(window as unknown as {LibrarySettingsPreview:{mountLibrarySettingsPreview:(locale:string,theme:string)=>Promise<void>}}).LibrarySettingsPreview;await api.mountLibrarySettingsPreview(args.locale,args.theme);},{locale,theme});
      await page.locator('.settings-library-balanced').waitFor();
      const role=page.locator('.settings-library-role-editor');assert.equal(await role.getAttribute('open'),null);
      await role.locator('summary').click();await role.getByRole('button').nth(1).click();assert.equal(await page.evaluate(()=> (window as unknown as {lastLibraryAction:string}).lastLibraryAction),'role:HOST');await role.locator('summary').click();
      const advanced=page.locator('.settings-library-advanced button[aria-expanded]');assert.equal(await advanced.getAttribute('aria-expanded'),'false');await advanced.click();assert.equal(await advanced.getAttribute('aria-expanded'),'true');await advanced.click();
      await page.locator('.settings-library-versions button').first().click();assert.equal(await page.evaluate(()=> (window as unknown as {lastLibraryAction:string}).lastLibraryAction),'refresh');
      const input=page.locator('.settings-library-connection input').first();await input.fill('Renamed QA Client');await page.locator('.settings-library-connection').getByRole('button').first().click();assert.equal(await page.evaluate(()=> (window as unknown as {lastLibraryAction:string}).lastLibraryAction),'save-name');await input.fill('QA Client');await page.locator('.settings-library-connection').getByRole('button').first().click();
      const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('button')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2).map(el=>el.textContent)}));assert.ok(geometry.scroll<=width+2,JSON.stringify(geometry));assert.deepEqual(geometry.clipped,[]);
      const a11y=await new AxeBuilder({page}).include('.settings-balanced-layout').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
      await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));});await page.screenshot({path:resolve(out,`${locale}-${width}-${theme}.png`),fullPage:true});assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }}}
  for (const scenario of ['unpaired','offline','HOST','STANDALONE']) {
    const context=await browser.newContext({viewport:{width:1200,height:1100}});const page=await context.newPage();
    try {
      await page.route('http://settings-preview.local/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('http://settings-preview.local/?'+(['HOST','STANDALONE'].includes(scenario)?'mode='+scenario:scenario+'=1'));await page.addStyleTag({content:css});await page.addScriptTag({content:script.code});
      await page.evaluate(async()=>{await (window as unknown as {LibrarySettingsPreview:{mountLibrarySettingsPreview:(locale:string,theme:string)=>Promise<void>}}).LibrarySettingsPreview.mountLibrarySettingsPreview('en','dark');});await page.locator('.settings-library-balanced').waitFor();
      if(scenario==='unpaired') { const input=page.locator('input[placeholder*="pairing="]');await input.fill('invalid');await page.getByRole('button',{name:'Pair desktop client',exact:true}).click();await page.getByRole('alert').waitFor();await page.waitForFunction(()=>document.activeElement===document.querySelector('input[placeholder*="pairing="]'));await input.fill('http://qa-host.local:4278/companion?pairing=demo');await page.getByRole('button',{name:'Pair desktop client',exact:true}).click();assert.equal(await page.evaluate(()=> (window as unknown as {lastLibraryAction:string}).lastLibraryAction),'pair'); }
      if(scenario==='offline') {await page.locator('.settings-library-connection').getByText(/^Host is unavailable\./).waitFor();assert.equal(await page.getByText('Paired',{exact:true}).count(),1);}
      if(scenario==='HOST') {await page.getByRole('button',{name:'Network details',exact:true}).click();await page.locator('#trusted-lan-network-details').waitFor();}
      if(scenario==='STANDALONE') {const toggle=page.getByRole('switch');await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'false');}
      const a11y=await new AxeBuilder({page}).include('.settings-balanced-layout').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
      await page.screenshot({path:resolve(out,`en-${scenario}-dark.png`),fullPage:true});
    } finally {await context.close();}
  }
  } finally {await browser.close();}
});
