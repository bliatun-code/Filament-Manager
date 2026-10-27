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

test("balanced settings preserves controls and vertical keyboard navigation without clipped content", {timeout:120_000}, async () => {
  const built=await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("production")},plugins:[tailwindcss(),react()],build:{write:false,minify:false,cssCodeSplit:false,lib:{entry:fileURLToPath(new URL("../../test-fixtures/settings_balanced_browser_entry.tsx",import.meta.url)),formats:["iife"],name:"SettingsPreview"}}});
  const output=(Array.isArray(built)?built:[built]).flatMap(r=>"output" in r?r.output:[]);
  const script=output.find(o=>o.type==="chunk"&&o.isEntry);assert.ok(script?.type==="chunk");
  const css=output.filter(o=>o.type==="asset"&&o.fileName.endsWith(".css")).map(o=>o.source).join("\n");
  const out=resolve("release-artifacts/visual-qa/settings-balanced");await mkdir(out,{recursive:true});
  const browser=await chromium.launch({args:["--disable-gpu"]});
  try {for(const locale of ["nb","en","de"]){for(const width of [1200,390]){for(const theme of ["dark","light"]){
    const context=await browser.newContext({viewport:{width,height:1100}});const page=await context.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    try {
      await page.route("http://settings-preview.local/**",r=>r.fulfill({contentType:"text/html",body:'<div id="root"></div>'}));await page.goto("http://settings-preview.local/");await page.addStyleTag({content:css});await page.addScriptTag({content:script.code});
      await page.evaluate(async args=>{const api=(window as unknown as {SettingsPreview:{mountSettingsPreview:(locale:string,theme:string)=>Promise<void>}}).SettingsPreview;await api.mountSettingsPreview(args.locale,args.theme);},{locale,theme});
      await page.locator('.settings-general-section').first().waitFor();
      const disclosure=page.locator('.settings-program-details');assert.equal(await disclosure.getAttribute('open'),null);
      assert.equal(await page.getByRole('tab').count(),6);assert.equal(await page.getByRole('checkbox').count(),3);assert.equal(await page.locator('select option').count(),21);
      const first=page.getByRole('tab').first();await first.focus();await page.keyboard.press('ArrowDown');await page.getByRole('tab').nth(1).waitFor();assert.equal(await page.getByRole('tab').nth(1).getAttribute('aria-selected'),'true');assert.ok(await page.getByRole('tab').nth(1).evaluate(el=>el===document.activeElement));
      await page.keyboard.press('Home');await page.locator('.settings-general-section').first().waitFor();
      for (const checkbox of await page.getByRole('checkbox').all()) { await checkbox.uncheck(); assert.equal(await checkbox.isChecked(),false); await checkbox.check(); }
      if(locale==='en'&&width===1200) { for (const mode of ['dark-deep','blue']) { await page.locator(`.settings-theme-choice:has(.settings-theme-preview-${mode})`).click(); assert.equal(await page.locator('html').getAttribute('data-theme'),mode); } await page.getByRole('button',{name:theme==='dark'?'Gray · Soft':'Light · Clean',exact:true}).click(); await page.getByRole('combobox').selectOption('nb'); await page.getByRole('tab',{name:'Generelt',exact:true}).waitFor(); await page.getByRole('combobox').selectOption('en'); await page.getByRole('tab',{name:'General',exact:true}).waitFor(); }
      await disclosure.locator('summary').click();assert.ok(await page.getByRole('link').count()>=3);await disclosure.locator('summary').click();
      const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('button')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2).map(el=>el.textContent)}));assert.ok(geometry.scroll<=width+2,JSON.stringify(geometry));assert.deepEqual(geometry.clipped,[]);
      // Theme and hover transitions must settle before measuring static contrast.
      await page.evaluate(async()=>{await document.fonts.ready;});
      await page.waitForFunction(()=>document.getAnimations().every(animation=>animation.playState!=="running"||!Number.isFinite(animation.effect?.getComputedTiming().endTime)));
      const a11y=await new AxeBuilder({page}).include('.settings-balanced-layout').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[],`${locale}/${width}/${theme}`);
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));});await page.screenshot({path:resolve(out,`${locale}-${width}-${theme}.png`),fullPage:true});assert.deepEqual(errors,[]);
    } finally {await context.close();}
  }}}} finally {await browser.close();}
});
