import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderFilamentSpool,printerImageFilename,renderPrinterImage} from './companion_visuals.js';
import {companionIcon} from './companion_icons.js';

test('Companion uses the desktop model and multi-material artwork without guessing custom names',()=>{
 assert.equal(printerImageFilename(' Bambu Lab P1S ',true),'bambu-p1s.png');
 assert.equal(printerImageFilename('prusa mk4s',true),'prusa-mk4smmu3.png');
 assert.equal(printerImageFilename('A custom P1S case',true),null);
 assert.match(renderPrinterImage('Prusa MK4S',true),/href="\/companion\/prusa-mk4smmu3.png"/);
 assert.match(renderPrinterImage('Bambu Lab P1S',true),/href="\/companion\/bambu-p1s-companion-cutout.png"/);
 const catalog=JSON.parse(readFileSync(new URL('../../ui/src/lib/printer_image_catalog.json',import.meta.url),'utf8'));
 for(const [name,entry] of Object.entries(catalog)) {assert.equal(printerImageFilename(name),entry.single);assert.equal(printerImageFilename(name,true),entry.multi??entry.single);}
});
test('physical spool SVG keeps the desktop perspective, round wire, gradients and isolated identifiers',()=>{
 for(const color of ['#407EDB','#111111','multi(#E6005C,#2266FF)','gradient(#21B66D,#5CE6E6)']) {
  const html=renderFilamentSpool(color);assert.match(html,/alt=""/);
  const source=html.match(/src="data:image\/svg\+xml;base64,([^"]+)"/)[1];
  const svg=Buffer.from(source,'base64').toString('utf8');
  assert.match(svg,/viewBox="0 0 200 220"/);assert.match(svg,/gradientUnits="userSpaceOnUse"/);assert.match(svg,/clip-path="url\(#companion-spool-body\)"/);
  assert.doesNotMatch(svg,/view-box|gradient-units|undefined|NaN/);
 }
 assert.equal(renderFilamentSpool('#407EDB'),renderFilamentSpool('#407EDB'));
});
test('untrusted color input and unsupported icon identifiers cannot inject markup',()=>{
 const html=renderFilamentSpool('#f00\"><script>alert(1)</script>');
 const svg=Buffer.from(html.match(/base64,([^"]+)/)[1],'base64').toString('utf8');
 assert.doesNotMatch(svg,/<script|alert\(|onerror|javascript:/i);
 assert.equal(companionIcon('<script>'),'');assert.match(companionIcon('settings'),/aria-hidden="true"/);
});
