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

test("balanced filament settings selects one group, preserves drafts and keeps client controls read-only", {timeout:120_000}, async () => {
  const built=await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("production")},plugins:[tailwindcss(),react()],build:{write:false,minify:false,cssCodeSplit:false,lib:{entry:fileURLToPath(new URL("../../test-fixtures/settings_filament_balanced_browser_entry.tsx",import.meta.url)),formats:["iife"],name:"FilamentSettingsPreview"}}});
  const output=(Array.isArray(built)?built:[built]).flatMap(r=>"output" in r?r.output:[]);
  const script=output.find(o=>o.type==="chunk"&&o.isEntry);assert.ok(script?.type==="chunk");
  const css=output.filter(o=>o.type==="asset"&&o.fileName.endsWith(".css")).map(o=>o.source).join("\n");
  const out=resolve("release-artifacts/visual-qa/settings-filament-balanced");await mkdir(out,{recursive:true});
  const browser=await chromium.launch({args:["--disable-gpu"]});
  try {for(const locale of ["nb","en","de"]){for(const width of [1440,390]){for(const theme of ["dark","light"]){
    const context=await browser.newContext({viewport:{width,height:1100}});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    try {
      await page.route('http://settings-preview.local/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('http://settings-preview.local/'+(locale==='en'?'?writable=true':''));await page.addStyleTag({content:css});await page.addScriptTag({content:script.code});
      await page.evaluate(async args=>{await (window as unknown as {FilamentSettingsPreview:{mountFilamentSettingsPreview:(locale:string,theme:string)=>Promise<void>}}).FilamentSettingsPreview.mountFilamentSettingsPreview(args.locale,args.theme);},{locale,theme});
      const editor=page.locator('.settings-filament-editor:visible');await editor.waitFor();assert.equal(await editor.count(),1);assert.equal(await editor.locator('details[open]').count(),0);
      const price=editor.locator('input[type=number]').first();assert.equal(await price.isDisabled(),locale!=='en');
      if(locale==='en') await price.fill('310');
      const chooseGroup=async (index:number) => { const select=page.locator('.settings-filament-group-select select');if(await select.isVisible()) await select.selectOption({index});else await page.locator('.settings-filament-group').nth(index).click(); };
      await chooseGroup(1);assert.equal(await editor.count(),1);
      await chooseGroup(0);if(locale==='en') assert.equal(await price.inputValue(),'310');
      await page.locator('.settings-filament-vendor').nth(1).click();assert.ok((await editor.innerText()).includes('PLA+HS'));await page.locator('.settings-filament-vendor').first().click();
      await page.locator('.settings-filament-sections button').nth(1).click();await page.locator('#settings-filament-default-currency').waitFor();
      if(locale==='nb'&&width===1440&&theme==='dark') await page.screenshot({path:resolve(out,'nb-currency-dark.png'),fullPage:true});
      await page.locator('.settings-filament-sections button').nth(2).click();assert.equal(await page.locator('.settings-filament-editor:visible').count(),0);
      if(locale==='nb'&&width===1440&&theme==='dark') await page.screenshot({path:resolve(out,'nb-low-stock-dark.png'),fullPage:true});
      await page.locator('.settings-filament-sections button').first().click();await editor.waitFor();
      const geometry=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('button')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2).map(el=>el.textContent)}));assert.ok(geometry.scroll<=width+2,JSON.stringify(geometry));assert.deepEqual(geometry.clipped,[]);
      const a11y=await new AxeBuilder({page}).include('.settings-balanced-layout').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
      await chooseGroup(1);
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));});await page.screenshot({path:resolve(out,`${locale}-${width}-${theme}.png`),fullPage:true});assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }}}}finally{await browser.close();}
});
