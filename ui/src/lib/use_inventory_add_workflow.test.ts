import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { chromium, type Page } from "playwright";

async function buildWorkflowHarness() {
  const requireFromUi = createRequire(new URL("../../package.json", import.meta.url));
  const [{ build }, { default: react }, { default: tailwindcss }] = await Promise.all([
    import(pathToFileURL(requireFromUi.resolve("vite")).href),
    import(pathToFileURL(requireFromUi.resolve("@vitejs/plugin-react")).href),
    import(pathToFileURL(requireFromUi.resolve("@tailwindcss/vite")).href),
  ]);
  const entry = fileURLToPath(new URL("./__inventory_add_workflow_entry__.jsx", import.meta.url));
  const file = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)));
  const source = `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { useInventoryAddWorkflow } from ${file("./use_inventory_add_workflow.ts")};
    import { InventoryAddModal } from ${file("../components/inventory_add_modal.tsx")};
    import { I18nContext } from ${file("./i18n.ts")};
    import { formatMessage } from ${file("../../../src-tauri/companion_browser/message_format.js")};
    import ${file("../index.css")};
    const masters = [
      { id: "bambu-asa", vendor: "Bambu Lab", material: "ASA", filament_name: "ASA",
        color_name: "Marine Blue", hex_color: "#174B72", default_weight: 1000 },
      { id: "esun-petg", vendor: "eSUN", material: "PETG", filament_name: "PETG",
        color_name: "Deep Blue", hex_color: "#164575", default_weight: 1000 },
    ];
    const writes = [], reads = [], opened = [];
    let openAvailable = true, workflow, snapshot, clearFeedback, settledCreates = 0;
    window.__TAURI__ = { invoke: (command, payload) => {
      if (command === "list_master_catalog") return Promise.resolve(masters);
      if (command === "fetch_library_sync_catalog_masters") return Promise.resolve(masters);
      if (command === "create_spool" || command === "create_manual_spool" ||
          command === "create_library_sync_host_spool") {
        return new Promise((resolve, reject) => writes.push({ command, payload, resolve, reject }));
      }
      return Promise.reject(new Error("Unexpected harness command: " + command));
    } };
    const t = (key, fallback = "", params = {}) => formatMessage(fallback, params, "en");
    const i18n = { locale: "en", setLocale: () => {}, t };
    const reloadSpools = () => new Promise(resolve => reads.push(resolve));
    const reloadWishlist = async () => {};
    const allow = () => true, ignore = () => {};
    function Harness({ host = null, generation = 1 }) {
      const [error, setError] = useState(null);
      const [infoMessage, setInfoMessage] = useState(null);
      clearFeedback = () => setInfoMessage(null);
      workflow = useInventoryAddWorkflow({
        canUseClientHostWrite: allow,
        clientHostBaseUrl: host ? "http://" + host : null,
        clientLibraryId: host ? "library-" + host : null,
        clientReadOnly: Boolean(host), clientTargetGeneration: generation,
        defaultPurchaseCurrency: "", ensureLocalWriteAllowed: allow,
        error, infoMessage, librarySyncReady: true,
        onOpenPurchaseQueue: ignore, onOpenCreatedSpool: id => {
          opened.push(id);
          if (!openAvailable) setError("Failed to load inventory.");
          return openAvailable;
        },
        purchaseActionsDisabled: false, reloadSpools, reloadWishlist,
        resolvedTheme: "light", setError, setInfoMessage,
        setRecentlyAddedSpoolId: ignore, setSelectedSpoolId: ignore,
        tauriAvailable: true, t, wishlistItems: [], wishlistLoading: false,
      });
      snapshot = { busy: workflow.modalProps.busy, open: workflow.modalProps.open,
        receipt: workflow.modalProps.createdSpool, infoMessage, error };
      return <I18nContext.Provider value={i18n}>
        <button onClick={() => workflow.openAddModal()}>Open registration</button>
        <InventoryAddModal {...workflow.modalProps} onCreateSpool={() => {
          Promise.resolve(workflow.modalProps.onCreateSpool()).finally(() => { settledCreates += 1; });
        }} />
      </I18nContext.Provider>;
    }
    const root = createRoot(document.getElementById("root"));
    window.registrationWorkflow = {
      render: options => flushSync(() => root.render(<Harness {...options} />)),
      snapshot: () => ({ ...snapshot, opened: [...opened], writes: writes.map(({command,payload}) => ({command,payload})) }),
      completeWrite: (index, id = "host-authoritative-id") => writes[index].resolve(id),
      rejectWrite: index => writes[index].reject(new Error("Write rejected")),
      completeRead: index => reads[index](),
      readCount: () => reads.length,
      settledCreates: () => settledCreates,
      clearFeedback: () => flushSync(clearFeedback),
      allowOpen: available => { openAvailable = available; },
      callOpen: id => flushSync(() => workflow.modalProps.onOpenCreatedSpool(id)),
    };
    window.registrationWorkflow.render({});
  `;
  const result = await build({
    root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") }, logLevel: "error",
    plugins: [{ name: "registration-workflow-harness", resolveId: (id: string) => id === entry ? entry : null,
      load: (id: string) => id === entry ? source : null }, react(), tailwindcss()],
    build: { write: false, minify: false, cssCodeSplit: false, emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "RegistrationWorkflow" } },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => result.output);
  const script = outputs.find(output => output.type === "chunk" && output.isEntry)?.code;
  const css = outputs.filter(output => output.type === "asset" && output.fileName.endsWith(".css"))
    .map(output => typeof output.source === "string" ? output.source : new TextDecoder().decode(output.source)).join("\n");
  assert.ok(script);
  return `<html><head><meta charset="utf-8"><style>${css.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
}

async function readyForm(page: Page) {
  await page.getByRole("button", { name: "Open registration", exact: true }).click();
  await page.waitForFunction("!registrationWorkflow.snapshot().busy");
  await page.getByRole("button", { name: "Batch add from boxes", exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[aria-label="Batch add from boxes"]')?.disabled);
}

async function finishCreate(page: Page, index: number, id?: string) {
  await page.evaluate(`registrationWorkflow.completeWrite(${index}, ${JSON.stringify(id ?? "host-authoritative-id")})`);
  await page.waitForFunction(`registrationWorkflow.readCount() === ${index + 1}`);
  await page.evaluate(`registrationWorkflow.completeRead(${index})`);
  await page.waitForFunction("!registrationWorkflow.snapshot().busy");
  await page.getByRole("button", { name: "Open roll", exact: true }).waitFor();
}

test("real registration modal keeps a durable receipt and explicit safe next actions", async context => {
  const document = await buildWorkflowHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    async function scenario(name: string, run: (page: Page) => Promise<void>) {
      await context.test(name, async () => {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
        page.setDefaultTimeout(5_000);
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.route("http://localhost/**", route => route.fulfill({ contentType: "text/html", body: document }));
          await page.goto("http://localhost/registration-workflow");
          await run(page);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      });
    }

    await scenario("busy controls freeze; committed receipt survives feedback expiry and failed Open lookup", async page => {
      await readyForm(page);
      await page.getByLabel("Home location").fill("QA Dry box");
      await page.getByRole("button", { name: "Add spool to inventory", exact: true }).click();
      await page.waitForFunction("registrationWorkflow.snapshot().writes.length === 1");
      for (const label of ["Initial weight (g)", "Home location"]) {
        assert.equal(await page.getByLabel(label).isDisabled(), true);
      }
      for (const name of ["Bambu", "eSUN", "Generic", "Batch add from boxes", "Close"]) {
        assert.equal(await page.getByRole("button", { name, exact: true }).isDisabled(), true);
      }
      assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.contains(document.activeElement)"), true,
        "disabling the form must keep keyboard focus inside the pending registration dialog");
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.contains(document.activeElement)"), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 1);
      await page.evaluate("registrationWorkflow.completeWrite(0)");
      await page.waitForFunction("registrationWorkflow.readCount() === 1");
      await page.getByRole("status").waitFor();
      assert.equal(await page.getByRole("status").count(), 1);
      assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.contains(document.activeElement)"), true,
        "replacing the focused form must keep keyboard focus inside the busy success dialog");
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate("document.querySelector('[role=dialog]')?.contains(document.activeElement)"), true);
      assert.equal(await page.getByRole("button", { name: "Open roll", exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole("button", { name: "Register another roll", exact: true }).isDisabled(), true);
      assert.equal(await page.getByText("Choose a vendor flow, pick a filament, then confirm stock details below.").count(), 0);
      assert.equal(await page.getByLabel("Home location").count(), 0);
      assert.equal(await page.getByRole("button", { name: "Batch add from boxes", exact: true }).count(), 0);
      await page.evaluate("registrationWorkflow.completeRead(0)");
      await page.waitForFunction("!registrationWorkflow.snapshot().busy");
      const committed = await page.evaluate("registrationWorkflow.snapshot()");
      assert.equal(committed.receipt.spoolId, committed.writes[0].payload.input.id);
      assert.match(committed.receipt.message, /ASA.*Marine Blue/);
      assert.equal(await page.evaluate("document.activeElement?.textContent"), "Open roll");
      for (const viewport of [{ width: 1200, height: 600 }, { width: 600, height: 400 }]) {
        await page.setViewportSize(viewport);
        const dialog = await page.getByRole("dialog").boundingBox();
        assert.ok(dialog && dialog.y >= 0 && dialog.y + dialog.height <= viewport.height + 1);
        await page.getByRole("button", { name: "Register another roll", exact: true }).scrollIntoViewIfNeeded();
        const button = await page.getByRole("button", { name: "Register another roll", exact: true }).boundingBox();
        assert.ok(button && button.y >= 0 && button.y + button.height <= viewport.height + 1);
      }
      await page.evaluate("registrationWorkflow.clearFeedback(); registrationWorkflow.allowOpen(false)");
      assert.equal(await page.getByRole("status").innerText(), committed.receipt.message);
      await page.getByRole("button", { name: "Open roll", exact: true }).click();
      assert.equal(await page.getByRole("dialog").count(), 1);
      assert.equal(await page.getByRole("status").innerText(), committed.receipt.message);
      assert.equal(await page.getByText("Failed to load inventory.", { exact: true }).count(), 1);
      await page.evaluate("registrationWorkflow.callOpen('unrelated-id')");
      assert.deepEqual((await page.evaluate("registrationWorkflow.snapshot()")).opened, [committed.receipt.spoolId]);
      await page.evaluate("registrationWorkflow.allowOpen(true)");
      await page.getByRole("button", { name: "Open roll", exact: true }).click();
      assert.equal(await page.getByRole("dialog").count(), 0);
      const final = await page.evaluate("registrationWorkflow.snapshot()");
      assert.equal(final.receipt, null);
      assert.deepEqual(final.opened, [committed.receipt.spoolId, committed.receipt.spoolId]);
      assert.equal(final.writes.length, 1);
      await readyForm(page);
      assert.equal(await page.getByRole("status").count(), 0);
    });

    for (const mode of ["Bambu", "eSUN", "Generic"]) {
      await scenario(`${mode}: Another requires an explicit second submit and preserves only the existing reset draft`, async page => {
        await readyForm(page);
        await page.getByRole("button", { name: mode, exact: true }).click();
        if (mode === "Generic") {
          await page.getByLabel("Filament name", { exact: true }).fill("QA manual ABS");
          await page.getByLabel("Color name", { exact: true }).fill("QA Orange");
        }
        await page.getByLabel("Initial weight (g)").fill("780");
        await page.getByLabel("Home location").fill("QA Shelf A");
        await page.getByRole("button", { name: "Add spool to inventory", exact: true }).click();
        await finishCreate(page, 0);
        const committed = await page.evaluate("registrationWorkflow.snapshot()");
        await page.getByRole("button", { name: "Register another roll", exact: true }).click();
        assert.equal(await page.getByRole("status").count(), 0);
        assert.equal(await page.getByLabel("Initial weight (g)").inputValue(), "780");
        assert.equal(await page.getByLabel("Home location").inputValue(), "");
        assert.equal(await page.getByLabel("Vendor source", { exact: true }).getByRole("button", { name: mode, exact: true }).getAttribute("aria-pressed"), "true");
        if (mode === "Generic") {
          assert.equal(await page.getByLabel("Filament name", { exact: true }).inputValue(), "QA manual ABS");
          assert.equal(await page.getByLabel("Color name", { exact: true }).inputValue(), "QA Orange");
        }
        assert.equal(await page.evaluate("document.activeElement?.tagName"), "INPUT");
        assert.equal((await page.evaluate("registrationWorkflow.snapshot()")).writes.length, 1);
        await page.getByRole("button", { name: "Add spool to inventory", exact: true }).click();
        await finishCreate(page, 1);
        const next = await page.evaluate("registrationWorkflow.snapshot()");
        assert.equal(next.writes.length, 2);
        assert.notEqual(next.receipt.spoolId, committed.receipt.spoolId);
        await page.getByRole("button", { name: "Close", exact: true }).click();
        assert.equal((await page.evaluate("registrationWorkflow.snapshot()")).receipt, null);
      });
    }

    await scenario("borrowed-in draft survives a rejected write and resets after a committed one", async page => {
      await readyForm(page);
      await page.getByRole("button", { name: "Borrowed in", exact: true }).click();
      await page.getByLabel("Borrowed from", { exact: true }).fill("Sample lender");
      await page.getByLabel("Owner contact (optional)").fill("QA contact");
      await page.getByLabel("Borrowed-in note (optional)").fill("QA note");
      await page.getByLabel("Home location").fill("QA Dry box");
      await page.getByRole("button", { name: "Register borrowed-in spool", exact: true }).click();
      await page.waitForFunction("registrationWorkflow.snapshot().writes.length === 1");
      await page.evaluate("registrationWorkflow.rejectWrite(0)");
      await page.waitForFunction("!registrationWorkflow.snapshot().busy");
      assert.equal((await page.evaluate("registrationWorkflow.snapshot()")).receipt, null);
      assert.equal(await page.getByLabel("Borrowed from", { exact: true }).inputValue(), "Sample lender");
      assert.equal(await page.getByLabel("Home location").inputValue(), "QA Dry box");
      await page.getByRole("button", { name: "Register borrowed-in spool", exact: true }).click();
      await page.waitForFunction("registrationWorkflow.snapshot().writes.length === 2");
      await page.evaluate("registrationWorkflow.completeWrite(1)");
      await page.waitForFunction("registrationWorkflow.readCount() === 1");
      await page.evaluate("registrationWorkflow.completeRead(0)");
      await page.waitForFunction("!registrationWorkflow.snapshot().busy");
      await page.getByRole("button", { name: "Register another roll", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Owned", exact: true }).getAttribute("aria-pressed"), "true");
      assert.equal(await page.getByLabel("Home location").inputValue(), "");
      await page.getByRole("button", { name: "Borrowed in", exact: true }).click();
      for (const label of ["Borrowed from", "Owner contact (optional)", "Borrowed-in note (optional)"]) {
        assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), "");
      }
      assert.equal((await page.evaluate("registrationWorkflow.snapshot()")).writes.length, 2);
    });

    await scenario("Client opens the Host-returned ID and rejects an old A receipt after A to B to A", async page => {
      await page.evaluate("registrationWorkflow.render({host:'host-a',generation:1})");
      await readyForm(page);
      await page.getByRole("button", { name: "Add spool to inventory", exact: true }).click();
      await finishCreate(page, 0, "authoritative-host-created-id");
      await page.getByRole("button", { name: "Open roll", exact: true }).click();
      const committed = await page.evaluate("registrationWorkflow.snapshot()");
      assert.deepEqual(committed.opened, ["authoritative-host-created-id"]);
      assert.equal(committed.writes[0].command, "create_library_sync_host_spool");
      await readyForm(page);
      await page.getByRole("button", { name: "Add spool to inventory", exact: true }).click();
      await page.waitForFunction("registrationWorkflow.snapshot().writes.length === 2");
      await page.evaluate("registrationWorkflow.render({host:'host-b',generation:2})");
      await page.waitForFunction("!registrationWorkflow.snapshot().open");
      await page.evaluate("registrationWorkflow.render({host:'host-a',generation:3})");
      await readyForm(page);
      await page.evaluate("registrationWorkflow.completeWrite(1, 'stale-host-created-id')");
      await page.waitForFunction("registrationWorkflow.settledCreates() === 2");
      const returned = await page.evaluate("registrationWorkflow.snapshot()");
      assert.equal(returned.receipt, null);
      assert.deepEqual(returned.opened, ["authoritative-host-created-id"]);
      assert.equal(await page.getByRole("status").count(), 0);
    });

    await scenario("authority generation discards a visible receipt and an old pending completion", async page => {
      await readyForm(page);
      await page.getByRole("button", { name: "Add spool to inventory", exact: true }).click();
      await finishCreate(page, 0);
      await page.evaluate("registrationWorkflow.render({generation:2})");
      await page.waitForFunction("!registrationWorkflow.snapshot().open");
      assert.equal((await page.evaluate("registrationWorkflow.snapshot()")).receipt, null);
      await readyForm(page);
      await page.getByRole("button", { name: "Add spool to inventory", exact: true }).click();
      await page.waitForFunction("registrationWorkflow.snapshot().writes.length === 2");
      await page.evaluate("registrationWorkflow.render({generation:3})");
      await page.waitForFunction("!registrationWorkflow.snapshot().open");
      await page.evaluate("registrationWorkflow.completeWrite(1)");
      await page.waitForFunction("registrationWorkflow.settledCreates() === 2");
      await readyForm(page);
      const next = await page.evaluate("registrationWorkflow.snapshot()");
      assert.equal(next.receipt, null);
      assert.equal(next.writes.length, 2);
      assert.equal(await page.getByRole("status").count(), 0);
    });
  } finally { await browser.close(); }
});
