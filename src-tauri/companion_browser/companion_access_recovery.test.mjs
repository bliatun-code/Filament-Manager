import assert from 'node:assert/strict';
import test from 'node:test';
import {createAccessRecoveryController,renderAccessRecovery,suggestedDeviceName} from './companion_access_recovery.js';

test('device hints are editable suggestions, not browser identity or a user-assigned phone name',()=>{
 assert.equal(suggestedDeviceName('Mozilla iPhone Safari/1'),'Safari iPhone');
 assert.equal(suggestedDeviceName('Mozilla Macintosh Chrome/1 Safari/1'),'Chrome Mac');
});
test('recovery states escape device names and keep the code confined to the approved step',()=>{
 const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const idle=renderAccessRecovery({recovery:{deviceName:'"><script>bad</script>'},escapeHtml});
 assert.doesNotMatch(idle,/<script>/);assert.match(idle,/data-access-form="request"/);assert.doesNotMatch(idle,/autocomplete="one-time-code"/);
 const pending=renderAccessRecovery({recovery:{status:'pending'},escapeHtml});assert.match(pending,/Request sent/);assert.doesNotMatch(pending,/<form/);
 const approved=renderAccessRecovery({recovery:{status:'approved'},escapeHtml});assert.match(approved,/inputmode="numeric"/);assert.match(approved,/maxlength="6"/);
 const locked=renderAccessRecovery({recovery:{status:'locked'},escapeHtml});assert.match(locked,/Three incorrect attempts/);assert.doesNotMatch(locked,/one-time-code/);
});
test('the controller polls using same-origin cookies, handles wrong codes and resumes after confirmation',async()=>{
 const calls=[];const state={locale:'en',apiReady:false};let authenticated=0;let renders=0;
 const replies=[{status:'pending'},{status:'approved',attempts_remaining:3},{status:'approved',attempts_remaining:2},{status:'approved',attempts_remaining:2},{ok:true,csrf_token:'new'}];
 const controller=createAccessRecoveryController({state,render:()=>renders++,onAuthenticated:async()=>{authenticated++;state.apiReady=true;},setTimer:()=>1,clearTimer:()=>{},fetchImpl:async(url,init)=>{calls.push({url,init});return{ok:true,json:async()=>replies.shift()};}});
 await controller.submit('request','My iPhone');assert.equal(state.accessRecovery.status,'pending');
 await controller.restore();assert.equal(state.accessRecovery.status,'approved');
 await controller.submit('confirm','123456');assert.equal(state.accessRecovery.attemptsRemaining,2);assert.match(state.accessRecovery.error,/2/);assert.equal(authenticated,0);
 await controller.restore();assert.match(state.accessRecovery.error,/2/,'polling keeps the useful incorrect-code feedback');
 await controller.submit('confirm','654321');assert.equal(authenticated,1);assert.equal(state.apiReady,true);assert.ok(renders>0);
 for(const {url,init}of calls){assert.equal(init.credentials,'same-origin');assert.equal(init.headers['x-bfm-access-request'],'1');assert.doesNotMatch(url,/\?/);assert.doesNotMatch(init.body||'',/secret|csrf|credential/);}
});
test('cancel wins over an in-flight status response and a missing request expires safely',async()=>{
 let resolveStatus;const state={locale:'en',apiReady:false,accessRecovery:{status:'pending'}};
 const controller=createAccessRecoveryController({state,render:()=>{},onAuthenticated:async()=>{},setTimer:()=>1,clearTimer:()=>{},fetchImpl:async(url)=>url.endsWith('/status')?new Promise(resolve=>{resolveStatus=resolve;}):{ok:true,json:async()=>({status:'cancelled'})}});
 const polling=controller.restore();await controller.cancel();resolveStatus({ok:true,json:async()=>({status:'approved'})});await polling;
 assert.equal(state.accessRecovery.status,'cancelled');
 const second={locale:'en',apiReady:false,accessRecovery:{status:'pending'}};
 const missing=createAccessRecoveryController({state:second,render:()=>{},onAuthenticated:async()=>{},setTimer:()=>1,clearTimer:()=>{},fetchImpl:async()=>({ok:false,status:401,json:async()=>({})})});
 await missing.restore();assert.equal(second.accessRecovery.status,'expired');
});
