import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium, type Page } from "playwright";

async function buildHarness() {
  const requireFromUi = createRequire(new URL("../../package.json", import.meta.url));
  const [{ build }, { default: react }, { default: tailwindcss }] = await Promise.all([
    import(pathToFileURL(requireFromUi.resolve("vite")).href),
    import(pathToFileURL(requireFromUi.resolve("@vitejs/plugin-react")).href),
    import(pathToFileURL(requireFromUi.resolve("@tailwindcss/vite")).href),
  ]);
  const entry = fileURLToPath(new URL("./__backup_import_entry__.jsx", import.meta.url));
  const file = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)));
  const source = `
    import React, {useState} from "react";
    import {createRoot} from "react-dom/client";
    import {flushSync} from "react-dom";
    import {useSettingsBackupFileActions} from ${file("./use_settings_backup_file_actions.ts")};
    import {SettingsBackupImportConfirmation} from ${file("../components/settings_backup_import_confirmation.tsx")};
    import ${file("../index.css")};
    const t = (key, fallback="") => fallback;
    const noOp = () => {};
    let config = {tauri:true,client:false,mode:"LOCAL",host:null,library:"library-a",generation:1,
      validation:"valid",importFails:false,reloadChangesIdentity:false,reloadFails:false,mounted:true,tab:"MAINTENANCE"};
    let actions, state, capturedConfirm;
    const calls = {commands:[],reads:0,confirmedByBrowser:0,reloaded:0,recorded:0,validated:0};
    const validation = {format:"filament-manager-backup-v1",expected_tables:24,present_tables:24,
      total_rows:1663,missing_tables:[],extra_tables:[]};
    const pendingValidations = [], pendingReads = [];
    window.confirm = () => {calls.confirmedByBrowser++;throw Error("Native confirm must not be used");};
    window.__TAURI__ = {invoke:async(command,payload)=>{
      calls.commands.push({command,payload});
      if(command==="validate_full_backup_json") {
        if(config.validation==="defer") return new Promise(resolve=>pendingValidations.push(resolve));
        if(config.validation==="reject") throw Error("Not a valid full backup");
        return validation;
      }
      if(command==="import_data_file") {
        if(config.importFails) throw Error("Rejected by import preflight");
        return {detected_format:payload.content.startsWith("CSV")?"INVENTORY_CSV"
          :payload.content.startsWith("[") || payload.content.startsWith('{"spools"')?"INVENTORY_JSON":"FULL_BACKUP",
          imported_count:2,created_count:2,updated_count:0};
      }
      throw Error("Unexpected command "+command);
    }};
    function BackupActions({busy,setBusy,error,setError,info,setInfo}) {
      actions=useSettingsBackupFileActions({
        busy,clearBackupValidation:noOp,clearConfirmResetAction:noOp,librarySyncModeDraft:config.mode,
        locale:"en",recordBackupValidation:()=>calls.validated++,recordImportedFullBackup:()=>calls.recorded++,
        reloadSettings:async()=>{
          calls.reloaded++;
          if(config.reloadChangesIdentity) {
            config={...config,library:"restored-library",generation:2,mode:"HOST"};
            flushSync(render);
            await Promise.resolve();
          }
          if(config.reloadFails) throw Error("Settings refresh failed");
        },setActiveTab:noOp,setBusy,setError,setInfo,
        setLastCatalogReset:noOp,setLibrarySyncHostBaseUrlDraft:noOp,setLibrarySyncModeDraft:noOp,
        setLibrarySyncSnapshot:noOp,setLibrarySyncValidation:noOp,
        settingsBackupErrorMessageLabels:()=>({importDataFailed:"Import failed",validateBackupFailed:"Validation failed"}),
        settingsBackupValidationMessageLabels:()=>({backupValidationDone:"Backup valid"}),
        settingsClientReadOnly:config.client,settingsClientHostBaseUrl:config.host,
        settingsClientLibraryId:config.library,settingsClientTargetGeneration:config.generation,
        settingsImportMessageLabels:()=>({backupImported:"Backup imported",created:"created",
          importDetectedInventoryCsv:"CSV",importDetectedInventoryJson:"JSON",importSource:"Source",
          inventoryImportDone:"Inventory imported",librarySyncImportedOnClientHint:"Prepare Host",
          rows:"Rows",updated:"updated"}),tauri:config.tauri,t,
      });
      state={busy,error,info,pending:actions.backupImportConfirmation.fileName};
      return <>
        <button data-testid="background">Settings background</button>
        {config.tab==="MAINTENANCE"?<>
          <button data-testid="choose" disabled={busy} onClick={()=>document.querySelector('[data-testid=file]').click()}>Choose data file</button>
          <input data-testid="file" type="file" hidden onChange={actions.handleImportDataFile}/>
        </>:<div>Other Settings tab</div>}
        <div data-testid="error">{error}</div><div data-testid="info">{info}</div>
        <SettingsBackupImportConfirmation {...actions.backupImportConfirmation} t={t}/>
      </>;
    }
    function Harness() {
      const [busy,setBusy] = useState(false), [error,setError]=useState(null), [info,setInfo]=useState(null);
      state={busy,error,info,pending:null};
      window.qa.setBusy=setBusy;
      return config.mounted ? <BackupActions {...{busy,setBusy,error,setError,info,setInfo}}/> : <div>Settings closed</div>;
    }
    const root=createRoot(document.getElementById("root"));
    function render(){root.render(<Harness/>);}
    function choose(content,{deferRead=false,validateOnly=false}={}) {
      const event={target:{value:"synthetic-selection",files:[{name:"captured-backup.json",text:()=>{
        calls.reads++;
        return deferRead?new Promise(resolve=>pendingReads.push(()=>resolve(content))):Promise.resolve(content);
      }}]}};
      return (validateOnly?actions.handleValidateBackupFile:actions.handleImportDataFile)(event);
    }
    window.qa={
      inspect:()=>({state,calls,config}),
      update:next=>{config={...config,...next};flushSync(render);},
      choose,
      chooseTwice:content=>{void choose(content);void choose("second ignored content");},
      resolveRead:()=>pendingReads.shift()?.(),
      resolveValidation:()=>pendingValidations.shift()?.(validation),
      captureConfirm:()=>{capturedConfirm=actions.backupImportConfirmation.onConfirm;},
      confirmCaptured:()=>capturedConfirm?.(),
      confirmTwice:()=>{const confirm=actions.backupImportConfirmation.onConfirm;confirm();confirm();},
    };
    flushSync(render);
  `;
  const result = await build({
    root:fileURLToPath(new URL("../../",import.meta.url)),configFile:false,
    define:{"process.env.NODE_ENV":JSON.stringify("production")},logLevel:"error",
    plugins:[{name:"backup-import-harness",resolveId:(id:string)=>id===entry?entry:null,
      load:(id:string)=>id===entry?source:null},react(),tailwindcss()],
    build:{write:false,minify:false,cssCodeSplit:false,emptyOutDir:false,
      lib:{entry,formats:["iife"],name:"BackupImportHarness"}},
  });
  const outputs=(Array.isArray(result)?result:[result]).flatMap(result=>result.output);
  const script=outputs.find(output=>output.type==="chunk" && output.isEntry)?.code;
  const css=outputs.filter(output=>output.type==="asset" && output.fileName.endsWith(".css"))
    .map(output=>typeof output.source==="string"?output.source:new TextDecoder().decode(output.source)).join("\n");
  assert.ok(script);
  return `<html><head><meta charset="utf-8"><style>${css.replaceAll("</style","<\\/style")}</style></head><body><div id="previously-inert" inert><button>Previously hidden</button></div><div id="root"></div><script>${script.replaceAll("</script","<\\/script")}</script></body></html>`;
}

const dialog = (page:Page) => page.getByRole("dialog",{name:"Import backup/data file",exact:true});
const inspect = (page:Page) => page.evaluate("qa.inspect()");
const importCalls = async(page:Page) => (await inspect(page)).calls.commands.filter((call:{command:string})=>call.command==="import_data_file");
const idle = (page:Page) => page.waitForFunction("qa.inspect().state.busy === false");
async function selectFile(page:Page, content="captured full backup") {
  await page.getByTestId("choose").focus();
  await page.getByTestId("file").setInputFiles({name:"selected-backup.json",mimeType:"application/json",buffer:Buffer.from(content)});
}

test("backup file import uses explicit app confirmation in a real browser", async context => {
  const document=await buildHarness();
  const browser=await chromium.launch({headless:true});
  try {
    async function scenario(name:string,run:(page:Page)=>Promise<void>) {
      await context.test(name,async()=>{
        const page=await browser.newPage({viewport:{width:1200,height:800}});
        page.setDefaultTimeout(5_000);
        const errors:string[]=[];
        page.on("pageerror",error=>errors.push(error.message));
        try {
          await page.route("http://localhost/**",route=>route.fulfill({contentType:"text/html",body:document}));
          await page.goto("http://localhost/backup-import");
          await run(page);
          assert.deepEqual(errors,[]);
          assert.equal((await inspect(page)).calls.confirmedByBrowser,0);
        } finally {await page.close();}
      });
    }

    for(const action of ["Cancel","Escape","Enter","Close"]) {
      await scenario(`${action} cancels a validated full backup without any import`,async page=>{
        await selectFile(page);
        await dialog(page).waitFor();
        assert.equal((await inspect(page)).state.busy,true);
        assert.deepEqual(await importCalls(page),[]);
        assert.equal(await dialog(page).getByText("selected-backup.json",{exact:true}).count(),1);
        assert.equal(await page.evaluate("document.activeElement?.textContent"),"Cancel");
        if(action==="Escape" || action==="Enter") await page.keyboard.press(action);
        else await dialog(page).getByRole("button",{name:action,exact:true}).click();
        await idle(page);
        assert.equal(await dialog(page).count(),0);
        assert.deepEqual(await importCalls(page),[]);
        assert.equal((await inspect(page)).calls.reloaded,0);
        assert.equal(await page.evaluate("document.getElementById('root').inert"),false);
        assert.equal(await page.evaluate("document.getElementById('previously-inert').inert"),true);
        assert.equal(await page.evaluate("document.activeElement?.getAttribute('data-testid')"),"choose",
          "Cancel returns focus to the import chooser after the busy lock releases");
        await selectFile(page);
        await dialog(page).waitFor();
        assert.equal((await inspect(page)).calls.commands.length,2,"The same filename can be selected after cancel");
      });
    }

    await scenario("keyboard confirmation imports exact validated content once and shows success",async page=>{
      await selectFile(page,"immutable captured content");
      await dialog(page).waitFor();
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate("document.activeElement?.textContent"),"Import backup/data file");
      await page.keyboard.press("Enter");
      await idle(page);
      assert.deepEqual(await importCalls(page),[{command:"import_data_file",payload:{content:"immutable captured content"}}]);
      assert.equal((await inspect(page)).calls.recorded,1);
      assert.match((await inspect(page)).state.info,/Backup imported Rows: 2/);
    });

    await scenario("modal traps focus, hides background and keeps footer reachable in a short viewport",async page=>{
      await selectFile(page);
      await dialog(page).waitFor();
      const cdp=await page.context().newCDPSession(page);
      const {nodes}=await cdp.send("Accessibility.getFullAXTree");
      assert.equal(nodes.some(node=>!node.ignored && node.name?.value==="Settings background"),false);
      await cdp.detach();
      for(let index=0;index<6;index++) {
        await page.keyboard.press("Tab");
        assert.equal(await dialog(page).evaluate(element=>element.contains(document.activeElement)),true);
      }
      await page.setViewportSize({width:600,height:400});
      const footer=await dialog(page).getByRole("button",{name:"Import backup/data file",exact:true}).boundingBox();
      assert.ok(footer && footer.y>=0 && footer.y+footer.height<=400);
      await page.getByTestId("background").evaluate(element=>element.focus());
      assert.equal(await dialog(page).evaluate(element=>element.contains(document.activeElement)),true);
      await page.keyboard.press("Escape");
      await idle(page);
      await page.getByTestId("background").focus();
      assert.equal(await page.evaluate("document.activeElement?.textContent"),"Settings background");
    });

    for(const failure of [false,true]) {
      await scenario(`committed receipt survives its own library/mode refresh${failure?" and refresh failure":""}`,async page=>{
        await page.evaluate(`qa.update({reloadChangesIdentity:true,reloadFails:${failure}})`);
        await selectFile(page);
        await dialog(page).getByRole("button",{name:"Import backup/data file",exact:true}).click();
        await idle(page);
        assert.equal((await inspect(page)).config.library,"restored-library");
        assert.equal((await inspect(page)).calls.recorded,1);
        assert.match((await inspect(page)).state.info,/Backup imported Rows: 2/);
        assert.equal((await importCalls(page)).length,1);
        assert.equal(await dialog(page).count(),0);
      });
    }

    await scenario("refresh failure preserves committed success and reports a separate load error",async page=>{
      await page.evaluate("qa.update({reloadFails:true})");
      await selectFile(page);
      await dialog(page).getByRole("button",{name:"Import backup/data file",exact:true}).click();
      await idle(page);
      assert.equal((await inspect(page)).calls.recorded,1);
      assert.match((await inspect(page)).state.info,/Backup imported Rows: 2/);
      assert.equal((await inspect(page)).state.error,"Failed to load settings.");
      assert.equal((await importCalls(page)).length,1);
      assert.equal(await dialog(page).count(),0);
    });

    await scenario("duplicate events and confirmation callbacks cannot submit twice",async page=>{
      await page.evaluate("qa.chooseTwice('first immutable content')");
      await dialog(page).waitFor();
      assert.equal((await inspect(page)).calls.reads,1);
      await page.evaluate("qa.confirmTwice()");
      await idle(page);
      assert.deepEqual(await importCalls(page),[{command:"import_data_file",payload:{content:"first immutable content"}}]);
    });

    await scenario("CSV still follows the merge command without a destructive restore confirmation",async page=>{
      await page.evaluate("qa.update({validation:'reject'})");
      await selectFile(page,"CSV,synthetic,inventory");
      await idle(page);
      assert.equal(await dialog(page).count(),0);
      assert.deepEqual(await importCalls(page),[{command:"import_data_file",payload:{content:"CSV,synthetic,inventory"}}]);
      assert.equal((await inspect(page)).calls.recorded,0);
      assert.match((await inspect(page)).state.info,/Inventory imported Source: CSV/);
    });

    for(const content of [
      '{"format":"filament-manager-backup-v1","tables":{}}',
      '\uFEFF\uFEFF  {"format":"filament-manager-backup-v1","tables":{}}  ',
      '{"format":"filament-manager-backup-future","tables":{}}',
    ]) {
      await scenario(`declared backup cannot bypass a failed preflight: ${JSON.stringify(content)}`,async page=>{
        await page.evaluate("qa.update({validation:'reject'})");
        await selectFile(page,content);
        await idle(page);
        assert.deepEqual(await importCalls(page),[],"Importer would succeed; the UI must not send a declared backup after preflight failure");
        assert.equal(await dialog(page).count(),0,"Failed validation must not offer a false confirmation");
        assert.equal((await inspect(page)).state.error,"Import failed");
        assert.equal((await inspect(page)).state.info,null);
        assert.equal((await inspect(page)).calls.recorded,0);
      });
    }

    for(const content of ['[{"spool_id":"synthetic-roll"}]','{"spools":[{"spool_id":"synthetic-roll"}]}']) {
      await scenario(`inventory JSON remains a merge: ${content.startsWith("[")?"array":"spools object"}`,async page=>{
        await page.evaluate("qa.update({validation:'reject'})");
        await selectFile(page,content);
        await idle(page);
        assert.deepEqual(await importCalls(page),[{command:"import_data_file",payload:{content}}]);
        assert.equal(await dialog(page).count(),0);
        assert.equal((await inspect(page)).calls.recorded,0);
        assert.match((await inspect(page)).state.info,/Inventory imported Source: JSON/);
      });
    }

    await scenario("command-side malformed-backup rejection displays failure and no success",async page=>{
      await page.evaluate("qa.update({validation:'reject',importFails:true})");
      await selectFile(page,"malformed full backup");
      await idle(page);
      assert.equal(await dialog(page).count(),0);
      assert.equal((await inspect(page)).state.error,"Import failed");
      assert.equal((await inspect(page)).state.info,null);
      assert.equal((await inspect(page)).calls.recorded,0);
    });

    await scenario("pending confirmation survives a Settings tab change",async page=>{
      await selectFile(page);
      await dialog(page).waitFor();
      await page.evaluate("qa.update({tab:'GENERAL'})");
      await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();
      await idle(page);
      assert.deepEqual(await importCalls(page),[]);
    });

    for(const change of [{client:true},{host:"http://other-host"},{library:"library-b"},{generation:2},{mode:"HOST"},{tauri:false},{mounted:false}]) {
      await scenario(`pending confirmation is cancelled by ${JSON.stringify(change)}`,async page=>{
        await selectFile(page);
        await dialog(page).waitFor();
        await page.evaluate(`qa.captureConfirm();qa.update(${JSON.stringify(change)});qa.confirmCaptured()`);
        await idle(page);
        assert.equal(await dialog(page).count(),0);
        assert.deepEqual(await importCalls(page),[]);
      });
    }

    await scenario("old A callback cannot approve a later A after a target round trip",async page=>{
      await selectFile(page,"old A content");
      await dialog(page).waitFor();
      await page.evaluate("qa.captureConfirm();qa.update({library:'library-b',generation:2});qa.update({library:'library-a',generation:3})");
      await idle(page);
      await selectFile(page,"new A content");
      await dialog(page).waitFor();
      await page.evaluate("qa.confirmCaptured()");
      assert.deepEqual(await importCalls(page),[]);
      assert.equal((await inspect(page)).state.busy,true);
      await dialog(page).getByRole("button",{name:"Import backup/data file",exact:true}).click();
      await idle(page);
      assert.deepEqual(await importCalls(page),[{command:"import_data_file",payload:{content:"new A content"}}]);
    });

    for(const stage of ["read","validation"]) {
      await scenario(`late ${stage} cannot prompt or unlock a newer operation`,async page=>{
        if(stage==="validation") await page.evaluate("qa.update({validation:'defer'})");
        await page.evaluate(`void qa.choose('stale content',{deferRead:${stage==="read"}})`);
        await page.waitForFunction("qa.inspect().state.busy");
        if(stage==="validation") await page.waitForFunction("qa.inspect().calls.commands.length===1");
        await page.evaluate("qa.update({generation:2,validation:'valid'})");
        await idle(page);
        await selectFile(page,"current content");
        await dialog(page).waitFor();
        await page.evaluate(stage==="read"?"qa.resolveRead()":"qa.resolveValidation()");
        assert.equal((await inspect(page)).state.busy,true);
        assert.equal((await inspect(page)).state.pending,"selected-backup.json");
        assert.deepEqual(await importCalls(page),[]);
        await dialog(page).getByRole("button",{name:"Cancel",exact:true}).click();
        await idle(page);
      });
    }

    for(const guard of ["runtime","client","busy"]) {
      await scenario(`${guard} guard rejects file reads and import commands`,async page=>{
        await page.evaluate(guard==="runtime"?"qa.update({tauri:false})":guard==="client"?"qa.update({client:true})":"qa.setBusy(true)");
        if(guard==="busy") await page.waitForFunction("qa.inspect().state.busy");
        await page.evaluate("qa.choose('blocked content')");
        assert.equal((await inspect(page)).calls.reads,0);
        assert.deepEqual((await inspect(page)).calls.commands,[]);
        assert.equal(await dialog(page).count(),0);
      });
    }

    await scenario("read-only validation reports valid backup without opening import",async page=>{
      await page.evaluate("qa.update({client:true})");
      await page.evaluate("qa.choose('validation only',{validateOnly:true})");
      await idle(page);
      assert.equal((await inspect(page)).calls.validated,1);
      assert.deepEqual(await importCalls(page),[]);
      assert.equal((await inspect(page)).state.info,"Backup valid");
    });
  } finally {await browser.close();}
});
