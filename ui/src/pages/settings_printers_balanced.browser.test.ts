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

test("balanced printer settings preserves edit, delete confirmation, observed details and capture controls", {timeout:120_000}, async () => {
  const built=await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("production")},plugins:[tailwindcss(),react()],build:{write:false,minify:false,cssCodeSplit:false,lib:{entry:fileURLToPath(new URL("../../test-fixtures/settings_printers_balanced_browser_entry.tsx",import.meta.url)),formats:["iife"],name:"PrintersSettingsPreview"}}});
  const output=(Array.isArray(built)?built:[built]).flatMap(r=>"output" in r?r.output:[]);
  const script=output.find(o=>o.type==="chunk"&&o.isEntry);assert.ok(script?.type==="chunk");
  const css=output.filter(o=>o.type==="asset"&&o.fileName.endsWith(".css")).map(o=>o.source).join("\n");
  const out=resolve("release-artifacts/visual-qa/settings-printers-balanced");await mkdir(out,{recursive:true});
  const browser=await chromium.launch({args:["--disable-gpu"]});
  try {for(const locale of ["nb","en","de"]){for(const width of [1200,390]){for(const theme of ["dark","light"]){
    const context=await browser.newContext({viewport:{width,height:1100}});const page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    try {
      await page.route("http://settings-preview.local/**",r=>r.fulfill({contentType:"text/html",body:'<div id="root"></div>'}));await page.goto("http://settings-preview.local/");await page.addStyleTag({content:css});await page.addStyleTag({content:'*,*::before,*::after {transition:none!important;animation:none!important}'});await page.addScriptTag({content:script.code});
      await page.evaluate(async args=>{const api=(window as unknown as {PrintersSettingsPreview:{mountPrintersSettingsPreview:(locale:string,theme:string)=>Promise<void>}}).PrintersSettingsPreview;await api.mountPrintersSettingsPreview(args.locale,args.theme);},{locale,theme});
      const cards=page.locator('.settings-printer-balanced-card');await cards.first().waitFor();assert.equal(await cards.count(),2);
      assert.equal(await cards.nth(1).getByRole('button').count(),2);
      const toggle=cards.first().locator('[aria-expanded]');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      const technical=page.locator('.settings-printer-technical');assert.equal(await technical.getAttribute('open'),null);await technical.locator('summary').click();assert.ok(await technical.getAttribute('open')!==null);await technical.locator('summary').click();
      const capture=cards.first().locator('.settings-printer-observed-panel button').first();const initialCaptureLabel=await capture.textContent();await capture.click();assert.notEqual(await capture.textContent(),initialCaptureLabel);assert.ok(await cards.first().getByRole('status').count()>0);await capture.click();assert.equal(await capture.textContent(),initialCaptureLabel);
      if(locale==='en'&&width===1200) {
        await cards.nth(1).getByRole('button',{name:'Remove',exact:true}).click();assert.equal(await page.evaluate(()=>(window as unknown as {lastPrinterAction:string}).lastPrinterAction),'remove-request');await cards.nth(1).getByRole('button',{name:'Confirm remove',exact:true}).waitFor();
        await cards.first().getByRole('button',{name:'Reconfigure',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
      }
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('button')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2).map(el=>el.textContent)}));assert.ok(geometry.scroll<=width+2,JSON.stringify(geometry));assert.deepEqual(geometry.clipped,[]);
      const a11y=await new AxeBuilder({page}).include('.settings-balanced-layout').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary,html:n.html}))})),[]);
      await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));});await page.screenshot({path:resolve(out,`${locale}-${width}-${theme}.png`),fullPage:true});assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }}}} finally {await browser.close();}
});
