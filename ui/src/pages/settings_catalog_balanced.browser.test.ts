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

test("balanced catalog settings retains discovery, refresh, progress, log and swatch confirmation", {timeout:120_000}, async () => {
  const built=await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("production")},plugins:[tailwindcss(),react()],build:{write:false,minify:false,cssCodeSplit:false,lib:{entry:fileURLToPath(new URL("../../test-fixtures/settings_catalog_balanced_browser_entry.tsx",import.meta.url)),formats:["iife"],name:"CatalogSettingsPreview"}}});
  const output=(Array.isArray(built)?built:[built]).flatMap(r=>"output" in r?r.output:[]);
  const script=output.find(o=>o.type==="chunk"&&o.isEntry);assert.ok(script?.type==="chunk");
  const css=output.filter(o=>o.type==="asset"&&o.fileName.endsWith(".css")).map(o=>o.source).join("\n");
  const out=resolve("release-artifacts/visual-qa/settings-catalog-balanced");await mkdir(out,{recursive:true});
  const browser=await chromium.launch({args:["--disable-gpu"]});
  try {for(const locale of ["nb","en","de"]){for(const width of [1200,390]){for(const theme of ["dark","light"]){
    const context=await browser.newContext({viewport:{width,height:1100}});const page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    try {
      await page.route("http://settings-preview.local/**",r=>r.fulfill({contentType:"text/html",body:'<div id="root"></div>'}));await page.goto("http://settings-preview.local/?missing=1");await page.addStyleTag({content:css});await page.addScriptTag({content:script.code});
      await page.evaluate(async args=>{const api=(window as unknown as {CatalogSettingsPreview:{mountCatalogSettingsPreview:(locale:string,theme:string)=>Promise<void>}}).CatalogSettingsPreview;await api.mountCatalogSettingsPreview(args.locale,args.theme);},{locale,theme});
      const sectionButtons=page.locator('.settings-catalog-sections button');await sectionButtons.first().waitFor();
      const refresh=page.locator('.settings-catalog-refresh');await refresh.getByRole('button',{name:'PLA',exact:true}).click();
      await refresh.getByRole('button',{name:'eSUN',exact:true}).click();assert.equal(await refresh.getByRole('button',{name:'eSUN',exact:true}).getAttribute('aria-pressed'),'true');await refresh.getByRole('button',{name:'Bambu',exact:true}).click();await refresh.getByRole('button',{name:'PLA',exact:true}).click();
      const log=refresh.locator('button[aria-controls="settings-catalog-refresh-log"]');await log.click();await page.locator('#settings-catalog-refresh-log').waitFor();await log.click();
      await sectionButtons.nth(1).click();const swatches=page.locator('.settings-catalog-swatches');await swatches.waitFor();
      const search=swatches.locator('input[type=search]');await search.fill('no matches');await swatches.locator('input[type=text]').waitFor({state:'hidden'});assert.equal(await swatches.locator('input[type=text]').count(),0);await search.fill('white');assert.equal(await swatches.locator('input[type=text]').count(),1);await search.fill('');
      const value=swatches.locator('input[type=text]').first();await value.fill('#12');assert.equal(await value.getAttribute('aria-invalid'),'true');await value.fill('#FFFFFF');assert.equal(await value.getAttribute('aria-invalid'),'false');
      if(locale==='en'&&width===1200) {
        await swatches.getByRole('button',{name:'Auto-fill visible missing swatches',exact:true}).click();await swatches.getByRole('button',{name:'Confirm auto-fill',exact:true}).waitFor();await sectionButtons.first().click();await sectionButtons.nth(1).click();await swatches.getByRole('button',{name:'Confirm auto-fill',exact:true}).waitFor();await swatches.getByRole('button',{name:'Cancel',exact:true}).click();
        await sectionButtons.first().click();await refresh.getByRole('button',{name:'Discover available materials',exact:true}).click();assert.equal(await page.evaluate(()=>(window as unknown as {lastCatalogAction:string}).lastCatalogAction),'audit');await sectionButtons.nth(1).click();assert.equal(await swatches.getByRole('button',{name:'Refresh',exact:true}).isDisabled(),true);assert.ok(await page.getByRole('status').count()>0);await page.evaluate(()=>(window as unknown as {completeCatalogJob:()=>void}).completeCatalogJob());await page.getByRole('status').filter({hasText:'Completed'}).waitFor();assert.equal(await page.locator('[role=status] time').count(),1);
        await sectionButtons.first().click();await refresh.getByRole('button',{name:'Refresh PLA',exact:true}).click();assert.equal(await page.evaluate(()=>(window as unknown as {lastCatalogAction:string}).lastCatalogAction),'refresh');await page.evaluate(()=>(window as unknown as {failCatalogJob:()=>void}).failCatalogJob());await sectionButtons.nth(1).click();await page.getByRole('status').filter({hasText:'not completed'}).waitFor();await page.evaluate(()=>(window as unknown as {completeCatalogJob:()=>void}).completeCatalogJob());await page.getByRole('status').filter({hasText:'not completed'}).waitFor({state:'hidden'});
      }
      await sectionButtons.first().click();
      const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('button')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2).map(el=>el.textContent)}));assert.ok(geometry.scroll<=width+2,JSON.stringify(geometry));assert.deepEqual(geometry.clipped,[]);
      const a11y=await new AxeBuilder({page}).include('.settings-balanced-layout').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
      await page.evaluate(async()=>{scrollTo(0,0);await document.fonts.ready;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));});await page.screenshot({path:resolve(out,`${locale}-${width}-${theme}.png`),fullPage:true});await sectionButtons.nth(1).click();const swatchGeometry=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(swatchGeometry<=width+2);const swatchA11y=await new AxeBuilder({page}).include('.settings-balanced-layout').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(swatchA11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);await page.screenshot({path:resolve(out,`${locale}-${width}-${theme}-swatches.png`),fullPage:true});assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }}}} finally {await browser.close();}
});
