import assert from 'node:assert/strict';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
// Focused production-component harness. Native command authorization is tested in Rust.
// Requires the UI dev server on 127.0.0.1:5189; never starts a second desktop instance.
const origin='http://127.0.0.1:5189';
const out=resolve('release-artifacts/visual-qa/companion-access-recovery');await mkdir(out,{recursive:true});
const fixture=resolve('ui/.companion-access-review-qa.tsx');
const browser=await chromium.launch();const report=[];
try{for(const theme of ['dark','dark-deep','blue','light','auto']){
 const context=await browser.newContext({viewport:{width:1200,height:900}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 page.setDefaultTimeout(10000);
 page.on('response',r=>{if(r.status()>=400)console.error('Resource',r.status(),new URL(r.url()).pathname);});
 await page.addInitScript(({theme})=>{
  localStorage.setItem('bfm-locale','nb');
  const rows=[{id:'fixture-request',device_name:'Bjørns iPhone',browser_hint:'Safari iPhone',status:'pending',requested_at_ms:Date.now(),expires_at_ms:Date.now()+600000,confirmation_code:null}];
  window.__TAURI__={invoke:async(command,args)=>{
   if(command==='list_companion_access_requests')return structuredClone(rows);
   if(command==='decide_companion_access_request'){
    if(args.requestId!==rows[0]?.id)throw new Error('Unknown fixture request');
    if(args.approve){rows[0]={...rows[0],status:'approved',confirmation_code:'482913',expires_at_ms:Date.now()+300000};return structuredClone(rows[0]);}
    return {...rows.pop(),status:'rejected'};
   }
   throw new Error('Unexpected native command '+command);
  }};
  window.fixtureTheme=theme;
 },{theme});
 await page.route(origin+'/access-review-test',async route=>{const html=`<!doctype html><html lang="nb"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Companion access review QA</title></head><body><div id="root"></div><script type="module">
 import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 </script><script type="module">
 import React from 'react';
 import {createRoot} from 'react-dom/client';
 import '/src/index.css';
 import {I18nProvider} from '/src/lib/i18n_provider.tsx';
 import {setThemeMode} from '/src/lib/theme_mode.ts';
 import {CompanionAccessRequestsContext,useCompanionAccessRequestState} from '/src/lib/companion_access_requests.tsx';
 import {CompanionAccessRequestBanner} from '/src/components/companion_access_request_banner.tsx';
 import {SettingsCompanionAccessRequests} from '/src/components/settings_companion_access_requests.tsx';
 setThemeMode(window.fixtureTheme);
 function Review(){const state=useCompanionAccessRequestState();const[open,setOpen]=React.useState(false);return React.createElement(CompanionAccessRequestsContext.Provider,{value:state},React.createElement('main',null,
 React.createElement('h1',{style:{margin:'24px',fontSize:'24px'}},'Filament Manager · Companion'),
 React.createElement(CompanionAccessRequestBanner,{onOpen:()=>{state.setReviewRequested(true);setOpen(true);}}),
 open?React.createElement('div',{className:'surface-card',style:{margin:'24px',padding:'24px'}},React.createElement('h2',{style:{fontSize:'22px',marginBottom:'20px'}},'Bibliotek og webapp'),React.createElement(SettingsCompanionAccessRequests)):null));}
 createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(Review)));
 </script></body></html>`;
 const modules=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
 await writeFile(fixture,modules[1][1]);
 return route.fulfill({contentType:'text/html',body:html.replace(modules[1][0],'<script type="module" src="/.companion-access-review-qa.tsx"></script>')});
 });
 await page.goto(origin+'/access-review-test');
 await page.getByRole('button',{name:'Se forespørsler'}).click();
 await page.locator('#companion-access-requests').waitFor();
 assert.equal(await page.locator('#companion-access-requests').evaluate(e=>e===document.activeElement),true);
 const check=async(state)=>{
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  report.push({theme,state,overflow,violations:axe.violations});
  await page.screenshot({path:resolve(out,`host-${theme}-${state}.png`)});
 };
 await check('pending');
 await page.getByRole('button',{name:'Gi tilgang',exact:true}).click();
 await page.getByText('482913',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Gi tilgang',exact:true}).count(),0);
 await check('approved');
 await page.getByRole('button',{name:'Avvis',exact:true}).click();await page.locator('#companion-access-requests').waitFor({state:'detached'});
 assert.deepEqual(errors,[]);await context.close();
}}finally{await browser.close();await unlink(fixture).catch(()=>{});await writeFile(resolve(out,'host-report.json'),JSON.stringify(report,null,2)+'\n');}
assert.equal(report.filter(r=>r.violations.length).length,0,'Host accessibility findings');console.log('Host banner, approval, six-digit code and decline: OK across all themes');
