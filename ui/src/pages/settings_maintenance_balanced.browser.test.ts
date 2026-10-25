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

test("balanced maintenance keeps exports, validation, diagnostics and guarded reset confirmations", {timeout:120_000}, async () => {
  const built=await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("production")},plugins:[tailwindcss(),react()],build:{write:false,minify:false,cssCodeSplit:false,lib:{entry:fileURLToPath(new URL("../../test-fixtures/settings_maintenance_balanced_browser_entry.tsx",import.meta.url)),formats:["iife"],name:"MaintenanceSettingsPreview"}}});
  const output=(Array.isArray(built)?built:[built]).flatMap(r=>"output" in r?r.output:[]);
  const script=output.find(o=>o.type==="chunk"&&o.isEntry);assert.ok(script?.type==="chunk");
  const css=output.filter(o=>o.type==="asset"&&o.fileName.endsWith(".css")).map(o=>o.source).join("\n");
  const out=resolve("release-artifacts/visual-qa/settings-maintenance-balanced");await mkdir(out,{recursive:true});
  const browser=await chromium.launch({args:["--disable-gpu"]});
  try {for(const locale of ["nb","en","de"]){for(const width of [1200,390]){for(const theme of ["dark","light"]){
    const context=await browser.newContext({viewport:{width,height:1100}});const page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    try {
      await page.route("http://settings-preview.local/**",r=>r.fulfill({contentType:"text/html",body:'<div id="root"></div>'}));await page.goto("http://settings-preview.local/");await page.addStyleTag({content:css});await page.addScriptTag({content:script.code});
      await page.evaluate(async args=>{const api=(window as unknown as {MaintenanceSettingsPreview:{mountMaintenanceSettingsPreview:(locale:string,theme:string)=>Promise<void>}}).MaintenanceSettingsPreview;await api.mountMaintenanceSettingsPreview(args.locale,args.theme);},{locale,theme});
      await page.locator('.settings-maintenance-balanced').waitFor();
      const reset=page.locator('.settings-maintenance-reset');assert.equal(await reset.getAttribute('open'),null);
      const technical=page.locator('.settings-diagnostics-technical');assert.equal(await technical.getAttribute('open'),null);await technical.locator('summary').first().click();assert.ok(await technical.getAttribute('open')!==null);await technical.locator('summary').first().click();
      await reset.locator('summary').first().click();assert.ok(await reset.getAttribute('open')!==null);assert.equal(await reset.getByRole('button').first().isDisabled(),true);await reset.locator('summary').first().click();
      if(locale==='en'&&width===1200) {
        await page.getByRole('button',{name:'Export full backup (JSON)',exact:true}).click();assert.equal(await page.evaluate(()=>(window as unknown as {lastMaintenanceAction:string}).lastMaintenanceAction),'export-full');
        await page.getByRole('button',{name:'Validate backup file',exact:true}).click();await page.getByText('Backup validation summary',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Import backup/data file',exact:true}).isDisabled(),true);
        await page.getByRole('button',{name:'Download privacy-filtered support file',exact:true}).click();assert.equal(await page.evaluate(()=>(window as unknown as {lastMaintenanceAction:string}).lastMaintenanceAction),'support');
      }
      const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('button')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2).map(el=>el.textContent)}));assert.ok(geometry.scroll<=width+2,JSON.stringify(geometry));assert.deepEqual(geometry.clipped,[]);
      const a11y=await new AxeBuilder({page}).include('.settings-balanced-layout').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
      await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));});await page.screenshot({path:resolve(out,`${locale}-${width}-${theme}.png`),fullPage:true});assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }}}
  for(const scenario of ['host','issues','error','unpaired']) {
    const context=await browser.newContext({viewport:{width:1200,height:1100}});const page=await context.newPage();
    try {
      await page.route('http://settings-preview.local/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('http://settings-preview.local/?'+scenario+'=1');await page.addStyleTag({content:css});await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});await page.addScriptTag({content:script.code});
      await page.evaluate(async()=>{await (window as unknown as {MaintenanceSettingsPreview:{mountMaintenanceSettingsPreview:(locale:string,theme:string)=>Promise<void>}}).MaintenanceSettingsPreview.mountMaintenanceSettingsPreview('en','dark');});await page.locator('.settings-maintenance-balanced').waitFor();
      if(scenario==='host') {
        const reset=page.locator('.settings-maintenance-reset');await reset.locator('summary').first().click();await reset.getByRole('button',{name:'Repair catalog',exact:true}).click();await reset.getByRole('button',{name:'Confirm catalog repair',exact:true}).waitFor();assert.equal(await page.evaluate(()=>(window as unknown as {lastMaintenanceAction:string}).lastMaintenanceAction),'review-CATALOG');
        await reset.locator('summary').first().click();assert.ok(await reset.getAttribute('open')!==null);await reset.getByRole('button',{name:'Cancel',exact:true}).click();
        await reset.getByRole('button',{name:'Reset app data',exact:true}).click();await reset.getByRole('button',{name:'Confirm reset app data',exact:true}).waitFor();assert.equal(await page.evaluate(()=>(window as unknown as {lastMaintenanceAction:string}).lastMaintenanceAction),'review-APP');await reset.getByRole('button',{name:'Cancel',exact:true}).click();await reset.locator('summary').first().click();
        assert.equal(await page.getByRole('button',{name:'Import backup/data file',exact:true}).isEnabled(),true);
      }
      if(scenario==='issues') assert.ok(await page.locator('.settings-diagnostics-technical').getAttribute('open')!==null);
      if(scenario==='error') {await page.getByRole('alert').filter({hasText:'QA diagnostic refresh failed'}).waitFor();await page.getByText('The last successful result remains visible.',{exact:false}).waitFor();}
      if(scenario==='unpaired') assert.equal(await page.getByRole('button',{name:'Export full backup (JSON)',exact:true}).isDisabled(),true);
      const a11y=await new AxeBuilder({page}).include('.settings-balanced-layout').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
      await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(out,`en-${scenario}-dark.png`),fullPage:true});
    }finally{await context.close();}
  }
  } finally {await browser.close();}
});
