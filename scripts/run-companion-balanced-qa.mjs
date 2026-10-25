import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const root=resolve('.');const dir=resolve('src-tauri/companion_browser');
const seed=JSON.parse(await readFile(resolve('test_fixtures/visual_qa_seed.json'),'utf8')).tables;
const masters=seed.filament_master_list;
const spools=seed.filament_spools.map(spool=>({spool,master:masters.find(m=>m.id===spool.master_id),location_name:seed.inventory_locations.find(x=>x.id===spool.location_id)?.name}));
const printers=seed.printers.map(printer=>({printer,usage:{total_jobs:12,successful_jobs:11,failed_jobs:1,total_used_g:1400},slots:seed.ams_slots.filter(s=>seed.ams_units.some(u=>u.id===s.ams_id&&u.printer_id===printer.id)).map(slot=>{
 const row=spools.find(x=>x.spool.id===slot.spool_id);const live=printer.model.startsWith('Bambu');
 return {...slot,slot_id:slot.id,spool_material:row?.master.material,spool_filament_name:row?.master.filament_name,spool_color_name:row?.master.color_name,spool_hex_color:row?.master.hex_color,spool_remaining_g:row?.spool.remaining_g,spool_rfid_tag:row?.spool.rfid_tag,...(live?{live_loaded:Boolean(row),live_mqtt_connected:true,live_printer_last_seen_at:new Date().toISOString(),live_nozzle_temp_c:28,live_bed_temp_c:27,live_ams_humidity_index:3,live_ams_temperature_c:32}: {})};
})}));
const loans=seed.spool_loans.map(loan=>({loan,...spools.find(r=>r.spool.id===loan.spool_id)?.master,spool_remaining_g:spools.find(r=>r.spool.id===loan.spool_id)?.spool.remaining_g}));
const allowed=new Set(await readdir(dir));const pngs=new Set(await readdir(resolve('ui/src/assets/printers')));
const out=resolve('release-artifacts/visual-qa/companion-balanced');await mkdir(out,{recursive:true});
const localeCatalog=JSON.parse(await readFile(resolve('localization/companion-dictionaries.json'),'utf8')).dictionaries;
const browser=await chromium.launch();const report=[];
try{for(const theme of ['dark','dark-deep','blue','light','auto'])for(const [device,width,height] of [['phone',390,844],['ipad',1024,1366],['desktop',1440,1000],...(theme==='dark'?[['phone-small',320,700]]:[])]){
 const context=await browser.newContext({viewport:{width,height},colorScheme:'dark',isMobile:device.startsWith('phone'),hasTouch:device!=='desktop'});const page=await context.newPage();let authenticated=true;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await context.addInitScript(({theme})=>{if(!localStorage.getItem('bfm-companion-locale'))localStorage.setItem('bfm-companion-locale','nb');localStorage.setItem('bfm-companion-theme-mode',theme);},{theme});
 await page.route('http://companion-balanced.local/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;let data;
  if(!authenticated && path.startsWith('/api/v1/') && path!=='/api/v1/auth/session') return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'common.unauthorized',message:'Authentication required'})});
  if(path==='/api/v1/auth/session')data={authenticated,csrf_token:authenticated?'fixture-csrf':null,auth_mode:'pairing-session',access_mode:'trusted-lan',can_renew:authenticated};
  else if(path==='/api/v1/auth/renew')return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'common.unauthorized',message:'Authentication required'})});
  else if(path==='/api/v1/inventory/spools')data=spools.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||500));
  else if(path==='/api/v1/catalog/masters')data=masters;
  else if(path==='/api/v1/wishlist')data=seed.wishlist_items;
  else if(path==='/api/v1/printers/overview')data=printers;
  else if(path==='/api/v1/loans')data=loans;
  else if(/^\/api\/v1\/spools\/[^/]+$/.test(path)){const id=decodeURIComponent(path.split('/').at(-1));data={spool:spools.find(x=>x.spool.id===id),usage:[],history:seed.spool_history_events.filter(x=>x.spool_id===id)};}
  if(data!==undefined)return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/companion'||path==='/companion/')return route.fulfill({contentType:'text/html',body:await readFile(resolve(dir,'index.html'))});
  const file=basename(path);
  if(allowed.has(file)&&/\.(js|css)$/.test(file))return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/css',body:await readFile(resolve(dir,file))});
  if(pngs.has(file)&&file.endsWith('.png'))return route.fulfill({contentType:'image/png',body:await readFile(resolve('ui/src/assets/printers',file))});
  if(/^icon-(light|dark)\.png$/.test(file))return route.fulfill({contentType:'image/png',body:await readFile(resolve('src-tauri/icons/dock-'+file.slice(5)))});
  if(path.endsWith('/qr-image.svg'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/></svg>'});
  return route.fulfill({status:404,body:'Fixture has no matching resource'});
 });
 await page.goto('http://companion-balanced.local/companion');await page.locator('.storage-shell .spool-list-row').first().waitFor();
 for(const flow of ['storage','loans','printers','settings']){
  await page.locator(`[data-action="set-root-flow"][data-root-flow="${flow}"]`).filter({visible:true}).first().click();
  await page.locator(`.${flow==='storage'?'storage':flow}-shell`).waitFor();
  await page.evaluate(async()=>{await Promise.all([...document.images].map(image=>{image.loading='eager';return image.decode().catch(()=>{});}));});
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src.slice(0,70))}));
  assert.equal(metrics.overflow,false,`${device} ${theme} ${flow} overflow`);assert.deepEqual(metrics.brokenImages,[]);
  if(flow==='printers') {
   const alpha=await page.evaluate(()=>{
    const image=document.querySelector('.printer-board-header .companion-printer-image');
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,1,1).data[3];
   });
   assert.equal(alpha,0,`${device} ${theme}: printer cutout has a truly transparent background`);
  }
  if(flow==='storage') {
   const layout=await page.evaluate(()=>{
    const rect=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();
    const rows=[...document.querySelectorAll('.storage-shell .spool-list-row')];
    return {first:rect('.storage-shell .spool-list-row'),title:rect('.storage-controls h1'),add:rect('[data-action="toggle-add-spool-form"]'),search:rect('#companion-inventory-search'),nav:rect('.phone-bottom-nav'),rows:rows.map(row=>({right:row.getBoundingClientRect().right,weight:row.querySelector('.spool-row-weight').getBoundingClientRect().toJSON(),height:row.getBoundingClientRect().height}))};
   });
   assert.ok(Math.abs(layout.title.y-layout.add.y)<16,`${device}: title and add button align`);
   if(width<768) {
    assert.ok(layout.first.y<150,`${device}: compact inventory header`);
    assert.ok(layout.first.x<=8,`${device}: avoid nested mobile side padding`);
    assert.equal(layout.nav.x,0);assert.equal(layout.nav.right,width);assert.equal(layout.nav.bottom,height);
    assert.ok(layout.nav.height<=64,`${device}: compact anchored navigation`);
    for(const row of layout.rows) {assert.ok(row.right-row.weight.right<16,`${device}: right aligned weight`);assert.ok(row.height<=145,`${device}: long names and loan badges stay compact`);}
   } else {assert.ok(layout.search.width<=450,`${device}: search has a useful bounded width`);}
  }
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();const violations=axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
  await page.screenshot({path:resolve(out,`${device}-${theme}-${flow}.png`),fullPage:true});
  await page.screenshot({path:resolve(out,`${device}-${theme}-${flow}-viewport.png`)});
  report.push({device,theme,flow,...metrics,violations});console.log(device,theme,flow,violations.length?'findings '+violations.length:'OK');
 }
 if(device==='phone-small' && theme==='dark') {
  for(const [locale,dictionary] of Object.entries(localeCatalog)) {
   await page.evaluate(locale=>localStorage.setItem('bfm-companion-locale',locale),locale);await page.reload();
   await page.locator('.storage-shell .spool-list-row').first().waitFor();
   await page.evaluate(()=>scrollTo(0,0));
   assert.equal(await page.locator('#companion-inventory-search').getAttribute('placeholder'),dictionary.storage.searchShortPlaceholder);
   const localizedLayout=await page.evaluate(()=>{
    const title=document.querySelector('.storage-controls h1').getBoundingClientRect();
    const add=document.querySelector('[data-action="toggle-add-spool-form"]').getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth,overlap:title.right>add.left,headingVisible:title.top>=0};
   });
   assert.deepEqual(localizedLayout,{overflow:false,overlap:false,headingVisible:true},`${locale}: compact translated toolbar`);
   const localeAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
   report.push({device,theme,locale,flow:'localized-storage',...localizedLayout,violations:localeAxe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(out,`phone-small-dark-storage-${locale}.png`)});console.log(locale,'compact inventory OK');
  }
  await page.evaluate(()=>localStorage.setItem('bfm-companion-locale','nb'));await page.reload();await page.locator('.storage-shell .spool-list-row').first().waitFor();
 }
 await page.locator('[data-action="set-root-flow"][data-root-flow="storage"]').filter({visible:true}).first().click();
 const search=page.locator('[name="inventory-search"]');await search.fill('no-such-filament');assert.equal(await page.locator('.storage-shell .spool-list-row').count(),0);await search.fill('');await page.locator('.storage-shell .spool-list-row').first().click();await page.getByRole('dialog').waitFor();
 const modal=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();report.push({device,theme,flow:'detail',violations:modal.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
 await page.screenshot({path:resolve(out,`${device}-${theme}-detail.png`)});
 await page.locator('[data-action="close-detail"]').click();await page.locator('[data-action="toggle-add-spool-form"]').click();await page.getByRole('dialog').waitFor();await page.locator('[data-action="close-task-sheet"]').click();
 if(theme==='auto'){await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.resolvedTheme==='light');}
 if(device==='phone' && (theme==='dark'||theme==='light')) {
  authenticated=false;await page.reload();await page.locator('.pairing-card').waitFor();assert.equal(await page.locator('.spool-list-row').count(),0);
  await page.locator('[data-action="refresh"]').click();await page.locator('.pairing-card .status-line[data-tone="error"]').waitFor();
  const access=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();report.push({device,theme,flow:'access-required',violations:access.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  await page.screenshot({path:resolve(out,`${device}-${theme}-access-required.png`)});
 }
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
}}finally{await browser.close();await writeFile(resolve(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');}
assert.equal(report.filter(x=>x.violations.length).length,0,'Accessibility findings require review');
console.log('Companion layouts, themes, assets and overlays: OK');
