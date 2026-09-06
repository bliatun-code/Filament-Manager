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
  const entry = fileURLToPath(new URL("./__batch_outcome_entry__.jsx", import.meta.url));
  const file = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)));
  const source = `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { InventoryAddModal } from ${file("./inventory_add_modal.tsx")};
    import { buildBambuFilamentCodeBatch, buildBambuFilamentCodeBatchCreateState } from ${file("../lib/bambu_filament_code_batch.ts")};
    import { I18nContext } from ${file("../lib/i18n.ts")};
    import { formatMessage } from ${file("../../../src-tauri/companion_browser/message_format.js")};
    import ${file("../index.css")};
    const master = { id: "qa-master", vendor: "Bambu Lab", material: "TPU", filament_name: "TPU",
      color_name: "Yellow (53400)", hex_color: "#FACC15", default_weight: 1000 };
    const rows = [{label:"TPU · Yellow", code:"53400"}, {label:"TPU · Yellow", code:"53400"}];
    const initialInput = "53400\\n53400\\n99999";
    const original = {status:"SAVING",batchId:"captured-batch",rows,spoolIds:[],remainingCount:1,error:null};
    let state = { registration:null, busy:false, catalog:"READY", input:initialInput, error:null, open:false };
    const calls = { creates:0, retries:0, newBatches:0, opened:[], inputChanges:0, parentClose:0 };
    window.batchScan = { detectorClosed:0, trackStopped:0, imageStarted:false, cameraRequested:false };
    const t = (key, fallback = "", params = {}) => formatMessage(fallback, params, "en");
    const i18n = { locale:"en",setLocale:()=>{},t };
    const noOp = () => {};
    const root = createRoot(document.getElementById("root"));
    function render() {
      const batch = buildBambuFilamentCodeBatch({masters:[master],rawInput:state.input});
      const createState = buildBambuFilamentCodeBatchCreateState({batch,tauriAvailable:true,busy:state.busy,isBambuMode:true,initialWeightValid:true,borrowedOwnerRequired:false});
      root.render(<I18nContext.Provider value={i18n}>
        <button data-testid="background-inventory" onClick={()=>update({open:true})}>Background Inventory</button>
        <InventoryAddModal activeCatalogMasters={[master]} bambuBatchInput={state.input}
          bambuBatchCreateState={createState} bambuCodeBatch={batch}
          batchRegistration={state.registration} batchBusy={state.busy}
          borrowedFromContact="" borrowedFromName="" borrowedInNote=""
          busy={state.busy} createdSpool={null} catalogLoadState={state.catalog}
          catalogMasterById={new Map([[master.id,master]])} catalogQuery="" createMode="bambu"
          disabledBambuBatchCreate={createState.disabled} disabledCreate={false} disabledWishlistCreate={false}
          error={state.error} infoMessage={null} initialWeight="1000" isCatalogCreateMode location="QA Dry box"
          manualColorName="" manualFilamentName="" manualHexColor="" manualMaterial="PLA" manualVendor="Generic"
          onAddCurrentToWishlist={noOp} onBorrowedFromContactChange={noOp} onBorrowedFromNameChange={noOp}
          onBorrowedInNoteChange={noOp} onBambuBatchInputChange={value=>{calls.inputChanges++;update({input:value});}}
          onBambuBatchRowSelectionChange={noOp} onCatalogQueryChange={noOp}
          onClose={()=>{calls.parentClose++;update({open:false});}}
          onCreateBambuCodeBatch={()=>{calls.creates++;update({registration:original,busy:true});}}
          onRetryBambuBatch={()=>{calls.retries++;update({registration:{...state.registration,status:"SAVING"},busy:true});}}
          onNewBambuBatch={()=>{calls.newBatches++;update({input:state.registration.status==="COMPLETE"?"99999":initialInput,registration:null,catalog:"READY",error:null});}}
          onOpenBambuBatchSpool={id=>calls.opened.push(id)} onCreateModeChange={noOp} onCreateSpool={noOp}
          onInitialWeightChange={noOp} onLocationChange={noOp} onManualColorNameChange={noOp}
          onManualFilamentNameChange={noOp} onManualHexColorChange={noOp} onManualMaterialChange={noOp}
          onManualVendorChange={noOp} onOwnershipTypeChange={noOp} onOpenCreatedSpool={noOp}
          onRegisterAnotherSpool={noOp} onRetryCatalog={noOp} onSelectCatalogMaster={noOp}
          onUseManualFromCatalog={noOp} open={state.open} ownershipType="OWNED" purpose="STOCK"
          resolvedTheme="light" selectedCatalogMasterId={master.id} tauriAvailable />
      </I18nContext.Provider>);
    }
    function update(next) { state={...state,...next};flushSync(render); }
    window.batchUI = {
      update,
      outcome:(status,extra={})=>update({registration:{...original,status,...extra},busy:status==="SAVING"}),
      inspect:()=>({state,calls,scan:window.batchScan}),
      finishImage:()=>window.batchScan.finishImage({status:"ready",append:{input:"LATE IMAGE",appendedCodeLines:["53400"],appendedReviewLines:[],ignoredLines:[]}}),
      finishCamera:()=>window.batchScan.finishCamera({getTracks:()=>[{stop:()=>window.batchScan.trackStopped++}]}),
    };
    flushSync(render);
  `;
  const scanModules: Record<string, string> = {
    "\0batch-test-image": `export function scanBambuFilamentCodesFromImage(){window.batchScan.imageStarted=true;return new Promise(resolve=>window.batchScan.finishImage=resolve);}`,
    "\0batch-test-camera": `
      export function bambuFilamentCodeCameraScanSupport(){return {available:true};}
      export async function createBambuFilamentCodeCameraDetector(){return {close:()=>window.batchScan.detectorClosed++};}
      export function requestBambuFilamentCodeCameraStream(){window.batchScan.cameraRequested=true;return new Promise(resolve=>window.batchScan.finishCamera=resolve);}
      export async function scanBambuFilamentCodeCameraFrame(){return {status:"no_barcode"};}
      export function appendBambuFilamentCodeCameraScanValues(){throw new Error("Unexpected scan");}
    `,
  };
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") }, logLevel: "error",
    plugins: [{ name: "batch-outcome-harness", enforce: "pre",
      resolveId: (id: string) => id === entry ? entry
        : id.endsWith("/bambu_filament_code_image_scan") ? "\0batch-test-image"
          : id.endsWith("/bambu_filament_code_camera_scan") ? "\0batch-test-camera" : null,
      load: (id: string) => id === entry ? source : scanModules[id] ?? null }, react(), tailwindcss()],
    build: { write: false, minify: false, cssCodeSplit: false, emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "BatchOutcome" } },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
  const script = outputs.find(output => output.type === "chunk" && output.isEntry)?.code;
  const css = outputs.filter(output => output.type === "asset" && output.fileName.endsWith(".css"))
    .map(output => typeof output.source === "string" ? output.source : new TextDecoder().decode(output.source)).join("\n");
  assert.ok(script);
  return `<html><head><meta charset="utf-8"><style>${css.replaceAll("</style", "<\\/style")}</style></head><body><div id="previously-inert" inert><button>Previously hidden</button></div><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

const batchDialog = (page: Page) => page.getByRole("dialog", { name: "Batch add from boxes", exact: true });

test("batch receipt controls preserve authority and scanner lifecycle in the real modal", async context => {
  const document = await buildHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    async function scenario(name: string, run: (page: Page) => Promise<void>) {
      await context.test(name, async () => {
        const page = await browser.newPage({viewport:{width:1200,height:800}});
        page.setDefaultTimeout(5_000);
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.route("http://localhost/**", route => route.fulfill({contentType:"text/html",body:document}));
          await page.goto("http://localhost/batch-outcomes");
          await page.getByTestId("background-inventory").click();
          await page.getByRole("button", {name:"Batch add from boxes",exact:true}).click();
          await run(page);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      });
    }

    await scenario("saving traps focus; uncertain closes and reopens through a failed catalog reload", async page => {
      await batchDialog(page).getByRole("button", {name:/Add ready matches/}).click();
      await batchDialog(page).getByText("Saving 2 rolls...").waitFor();
      assert.equal(await batchDialog(page).getByRole("button", {name:"Close",exact:true}).isDisabled(), true);
      assert.equal(await batchDialog(page).locator("textarea,input").count(), 0);
      assert.equal(await page.evaluate("document.activeElement?.closest('[role=dialog]')?.getAttribute('aria-labelledby') === document.querySelectorAll('[role=dialog]')[1].getAttribute('aria-labelledby')"), true);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Escape");
      assert.equal(await batchDialog(page).count(), 1);
      await page.evaluate("batchUI.update({catalog:'LOADING'});batchUI.outcome('UNCERTAIN',{error:'Connection lost'})");
      await batchDialog(page).getByRole("button", {name:"Continue same batch",exact:true}).waitFor();
      assert.equal(await batchDialog(page).getByText("Connection lost", {exact:true}).count(), 1);
      assert.equal(await batchDialog(page).getByRole("button", {name:"Start new batch",exact:true}).count(), 0);
      await batchDialog(page).getByRole("button", {name:"Close",exact:true}).click();
      await page.evaluate("batchUI.update({catalog:'ERROR'})");
      assert.equal(await page.getByLabel("Home location").isDisabled(), true);
      assert.equal(await page.getByRole("button", {name:"Add spool to inventory",exact:true}).isDisabled(), true);
      await page.getByRole("button", {name:"Batch add from boxes",exact:true}).click();
      await batchDialog(page).getByRole("button", {name:"Continue same batch",exact:true}).click();
      const result = await page.evaluate("batchUI.inspect()");
      assert.equal(result.calls.creates, 1);
      assert.equal(result.calls.retries, 1);
      assert.equal(result.state.registration.batchId, "captured-batch");
      assert.equal(result.calls.newBatches, 0);
    });

    await scenario("duplicate-code receipts open exact IDs and only explicit New returns unsubmitted rows", async page => {
      await page.evaluate("batchUI.outcome('COMPLETE',{spoolIds:['saved-first','saved-second']})");
      await batchDialog(page).getByRole("button", {name:"Open roll: 1. TPU · Yellow",exact:true}).click();
      await batchDialog(page).getByRole("button", {name:"Open roll: 2. TPU · Yellow",exact:true}).click();
      assert.deepEqual((await page.evaluate("batchUI.inspect()")).calls.opened, ["saved-first","saved-second"]);
      await batchDialog(page).getByRole("button", {name:"Close",exact:true}).click();
      assert.equal(await page.getByLabel("Home location").isDisabled(), true);
      await page.getByRole("button", {name:"Batch add from boxes",exact:true}).click();
      for (const viewport of [{width:1200,height:600},{width:600,height:400}]) {
        await page.setViewportSize(viewport);
        const bounds = await batchDialog(page).boundingBox();
        const footer = await batchDialog(page).getByRole("button", {name:"Start new batch",exact:true}).boundingBox();
        assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1);
        assert.ok(footer && footer.y >= 0 && footer.y + footer.height <= viewport.height + 1);
      }
      await batchDialog(page).getByRole("button", {name:"Start new batch",exact:true}).click();
      assert.equal(await batchDialog(page).getByLabel("Codes in this batch", {exact:true}).inputValue(), "99999");
      const result = await page.evaluate("batchUI.inspect()");
      assert.equal(result.calls.newBatches, 1);
      assert.equal(result.calls.creates, 0);
      assert.equal(result.state.registration, null);
    });

    await scenario("rejection returns to edit without a write and pre-send failures stay in the portal", async page => {
      await page.evaluate("batchUI.outcome('REJECTED',{error:'Invalid location'})");
      await batchDialog(page).getByRole("button", {name:"Edit batch",exact:true}).click();
      assert.equal(await batchDialog(page).getByLabel("Codes in this batch", {exact:true}).inputValue(), "53400\n53400\n99999");
      await page.evaluate("batchUI.update({error:'Could not save pending batch.'})");
      assert.equal(await batchDialog(page).getByText("Could not save pending batch.", {exact:true}).count(), 1);
      assert.equal((await page.evaluate("batchUI.inspect()")).calls.creates, 0);
    });

    await scenario("submitting unmounts camera ownership and ignores a late image result", async page => {
      await batchDialog(page).locator('input[type="file"]').setInputFiles({name:"synthetic-label.png",mimeType:"image/png",buffer:Buffer.from("synthetic")});
      await page.waitForFunction("batchScan.imageStarted");
      await batchDialog(page).getByRole("button", {name:"Use webcam",exact:true}).click();
      await page.waitForFunction("batchScan.cameraRequested");
      await page.evaluate("batchUI.outcome('SAVING')");
      await page.waitForFunction("batchScan.detectorClosed === 1");
      await page.evaluate("batchUI.finishImage();batchUI.finishCamera()");
      await page.waitForFunction("batchScan.trackStopped === 1");
      assert.equal((await page.evaluate("batchUI.inspect()")).calls.inputChanges, 0);
      await page.evaluate("batchUI.outcome('REJECTED',{error:'Not stored'})");
      await batchDialog(page).getByRole("button", {name:"Edit batch",exact:true}).click();
      assert.equal(await batchDialog(page).getByLabel("Codes in this batch", {exact:true}).inputValue(), "53400\n53400\n99999");
    });

    for (const [status, action] of [["COMPLETE", "Start new batch"], ["REJECTED", "Edit batch"]]) {
      await scenario(`${action} retains focus in the batch draft`, async page => {
        await page.evaluate(`batchUI.outcome(${JSON.stringify(status)},{spoolIds:['saved-first','saved-second']})`);
        await batchDialog(page).getByRole("button", {name:action,exact:true}).click();
        assert.equal(await batchDialog(page).evaluate(element => element.contains(document.activeElement)), true,
          "Removing the focused outcome button must move focus into the replacement draft");
        await page.keyboard.press("Tab");
        assert.equal(await batchDialog(page).evaluate(element => element.contains(document.activeElement)), true);
      });

      await scenario(`${action} keeps the Inventory and parent Add modal out of the accessibility tree`, async page => {
        await page.evaluate(`batchUI.outcome(${JSON.stringify(status)},{spoolIds:['saved-first','saved-second']})`);
        await batchDialog(page).getByRole("button", {name:action,exact:true}).click();
        const cdp = await page.context().newCDPSession(page);
        const { nodes } = await cdp.send("Accessibility.getFullAXTree");
        const visible = nodes.filter(node => !node.ignored);
        const dialogs = visible.filter(node => node.role?.value === "dialog").map(node => node.name?.value);
        const closeButtons = visible.filter(node => node.role?.value === "button" && node.name?.value === "Close");
        assert.deepEqual(dialogs, ["Batch add from boxes"]);
        assert.equal(closeButtons.length, 1);
        assert.equal(visible.some(node => node.name?.value === "Background Inventory"), false);
        await page.getByTestId("background-inventory").evaluate(element => element.focus());
        assert.equal(await batchDialog(page).evaluate(element => element.contains(document.activeElement)), true,
          "The inert background must reject focus while the batch remains open");
        await cdp.detach();
      });
    }

    await scenario("closing restores parent interaction and preserves pre-existing inert state", async page => {
      assert.equal(await page.evaluate("document.getElementById('root').inert"), true);
      await batchDialog(page).getByRole("button", {name:"Close",exact:true}).click();
      assert.equal(await page.evaluate("document.getElementById('root').inert"), false);
      assert.equal(await page.evaluate("document.getElementById('previously-inert').inert"), true);
      assert.equal(await page.getByRole("dialog", {name:"Add filament",exact:true}).count(), 1);
      assert.equal(await page.getByRole("dialog", {name:"Add filament",exact:true}).evaluate(element => element.contains(document.activeElement)), true,
        "Closing the nested batch must return focus into the now-interactive parent");
      assert.equal(await page.evaluate("document.activeElement?.getAttribute('type')"), "search");
      await page.getByRole("button", {name:"Batch add from boxes",exact:true}).click();
      await page.evaluate("batchUI.update({open:false})");
      assert.equal(await page.evaluate("document.getElementById('root').inert"), false);
      assert.equal(await page.evaluate("document.getElementById('previously-inert').inert"), true);
      assert.equal(await page.evaluate("document.activeElement?.getAttribute('data-testid')"), "background-inventory",
        "Unmounting both dialogs must restore the original Inventory opener after inert cleanup");
      const cdp = await page.context().newCDPSession(page);
      const {nodes} = await cdp.send("Accessibility.getFullAXTree");
      const visible = nodes.filter(node => !node.ignored);
      assert.equal(visible.some(node => node.name?.value === "Background Inventory"), true);
      assert.equal(visible.some(node => node.name?.value === "Previously hidden"), false);
      await cdp.detach();
    });
  } finally { await browser.close(); }
});
