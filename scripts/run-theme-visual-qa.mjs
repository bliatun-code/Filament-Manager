import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=resolve('.');
const req=createRequire(resolve('ui/package.json'));
const {build}=await import(pathToFileURL(req.resolve('vite')));
const {default:react}=await import(pathToFileURL(req.resolve('@vitejs/plugin-react')));
const {default:tailwindcss}=await import(pathToFileURL(req.resolve('@tailwindcss/vite')));
const {chromium}=createRequire(resolve('package.json'))('playwright');
const {default:AxeBuilder}=await import('@axe-core/playwright');
const built=await build({root:resolve('ui'),configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('production')},plugins:[tailwindcss(),react()],build:{write:false,minify:false,cssCodeSplit:false,lib:{entry:resolve('ui/test-fixtures/theme_workspace_browser_entry.tsx'),formats:['iife'],name:'ThemePreview'}}});
const outputs=(Array.isArray(built)?built:[built]).flatMap(x=>x.output);
const script=outputs.find(x=>x.type==='chunk'&&x.isEntry).code;
const css=outputs.filter(x=>x.type==='asset'&&x.fileName.endsWith('.css')).map(x=>x.source).join('\n');
const output=resolve('release-artifacts/visual-qa/themes'); await mkdir(output,{recursive:true});
const browser=await chromium.launch(); const report=[];
try {
 for(const theme of ['dark','dark-deep','blue','light','auto']) {
  for(const [screen,mount] of Object.entries({inventory:'mountInventoryWorkspacePreview',printers:'mountPrintersWorkspace',settings:'mountSettingsPreview',configuration:'mountPrintersSettingsPreview',picker:'mountPrinterPickerPreview',dialog:'mountBalancedSpoolPreview'})) {
   const context=await browser.newContext({viewport:{width:1440,height:1080},colorScheme:'dark'});const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try {
    await page.route('http://theme-preview.local/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="nb"><head><title>Filament Manager</title></head><body><div id="root"></div></body></html>'}));
    await page.goto('http://theme-preview.local/');await page.addStyleTag({content:css});await page.addScriptTag({content:script});assert.deepEqual(errors,[]);
    await page.evaluate(({mount,theme})=>window.ThemePreview[mount]('nb',theme),{mount,theme});
    await page.locator('#root > *').first().waitFor();
    if(screen==='picker') {
     await page.getByRole('button',{name:'Velg printermodell',exact:true}).click();
     await page.getByRole('button',{name:'Prusa',exact:true}).click();
     await page.getByRole('textbox',{name:'Søk etter printermodell'}).fill('CORE');
    }
    await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode().catch(()=>{});}));});
    await page.screenshot({path:resolve(output,`${theme}-${screen}.png`),fullPage:true});
    const evidence=await page.evaluate(()=>({selected:document.documentElement.dataset.theme,resolved:document.documentElement.dataset.resolvedTheme,overflow:document.documentElement.scrollWidth>window.innerWidth,brokenImages:[...document.images].filter(i=>!i.naturalWidth).length,card:getComputedStyle(document.documentElement).getPropertyValue('--app-theme-data-card-base').trim()}));
    assert.equal(evidence.selected,theme);assert.equal(evidence.resolved,theme==='light'?'light':'dark');assert.equal(evidence.overflow,false);assert.equal(evidence.brokenImages,0);assert.deepEqual(errors,[]);
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
    const violations=axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
    if(screen==='configuration') {
     await page.locator('.settings-printer-balanced-card').first().locator('[aria-expanded]').click();
     await page.locator('.settings-printer-balanced-card').nth(1).getByRole('button',{name:'Fjern',exact:true}).click();
     const expanded=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
     violations.push(...expanded.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
     await page.screenshot({path:resolve(output,`${theme}-configuration-expanded.png`),fullPage:true});
    }
    if(screen==='picker') {
     const search=page.getByRole('textbox',{name:'Søk etter printermodell'});await search.fill('MK4S');
     const candidate=page.getByRole('button',{name:/Prusa MK4S/});await candidate.focus();await page.keyboard.press('Enter');
     assert.equal(await page.locator('#qa-printer-model').getAttribute('aria-expanded'),'false');
     assert.match(await page.locator('#qa-printer-model').innerText(),/Prusa MK4S/);
     await page.getByRole('button',{name:'Lagre',exact:true}).click();assert.equal(await page.locator('output').innerText(),'Prusa MK4S');
     await page.locator('#qa-printer-model').click();await search.fill('not-a-real-printer');assert.equal(await page.getByText('Ingen treff',{exact:true}).count(),1);
     await page.getByRole('textbox',{name:'Egendefinert modellnavn'}).fill('Min egen printer');await page.keyboard.press('Escape');
     assert.equal(await page.locator('#qa-printer-model').getAttribute('aria-expanded'),'false');
     assert.equal(await page.locator('#qa-printer-model').evaluate(el=>el===document.activeElement),true);
    }
    if(screen==='settings') {
     for(const name of ['Grå · Myk','Grå · Dyp','Blå · Natt','Lys · Ren']) {await page.getByRole('button',{name,exact:true}).click();assert.equal(await page.getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),'true');}
    }
    if(theme==='auto') {if(screen==='settings') await page.locator('.settings-theme-choice:has(.settings-theme-preview-auto)').click();await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.resolvedTheme==='light');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.resolvedTheme==='dark');}
    await page.setViewportSize({width:390,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme} ${screen} narrow overflow`);
    await page.screenshot({path:resolve(output,`${theme}-${screen}-narrow.png`),fullPage:true});
    report.push({theme,screen,...evidence,violations});console.log(theme,screen,violations.length?'accessibility findings: '+violations.length:'OK');
   } finally {await context.close();}
  }
 }
} finally {await browser.close();await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
if(report.some(x=>x.violations.length)) process.exitCode=1;
console.log('Screenshots:',output);
