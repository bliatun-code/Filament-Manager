import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import AxeBuilder from "@axe-core/playwright";

test("balanced printers show all slots, rank manual candidates and require measured unload before writes", {timeout:240_000}, async () => {
 const built=await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("production")},plugins:[tailwindcss(),react()],build:{write:false,minify:false,cssCodeSplit:false,lib:{entry:fileURLToPath(new URL("../../test-fixtures/printers_balanced_workspace_entry.tsx",import.meta.url)),formats:["iife"],name:"PrintersPreview"}}});
 const output=(Array.isArray(built)?built:[built]).flatMap(r=>r.output);
 const script=output.find(o=>o.type==="chunk"&&o.isEntry);assert.ok(script?.type==="chunk");
 const css=output.filter(o=>o.type==="asset"&&o.fileName.endsWith(".css")).map(o=>o.source).join("\n");
 const out=resolve("release-artifacts/visual-qa/printers-balanced");await mkdir(out,{recursive:true});
 const browser=await chromium.launch();
 try {
  for(const locale of ["nb","en","de","cs-CZ","da-DK","es","fi-FI","fr","hu-HU","it-IT","ja-JP","ko-KR","nl-NL","pl-PL","pt-BR","ru-RU","sv-SE","tr-TR","uk-UA","zh-CN","zh-TW"]) for(const width of [1440,390]) for(const theme of ["dark","light"]) {
   const context=await browser.newContext({viewport:{width,height:1050}});const page=await context.newPage();page.setDefaultTimeout(8000);
   const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
   try {
    await page.route("http://printers-preview.local/**",r=>r.fulfill({contentType:"text/html",body:'<html><head><title>Printers QA</title></head><body><div id="root"></div></body></html>'}));
    await page.goto("http://printers-preview.local/");await page.addStyleTag({content:css});await page.addScriptTag({content:script.code});
    await page.evaluate(async ({locale,theme})=>{
      await (window as unknown as {PrintersPreview:{mountPrintersWorkspace:(locale:string,theme:string)=>Promise<void>}}).PrintersPreview.mountPrintersWorkspace(locale,theme);document.documentElement.lang=locale;
    },{locale,theme});
    await page.locator(".printer-slot-row").first().waitFor();
    assert.equal(await page.locator(".printer-slot-row").count(),11);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    const axe=await new AxeBuilder({page}).include("main").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
    await page.screenshot({path:resolve(out,`${locale}-${width}-${theme}.png`),fullPage:true});
    assert.deepEqual(errors,[]);
   } finally {await context.close();}
  }
  for(const mode of ["manual","replace"]) for(const client of [true,false]) {
   const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(8000);
   try {
    await page.route("http://printers-preview.local/**",r=>r.fulfill({contentType:"text/html",body:'<html><head><title>Printer workflow QA</title></head><body><div id="root"></div></body></html>'}));
    await page.goto("http://printers-preview.local/");await page.addStyleTag({content:css});await page.addScriptTag({content:script.code});
    await page.evaluate(({mode,client})=>(window as unknown as {PrintersPreview:{mountPrintersWorkspace:(locale:string,theme:string,mode:string,client:boolean)=>Promise<void>}}).PrintersPreview.mountPrintersWorkspace("en","dark",mode,client),{mode,client});
    const row=page.locator(".printer-slot-rowgroup").first();await row.locator("summary").click();
    if(mode==="manual") {
      const candidates=row.locator(".printer-candidate-list > div");assert.equal(await candidates.count(),2);
      assert.match(await candidates.first().innerText(),/824 g/);assert.match(await candidates.last().innerText(),/1,000 g/);
      await page.screenshot({path:resolve(out,`manual-candidates-${client?"client":"host"}.png`),fullPage:true});
      await candidates.first().getByRole("button",{name:"Select roll",exact:true}).click();
      assert.equal(await page.getByRole("dialog").count(),0);
      await page.waitForFunction(()=>(window as unknown as {printerWrites:unknown[]}).printerWrites.length===1);
      const writes=await page.evaluate(()=>(window as unknown as {printerWrites:{payload:{input:Record<string,unknown>}}[]}).printerWrites);
      const operation=(writes[0].payload.input.operation ?? writes[0].payload.input) as Record<string,unknown>;
      assert.equal(operation.target_spool_id,"spool_z-used");
      assert.equal(operation.incoming_measured_total_g,null);
      assert.equal(operation.outgoing_measured_total_g,null);
    } else {
      const candidate=row.locator(".printer-candidate-list > div").first();
      await candidate.getByRole("button",{name:"Select roll",exact:true}).click();
      const dialog=page.getByRole("dialog");await dialog.waitFor();
      const inputs=dialog.getByRole("spinbutton");assert.equal(await inputs.first().inputValue(),"");
      await dialog.getByRole("button",{name:"Save",exact:true}).click();
      assert.deepEqual(await page.evaluate(()=>(window as unknown as {printerWrites:unknown[]}).printerWrites),[]);
      assert.match(await dialog.getByRole("alert").innerText(),/outgoing spool weight/);
      assert.equal(await inputs.count(),1);await inputs.first().fill("950");
      await page.screenshot({path:resolve(out,`measured-replacement-${client?"client":"host"}.png`),fullPage:true});
      await dialog.getByRole("button",{name:"Save",exact:true}).click();
      await page.waitForFunction(()=>(window as unknown as {printerWrites:unknown[]}).printerWrites.length===1);
      const writes=await page.evaluate(()=>(window as unknown as {printerWrites:{command:string;payload:{input:Record<string,unknown>}}[]}).printerWrites);
      assert.equal(writes[0].command,client?"operate_library_sync_host_printer_slot":"operate_printer_slot");
      const operation=(writes[0].payload.input.operation ?? writes[0].payload.input) as Record<string,unknown>;
      assert.equal(operation.expected_current_spool_id,"spool_z-used");
      assert.equal(operation.outgoing_measured_total_g,950);
      assert.equal(operation.incoming_measured_total_g,null);
      await page.waitForFunction(()=>document.querySelectorAll('[role="dialog"]').length===0);
    }
   } finally {await page.close();}
  }
  const review=await browser.newPage({viewport:{width:1440,height:1100}});
  try {
   await review.route("http://printers-preview.local/**",r=>r.fulfill({contentType:"text/html",body:'<html lang="nb"><head><title>Printere</title></head><body><div id="root"></div></body></html>'}));
   await review.goto("http://printers-preview.local/");await review.addStyleTag({content:css});await review.addScriptTag({content:script.code});
   await review.evaluate(()=>(window as unknown as {PrintersPreview:{mountPrintersWorkspace:(locale:string,theme:string,mode:string)=>Promise<void>}}).PrintersPreview.mountPrintersWorkspace("nb","dark","manual"));
   await review.locator(".printer-slot-rowgroup").first().locator("summary").click();
   await review.locator(".printer-balanced-card").first().screenshot({path:resolve(out,"nb-kandidater-824-for-1000.png")});
  }finally{await review.close();}
 }finally{await browser.close();}
});
