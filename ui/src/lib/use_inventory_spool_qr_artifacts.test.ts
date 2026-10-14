import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

async function buildHarnessDocument() {
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  const entry = fileURLToPath(new URL("./__qr_artifacts_virtual__.js", import.meta.url));
  const source = `
    import React,{useLayoutEffect} from 'react';
    import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {useInventorySpoolQrArtifacts} from './use_inventory_spool_qr_artifacts';
    const spools={a:{id:'a'},b:{id:'b'}},calls=[],history=[];let state;
    window.qrStage=options=>new Promise((resolve,reject)=>{
      calls.push({options,resolve:()=>resolve({qrReference:options.spoolId,
        qrPayload:options.clientHostBaseUrl+'/'+options.spoolId,
        qrTarget:options.clientHostBaseUrl+'/'+options.spoolId,
        qrDataUrl:'qr:'+options.clientHostBaseUrl+'/'+options.spoolId,
        companionShellUrl:options.clientHostBaseUrl}),reject:()=>reject(Error('synthetic QR failure'))});
    });
    function Harness({id='a',host='http://host-a.local',client=true,open=true}){
      const result=useInventorySpoolQrArtifacts({selectedSpool:spools[id]??null,
        clientHostBaseUrl:host,clientReadOnly:client,showRollModal:open});
      const visible={id,host,client,open,dataUrl:result.dataUrl,target:result.target,
        companionShellUrl:result.companionShellUrl,loading:result.loading};
      useLayoutEffect(()=>{state=visible;history.push(visible);});
      return React.createElement('output',null,result.target??'unavailable');
    }
    const root=createRoot(document.getElementById('root'));
    window.qrs={render:(props={})=>flushSync(()=>root.render(React.createElement(Harness,props))),
      finish:(index,fail=false)=>fail?calls[index].reject():calls[index].resolve(),
      snapshot:()=>({...state,calls:calls.map(call=>call.options),history:[...history]})};
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false, logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [{ name: "qr-artifacts-harness", enforce: "pre",
      resolveId(id: string) {
        if (id === entry) return entry;
        if (id === "./spool_qr_artifacts") return "\0qr-artifacts-mock";
        return null;
      },
      load(id: string) {
        if (id === entry) return source;
        if (id === "\0qr-artifacts-mock") return "export const buildSpoolQrArtifacts=options=>window.qrStage(options);";
        return null;
      },
    }],
    build: { write: false, minify: false, lib: { entry, formats: ["iife"], name: "QrArtifacts" } },
  });
  const script = (Array.isArray(result) ? result : [result]).flatMap((value) => value.output)
    .find((value) => value.type === "chunk" && value.isEntry)?.code;
  assert.ok(script);
  return `<html><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

test("rendered spool QR artifacts keep their image and original target within the current source", async (context) => {
  const html = await buildHarnessDocument();
  const browser = await chromium.launch({ headless: true });
  const scenario = async (name: string, run: (page: Awaited<ReturnType<typeof browser.newPage>>) => Promise<void>) =>
    context.test(name, async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(5_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.setContent(html);
        await page.evaluate("qrs.render()");
        await page.waitForFunction("qrs.snapshot().calls.length===1");
        await run(page);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  const ready = (page: Awaited<ReturnType<typeof browser.newPage>>) =>
    page.waitForFunction("!qrs.snapshot().loading&&qrs.snapshot().target!==null");
  try {
    for (const [name, props, target] of [
      ["selected spool", "{id:'b'}", "http://host-a.local/b"],
      ["paired Host", "{host:'http://host-b.local'}", "http://host-b.local/a"],
      ["client mode", "{client:false}", "http://host-a.local/a"],
    ]) {
      await scenario(`${name} changes hide the previous target before effects run`, async (page) => {
        await page.evaluate("qrs.finish(0)"); await ready(page);
        const historyLength = await page.evaluate("qrs.snapshot().history.length");
        await page.evaluate(`qrs.render(${props})`);
        // The first layout snapshot observes the source-change render before
        // the hook's passive effect clears state or starts the replacement.
        const first = await page.evaluate(`qrs.snapshot().history[${historyLength}]`);
        assert.equal(first.dataUrl, null);
        assert.equal(first.target, null);
        assert.equal(first.companionShellUrl, null);
        assert.equal(first.loading, true);
        await page.waitForFunction("qrs.snapshot().calls.length===2");
        await page.evaluate("qrs.finish(1)"); await ready(page);
        const current = await page.evaluate("qrs.snapshot()");
        assert.equal(current.target, target);
        assert.equal(current.dataUrl, `qr:${target}`);
      });
    }
    await scenario("late generation for the previous spool cannot supply the new spool's label", async (page) => {
      await page.evaluate("qrs.render({id:'b'})");
      await page.waitForFunction("qrs.snapshot().calls.length===2");
      await page.evaluate("qrs.finish(0)");
      assert.equal((await page.evaluate("qrs.snapshot()")).target, null);
      await page.evaluate("qrs.finish(1)"); await ready(page);
      assert.equal((await page.evaluate("qrs.snapshot()")).target, "http://host-a.local/b");
    });
    await scenario("Host A to B to A discards both obsolete generations", async (page) => {
      await page.evaluate("qrs.render({host:'http://host-b.local'})");
      await page.waitForFunction("qrs.snapshot().calls.length===2");
      await page.evaluate("qrs.render()");
      await page.waitForFunction("qrs.snapshot().calls.length===3");
      await page.evaluate("qrs.finish(0);qrs.finish(1)");
      const pending = await page.evaluate("qrs.snapshot()");
      assert.equal(pending.target, null);
      assert.equal(pending.dataUrl, null);
      assert.equal(pending.loading, true);
      await page.evaluate("qrs.finish(2)"); await ready(page);
      assert.equal((await page.evaluate("qrs.snapshot()")).target, "http://host-a.local/a");
    });
    await scenario("closing the detail hides pending QR artifacts and rejects late completion", async (page) => {
      await page.evaluate("qrs.render({open:false});qrs.finish(0)");
      const closed = await page.evaluate("qrs.snapshot()");
      assert.equal(closed.target, null);
      assert.equal(closed.dataUrl, null);
      assert.equal(closed.loading, false);
    });
    await scenario("current failure clears loading without reusing an old successful QR", async (page) => {
      await page.evaluate("qrs.finish(0)"); await ready(page);
      await page.evaluate("qrs.render({id:'b'})");
      await page.waitForFunction("qrs.snapshot().calls.length===2");
      await page.evaluate("qrs.finish(1,true)");
      await page.waitForFunction("!qrs.snapshot().loading");
      const failed = await page.evaluate("qrs.snapshot()");
      assert.equal(failed.dataUrl, null);
      assert.equal(failed.target, null);
      assert.equal(failed.companionShellUrl, null);
    });
  } finally { await browser.close(); }
});
