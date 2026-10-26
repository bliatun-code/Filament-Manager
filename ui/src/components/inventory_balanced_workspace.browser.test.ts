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

// The complete 21-locale screenshot/axe matrix needs headroom on shared CI runners.
// Individual interactions still fail within the eight-second page timeout below.
test("balanced inventory preserves per-roll weights, filtering, selection and confirmed loan returns", {timeout:600_000}, async testContext => {
 const built=await build({root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("production")},plugins:[tailwindcss(),react()],build:{write:false,minify:false,cssCodeSplit:false,lib:{entry:fileURLToPath(new URL("../../test-fixtures/inventory_balanced_workspace_entry.tsx",import.meta.url)),formats:["iife"],name:"InventoryPreview"}}});
 const output=(Array.isArray(built)?built:[built]).flatMap(r=>r.output);
 const script=output.find(o=>o.type==="chunk"&&o.isEntry);assert.ok(script?.type==="chunk");
 const css=output.filter(o=>o.type==="asset"&&o.fileName.endsWith(".css")).map(o=>o.source).join("\n");
 const out=resolve("release-artifacts/visual-qa/inventory-balanced");await mkdir(out,{recursive:true});
 const browser=await chromium.launch();
 try {
  for(const locale of ["nb","en","de","cs-CZ","da-DK","es","fi-FI","fr","hu-HU","it-IT","ja-JP","ko-KR","nl-NL","pl-PL","pt-BR","ru-RU","sv-SE","tr-TR","uk-UA","zh-CN","zh-TW"]) for(const width of [1440,390]) for(const theme of ["dark","light"]) {
   const context=await browser.newContext({viewport:{width,height:1050}});const page=await context.newPage();page.setDefaultTimeout(8000);
   const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
   try {
    await page.route("http://inventory-preview.local/**",r=>r.fulfill({contentType:"text/html",body:'<html><head><title>Inventory QA</title></head><body><div id="root"></div></body></html>'}));
    await page.goto("http://inventory-preview.local/");await page.addStyleTag({content:css});await page.addScriptTag({content:script.code});
    await page.evaluate(async ({locale,theme})=>{
     await (window as unknown as {InventoryPreview:{mountInventoryWorkspacePreview:(locale:string,theme:string)=>Promise<void>}}).InventoryPreview.mountInventoryWorkspacePreview(locale,theme);document.documentElement.lang=locale;
    },{locale,theme});
    const cards=page.locator(".inventory-product-card");await cards.first().waitFor();assert.equal(await cards.count(),10);
    const grams=(value:number)=>new Intl.NumberFormat(locale,{style:"unit",unit:"gram",unitDisplay:"short",maximumFractionDigits:1}).format(value);
    const black=cards.filter({has:page.getByRole("heading",{name:"ABS Black (40101)",exact:true})});
    assert.equal(await black.locator(".inventory-roll-row").count(),2);
    assert.deepEqual(await black.locator(".inventory-roll-weight").allTextContents(),[grams(1000),grams(1000)]);
    const petg=cards.filter({has:page.getByRole("heading",{name:"PETG Basic · Black (65103)",exact:true})});
    assert.deepEqual(await petg.locator(".inventory-roll-weight").allTextContents(),[grams(240),grams(70)]);
    const backgrounds=await cards.evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundImage));assert.ok(backgrounds.every(v=>v==="none"));
    const ids=await page.locator("svg[data-filament-spool] [id]").evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length);
    assert.equal(await page.locator("svg[data-filament-spool]").count(),10);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    const axe=await new AxeBuilder({page}).include("main").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
    await page.screenshot({path:resolve(out,`${locale}-${width}-${theme}-lager.png`),fullPage:true});
    if(locale==="en"&&width===1440&&theme==="dark") {
     await page.getByRole("searchbox").fill("Tangerine");await page.waitForFunction(()=>document.querySelectorAll(".inventory-product-card").length===1);assert.equal(await cards.count(),1);await page.getByRole("searchbox").fill("");await page.waitForFunction(()=>document.querySelectorAll(".inventory-product-card").length===10);assert.equal(await cards.count(),10);
     await page.getByRole("button",{name:"Loaned out",exact:true}).click();assert.equal(await cards.count(),1);assert.match(await cards.innerText(),/Håkon/);
     await page.getByRole("button",{name:"All",exact:true}).click();
     await page.getByRole("button",{name:"Select multiple",exact:true}).click();assert.equal(await page.getByRole("checkbox").count(),12);
     await page.getByRole("checkbox",{name:"Select #a44954",exact:true}).check();await page.waitForFunction(()=>document.querySelector("output")?.getAttribute("data-selection")==="1");
     await page.getByRole("button",{name:"Done selecting",exact:true}).click();
     await page.getByRole("button",{name:"List view",exact:true}).click();assert.equal(await page.locator(".inventory-list-row").count(),12);
     await page.screenshot({path:resolve(out,"en-1440-dark-liste.png"),fullPage:true});
     await page.getByRole("button",{name:"Card view",exact:true}).click();
     const menu=black.locator(".inventory-product-menu");await menu.locator("summary").click();await menu.getByRole("button").first().click();await page.waitForFunction(()=>document.querySelector("output")?.getAttribute("data-selected-roll")==="spool_a44954");
    }
    await page.locator("#inventory-loans-tab").click();await page.locator(".inventory-loan-table").waitFor();
    assert.equal(await page.locator(".inventory-loan-table tbody tr").count(),5);
    assert.equal(await page.locator("#inventory-loans-tab").getAttribute("aria-pressed"),"true");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    const loanAxe=await new AxeBuilder({page}).include("main").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();assert.deepEqual(loanAxe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
    await page.screenshot({path:resolve(out,`${locale}-${width}-${theme}-utlan.png`),fullPage:true});
    if(locale==="en"&&width===1440&&theme==="dark") {
     await page.getByRole("button",{name:/^Return ·.*Cyan/}).click();const dialog=page.getByRole("dialog");await dialog.waitFor();
     assert.equal(await page.evaluate(()=>(window as unknown as {returnConfirmed?:boolean}).returnConfirmed),undefined);
     await dialog.getByRole("spinbutton").fill("1000");assert.match(await dialog.innerText(),/750 g/);assert.match(await dialog.innerText(),/250 g/);
     await page.screenshot({path:resolve(out,"en-return-confirmation.png"),fullPage:true});await dialog.getByRole("button",{name:"Close",exact:true}).first().click();assert.equal(await page.getByRole("dialog").count(),0);
    }
    assert.deepEqual(errors,[]);
    testContext.diagnostic(`Inventory: ${locale}, ${width}px, ${theme} passed`);
   } catch (error) {
    testContext.diagnostic(JSON.stringify({ workspace: "Inventory", locale, width, theme, pageErrors: errors, body: await page.locator("body").innerText().catch(() => "unavailable") }));
    throw error;
   } finally {await context.close();}
  }
  const context=await browser.newContext({viewport:{width:1400,height:1000}});const page=await context.newPage();
  try {await page.route("http://inventory-preview.local/**",r=>r.fulfill({contentType:"text/html",body:'<div id="root"></div>'}));await page.goto("http://inventory-preview.local/?gallery");await page.addStyleTag({content:css});await page.addScriptTag({content:script.code});await page.evaluate(()=>(window as unknown as {InventoryPreview:{mountInventoryWorkspacePreview:(locale:string,theme:string)=>Promise<void>}}).InventoryPreview.mountInventoryWorkspacePreview("nb","dark"));await page.locator("svg[data-filament-spool]").first().waitFor();assert.equal(await page.locator("svg[data-filament-spool]").count(),10);await page.screenshot({path:resolve(out,"ruller-detaljer.png"),fullPage:true});}finally{await context.close();}
 }finally{await browser.close();}
});
