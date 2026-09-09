import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";

async function buildHarness() {
  const requireFromUi = createRequire(new URL("../../package.json", import.meta.url));
  const [{ build }, { default: react }, { default: tailwindcss }] = await Promise.all([
    import(pathToFileURL(requireFromUi.resolve("vite")).href),
    import(pathToFileURL(requireFromUi.resolve("@vitejs/plugin-react")).href),
    import(pathToFileURL(requireFromUi.resolve("@tailwindcss/vite")).href),
  ]);
  const entry = fileURLToPath(new URL("./__wishlist_lifecycle_entry__.jsx", import.meta.url));
  const file = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)));
  const source = `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { InventoryPageWorkspace } from ${file("./inventory_page_workspace.tsx")};
    import { I18nContext } from ${file("../lib/i18n.ts")};
    import { formatMessage } from ${file("../../../src-tauri/companion_browser/message_format.js")};
    import ${file("../index.css")};

    const noOp = () => {};
    const i18n = {locale:"en",setLocale:noOp,t:(_key,fallback="",params={})=>formatMessage(fallback,params,"en")};
    const item = {id:"same-wishlist-id",master_id:null,material:"PLA",filament_name:"Test roll",
      color_name:"Blue",vendor:"Generic",status:"ON_ORDER",quantity:3,note:null,
      created_at:"2026-09-09 10:00:00",updated_at:"2026-09-09 10:00:00"};
    let authority = "host-a";
    const pending = [];
    const calls = [];
    const root = createRoot(document.getElementById("root"));
    function render() {
      const capturedAuthority = authority;
      const purchaseQueueProps = {
        authorityKey:capturedAuthority,addPurchaseDisabled:false,busy:false,catalogMasterById:new Map(),
        confirmWishlistRemoveId:null,defaultPurchaseCurrency:"NOK",items:[item],loading:false,
        onAddPurchase:noOp,onCancelDeleteItem:noOp,onDeleteItem:noOp,onFilterChange:noOp,
        onQueryChange:noOp,onRequestDeleteItem:noOp,onStatusChange:noOp,
        onStockItem:(row,quantity,metadata,homeLocation)=>{
          calls.push({authority:capturedAuthority,itemId:row.id,quantity,metadata,homeLocation});
          return new Promise(resolve=>pending.push(resolve));
        },
        query:"",resolvedTheme:"light",summary:{all:1,wishlist:0,onOrder:1,received:0},
        tauriAvailable:true,value:"ON_ORDER",visibleItems:[item],
      };
      root.render(<I18nContext.Provider value={i18n}>
        <InventoryPageWorkspace activeView="PURCHASES" addModalActive={false} addModalProps={{}}
          bulkActionsProps={{active:false}} bulkSelectionTriggerProps={{active:false,disabled:false,onActiveChange:noOp}}
          clientHostDeviceName={capturedAuthority} clientInventoryPartial={false} clientInventorySource="LIVE"
          clientInventoryUpdatedAt={null} clientReadOnly={false} collectionProps={{}} controlsProps={{}}
          error={null} headerActionsProps={{showStockFilters:false}} infoMessage={null} loadError={null}
          loadErrorRetryDisabled={false} loadErrorRetrying={false} librarySyncReady loading={false}
          locationPanelProps={{}} onActiveViewChange={noOp} onRetryLoadError={noOp}
          purchaseQueueProps={purchaseQueueProps} showRollModal={false}
          totalInventoryCount={0} totalLocationCount={0} totalPurchaseCount={1}/>
      </I18nContext.Provider>);
    }
    window.receiptUI = {
      switchHost:next=>{authority=next;flushSync(render);},
      calls:()=>calls,
      settle:async(index,succeeded)=>{
        pending[index](succeeded);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      },
    };
    flushSync(render);
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)),
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "error",
    plugins: [{
      name: "wishlist-lifecycle-harness",
      enforce: "pre",
      resolveId: (id: string) => id === entry ? entry : null,
      load: (id: string) => id === entry ? source : null,
    }, react(), tailwindcss()],
    build: {
      write: false, minify: false, cssCodeSplit: false, emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "WishlistLifecycle" },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
  const script = outputs.find(output => output.type === "chunk" && output.isEntry)?.code;
  const css = outputs.filter(output => output.type === "asset" && output.fileName.endsWith(".css"))
    .map(output => typeof output.source === "string" ? output.source : new TextDecoder().decode(output.source)).join("\n");
  assert.ok(script);
  return `<html><head><meta charset="utf-8"><style>${css.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

const receiptDialog = (page: Page) => page.getByRole("dialog", { name: "Receive purchase", exact: true });
const receiveButton = (page: Page) => receiptDialog(page).getByRole("button", { name: /^Receive \d+ rolls?$/ });

async function openReceipt(page: Page) {
  await page.getByRole("button", { name: "Stock roll now", exact: true }).click();
  await receiptDialog(page).waitFor();
}

async function fillReceipt(page: Page, homeLocation: string, quantity = "2") {
  await receiptDialog(page).getByLabel("Received quantity", { exact: true }).fill(quantity);
  await receiptDialog(page).locator('[name="home_location"]').fill(homeLocation);
  await receiptDialog(page).locator('[name="purchase_price"]').fill("125");
  assert.equal(await receiptDialog(page).locator('[name="purchase_currency"]').inputValue(), "NOK");
}

async function assertEmptyReceipt(page: Page) {
  assert.equal(await receiptDialog(page).getByLabel("Received quantity", { exact: true }).inputValue(), "1");
  for (const name of ["home_location", "purchase_price", "purchase_currency"]) {
    assert.equal(await receiptDialog(page).locator(`[name="${name}"]`).inputValue(), "", name);
  }
  assert.equal(await receiveButton(page).isDisabled(), false);
}

test("purchase receipt drafts and pending submissions stay within their workspace authority", async context => {
  const document = await buildHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    async function scenario(name: string, run: (page: Page) => Promise<void>) {
      await context.test(name, async () => {
        const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.route("http://localhost/**", route => route.fulfill({ contentType: "text/html", body: document }));
          await page.goto("http://localhost/wishlist-lifecycle");
          await run(page);
          assert.deepEqual(errors, []);
        } finally {
          await page.close();
        }
      });
    }

    await scenario("A to B to A discards metadata and quantity even for an identical wishlist ID", async page => {
      await openReceipt(page);
      await fillReceipt(page, "Host A dry box");
      await page.evaluate("receiptUI.switchHost('host-b')");
      assert.equal(await receiptDialog(page).count(), 0);
      await openReceipt(page);
      await assertEmptyReceipt(page);
      await fillReceipt(page, "Host B shelf", "3");
      await page.evaluate("receiptUI.switchHost('host-a')");
      assert.equal(await receiptDialog(page).count(), 0);
      await openReceipt(page);
      await assertEmptyReceipt(page);
      assert.deepEqual(await page.evaluate("receiptUI.calls()"), []);
    });

    await scenario("a late Host A success cannot close or overwrite the Host B draft", async page => {
      await openReceipt(page);
      await fillReceipt(page, "Host A dry box");
      await receiveButton(page).click();
      assert.equal(await receiveButton(page).isDisabled(), true);
      await page.evaluate("receiptUI.switchHost('host-b')");
      assert.equal(await receiptDialog(page).count(), 0);
      await openReceipt(page);
      await fillReceipt(page, "Host B shelf", "3");
      await page.evaluate("receiptUI.settle(0, true)");
      assert.equal(await receiptDialog(page).count(), 1);
      assert.equal(await receiptDialog(page).locator('[name="home_location"]').inputValue(), "Host B shelf");
      assert.equal(await receiptDialog(page).getByLabel("Received quantity", { exact: true }).inputValue(), "3");
      assert.equal(await receiveButton(page).isDisabled(), false);
      const calls = await page.evaluate("receiptUI.calls()");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].authority, "host-a");
      assert.equal(calls[0].homeLocation, "Host A dry box");
    });

    await scenario("a late Host A result cannot unlock a pending Host B submission", async page => {
      await openReceipt(page);
      await fillReceipt(page, "Host A dry box");
      await receiveButton(page).click();
      await page.evaluate("receiptUI.switchHost('host-b')");
      await openReceipt(page);
      await fillReceipt(page, "Host B shelf", "3");
      await receiveButton(page).click();
      await page.evaluate("receiptUI.settle(0, true)");
      assert.equal(await receiptDialog(page).count(), 1);
      assert.equal(await receiveButton(page).isDisabled(), true);
      assert.equal(await receiptDialog(page).getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true);
      assert.equal(await receiptDialog(page).locator('[name="home_location"]').isDisabled(), true);
      await page.keyboard.press("Escape");
      assert.equal(await receiptDialog(page).count(), 1);
      assert.equal((await page.evaluate("receiptUI.calls()")).length, 2);

      await page.evaluate("receiptUI.settle(1, false)");
      assert.equal(await receiveButton(page).isDisabled(), false);
      assert.equal(await receiptDialog(page).locator('[name="home_location"]').inputValue(), "Host B shelf");
      assert.equal(await receiptDialog(page).getByLabel("Received quantity", { exact: true }).inputValue(), "3");
      await receiveButton(page).click();
      const calls = await page.evaluate("receiptUI.calls()");
      assert.deepEqual(calls.map((call: { authority: string }) => call.authority), ["host-a", "host-b", "host-b"]);
      assert.equal(calls[1].itemId, calls[0].itemId);
      assert.deepEqual(calls[2], calls[1]);
      await page.evaluate("receiptUI.settle(2, true)");
      assert.equal(await receiptDialog(page).count(), 0);
      await openReceipt(page);
      await assertEmptyReceipt(page);
    });

    await scenario("same-turn receive, cancel and reopen clicks keep one submission pending", async page => {
      await openReceipt(page);
      await fillReceipt(page, "Host A dry box");
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
        const receive = buttons.find(button => /^Receive 2 rolls$/.test(button.textContent ?? ""));
        const cancel = buttons.find(button => button.textContent === "Cancel");
        const reopen = buttons.find(button => button.textContent === "Stock roll now");
        if (!receive || !cancel || !reopen) throw new Error("Receipt controls missing");
        receive.click();
        receive.click();
        cancel.click();
        reopen.click();
      });
      assert.equal((await page.evaluate("receiptUI.calls()")).length, 1);
      assert.equal(await receiptDialog(page).count(), 1);
      assert.equal(await receiveButton(page).isDisabled(), true);
      assert.equal(await receiptDialog(page).locator('[name="home_location"]').inputValue(), "Host A dry box");
      await page.evaluate("receiptUI.settle(0, true)");
      assert.equal(await receiptDialog(page).count(), 0);
    });
  } finally {
    await browser.close();
  }
});
