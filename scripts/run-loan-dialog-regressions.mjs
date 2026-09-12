import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createVisualQaFixture } from "./create-visual-qa-fixture.mjs";
import { cleanupVisualQaDatabase } from "./visual-qa-db.mjs";
import {
  buildUiBrowserPerformanceFixture,
  resolveUiBrowserPerformanceInvoke,
} from "./ui-browser-performance-probe.mjs";
import {
  createUiViteServer,
  installTauriFixtureBridge,
} from "./run-data-backed-accessibility.mjs";

// Real App, LoansPage and dialogs; only the native bridge is replaced. All data
// comes from the repository's generated synthetic database, never a user library.
function deferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

async function waitForStart(started) {
  let timer;
  try {
    await Promise.race([
      started.promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Expected native call did not start")), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function loanFixture(base) {
  const fixture = structuredClone(base);
  fixture.spoolRows = ["a", "b"].map((id, index) => ({
    ...structuredClone(base.spoolRows[0]),
    spool: {
      ...base.spoolRows[0].spool,
      id: `dialog-spool-${id}`, status: "IN_STOCK", ownership_type: "OWNED",
      remaining_g: 500 - index * 200, current_weight_g: 500 - index * 200,
      spool_tare_weight_g: 200, location_id: `Test shelf ${id}`,
      deleted_at: null, archived_at: null,
    },
    master: { ...base.spoolRows[0].master, vendor: "Generic", filament_name: `Dialog ${id}` },
  }));
  fixture.printerRows = [];
  fixture.loanRows = ["OUTBOUND", "INBOUND"].map((direction) => ({
    ...structuredClone(base.loanRows[0]),
    spool_tare_weight_g: 200, spool_remaining_g: 300,
    loan: {
      ...base.loanRows[0].loan,
      id: `dialog-loan-${direction}`, spool_id: `dialog-return-${direction}`,
      loan_direction: direction, loan_status: "ACTIVE", returned_at: null,
      grams_out: 500, borrower_name: `Test ${direction}`, counterparty_name: `Test ${direction}`,
      expected_return_at: null,
    },
  }));
  fixture.activeLoanRows = fixture.loanRows;
  return fixture;
}

async function runCase(browser, url, base, name, check) {
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const fixture = loanFixture(base);
    const calls = [];
    const errors = [];
    const state = { invoke: null };
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("[loan-regression]")) {
        errors.push(message.text());
      }
    });
    await installTauriFixtureBridge(page, fixture, calls, (data, command, payload) => {
      if (state.invoke) return state.invoke(command, payload);
      return resolveUiBrowserPerformanceInvoke(data, command, payload);
    });
    await page.goto(`${url}/?bfm_locale=en`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Loans", exact: true }).click();
    await page.getByRole("button", { name: "Return", exact: true }).waitFor();
    const fallback = (command, payload) => resolveUiBrowserPerformanceInvoke(fixture, command, payload);
    await check({ page, fixture, calls, state, fallback });
    assert.deepEqual(errors, [], `${name}: unexpected browser errors`);
    process.stdout.write(`  Passed: ${name}\n`);
  } finally {
    await context.close();
  }
}

async function openLoanOut(page) {
  await page.getByRole("button", { name: "Loan out roll", exact: true }).click();
  return page.getByRole("dialog", { name: "Loan out roll" });
}

async function checkReopen({ page, fixture, calls, state, fallback }) {
  let dialog = await openLoanOut(page);
  await dialog.getByRole("spinbutton").fill("600");
  await dialog.getByLabel("Borrower name", { exact: true }).fill("Old borrower");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  fixture.printerRows = [{ printer: { id: "test-printer" }, slots: [{ spool_id: "dialog-spool-a" }] }];
  fixture.spoolRows[0].spool.remaining_g = 300;
  state.invoke = (command, payload) => {
    if (command === "get_printer_settings") throw new Error("[loan-regression] settings failed");
    return fallback(command, payload);
  };
  dialog = await openLoanOut(page);
  await dialog.getByText("Failed to load inventory.", { exact: true }).waitFor();
  assert.equal(await dialog.getByRole("spinbutton").count(), 0, "Failed reopen must discard the old draft");
  assert.match(await dialog.getByRole("alert").innerText(), /Failed to load inventory/);
  assert.equal(await dialog.getByRole("button", { name: "Loan out roll", exact: true }).count(), 0);
  assert.doesNotMatch(await dialog.innerText(), /No rolls are currently available/, "Failure is not an empty inventory");
  assert.equal(calls.filter(({ command }) => command === "lend_spool").length, 0);
  state.invoke = null;
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await dialog.getByRole("spinbutton").waitFor();
  assert.equal(await dialog.getByRole("spinbutton").inputValue(), "500");
  assert.equal(await dialog.getByLabel("Borrower name", { exact: true }).inputValue(), "");
  assert.doesNotMatch(await dialog.innerText(), /Test shelf a/);
  await dialog.getByLabel("Borrower name", { exact: true }).fill("New borrower");
  state.invoke = (command, payload) => {
    if (command === "lend_spool") throw new Error("[loan-regression] loan rejected");
    return fallback(command, payload);
  };
  await dialog.getByRole("button", { name: "Loan out roll", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  const writes = calls.filter(({ command }) => command === "lend_spool");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.input.spool_id, "dialog-spool-b");
  assert.equal(writes[0].payload.input.grams_out, 300);
  assert.equal(await dialog.getByRole("spinbutton").inputValue(), "500");
  assert.equal(await dialog.getByLabel("Borrower name", { exact: true }).inputValue(), "New borrower");
}

async function checkLateLoad({ page, fixture, state, fallback }) {
  const pending = deferred();
  const started = deferred();
  const oldRows = structuredClone(fixture.spoolRows);
  state.invoke = (command, payload) => {
    if (command === "list_spools") { started.resolve(); return pending.promise; }
    return fallback(command, payload);
  };
  let dialog = await openLoanOut(page);
  await waitForStart(started);
  assert.equal(await dialog.getByRole("spinbutton").count(), 0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  fixture.spoolRows = [fixture.spoolRows[1]];
  state.invoke = null;
  dialog = await openLoanOut(page);
  await dialog.getByRole("spinbutton").fill("450");
  pending.resolve(oldRows);
  // A bridge round trip followed by paint drains the old request's continuation.
  await page.evaluate(async () => {
    await window.__TAURI__.invoke("list_printer_overview");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await dialog.getByRole("spinbutton").inputValue(), "450");
  assert.doesNotMatch(await dialog.innerText(), /Test shelf a/);
}

async function checkLendPending({ page, calls, state, fallback }) {
  const pending = deferred();
  const started = deferred();
  const dialog = await openLoanOut(page);
  await dialog.getByLabel("Borrower name", { exact: true }).fill("Test borrower");
  const submit = dialog.getByRole("button", { name: "Loan out roll", exact: true });
  for (const weight of ["", "2.5", "1e3", "9007199254740992"]) {
    await dialog.getByRole("spinbutton").fill(weight);
    await submit.click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(calls.filter(({ command }) => command === "lend_spool").length, 0, weight);
  }
  await dialog.getByRole("spinbutton").fill("600");
  state.invoke = (command, payload) => {
    if (command === "lend_spool") { started.resolve(); return pending.promise; }
    if (command === "list_spool_loans") throw new Error("[loan-regression] refresh failed after save");
    return fallback(command, payload);
  };
  await submit.evaluate((button) => { button.click(); button.click(); });
  await waitForStart(started);
  await page.waitForFunction(() => document.querySelector('[role="dialog"] input[type="number"]')?.disabled);
  assert.equal(await submit.isDisabled(), true);
  assert.equal(await dialog.getByLabel("Borrower name", { exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole("button", { name: "Close", exact: true }).isDisabled(), true);
  await dialog.press("Escape");
  await page.locator(".app-modal-overlay").click({ position: { x: 2, y: 2 } });
  assert.equal(await dialog.count(), 1);
  assert.equal(calls.filter(({ command }) => command === "lend_spool").length, 1);
  pending.resolve({ id: "saved-loan" });
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Failed to load loan data.", { exact: true }).waitFor();
  assert.equal(calls.filter(({ command }) => command === "lend_spool").length, 1);
}

async function checkReturn({ page, calls, state, fallback }, inbound) {
  const command = inbound ? "return_inbound_spool_loan" : "return_spool_loan";
  await page.getByRole("button", { name: inbound ? "Hand back" : "Return", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const grams = dialog.getByRole("spinbutton");
  const note = dialog.getByLabel("Return note (optional)");
  const submit = dialog.getByRole("button", { name: inbound ? "Confirm hand-back" : "Confirm return", exact: true });
  await note.fill("Keep my return note");
  for (const weight of ["", "2.5", "1e3", "9007199254740992"]) {
    await grams.fill(weight);
    await submit.click();
    await dialog.getByRole("alert").waitFor();
    assert.match(await dialog.getByRole("alert").innerText(), /Returned grams/);
    assert.equal(await note.inputValue(), "Keep my return note");
    assert.equal(calls.filter((call) => call.command === command).length, 0);
  }
  await grams.fill("450");
  state.invoke = (name, payload) => {
    if (name === command) throw new Error("[loan-regression] return rejected");
    return fallback(name, payload);
  };
  await submit.click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="alert"]')?.textContent?.startsWith("Failed"));
  assert.match(await dialog.getByRole("alert").innerText(), inbound ? /Failed to hand back/ : /Failed to return/);
  assert.equal(await grams.inputValue(), "450");
  assert.equal(await note.inputValue(), "Keep my return note");
  const writes = calls.filter((call) => call.command === command);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].payload.input, {
    loan_id: `dialog-loan-${inbound ? "INBOUND" : "OUTBOUND"}`,
    returned_grams: 250, note: "Keep my return note",
  });
  const pending = deferred();
  const started = deferred();
  state.invoke = (name, payload) => {
    if (name === command) { started.resolve(); return pending.promise; }
    if (name === "list_spool_loans") throw new Error("[loan-regression] refresh failed after return");
    return fallback(name, payload);
  };
  await submit.evaluate((button) => { button.click(); button.click(); });
  await waitForStart(started);
  await page.waitForFunction(() => document.querySelector('[role="dialog"] input[type="number"]')?.disabled);
  assert.equal(await note.isDisabled(), true);
  for (const close of await dialog.getByRole("button", { name: "Close", exact: true }).all()) {
    assert.equal(await close.isDisabled(), true);
  }
  await dialog.press("Escape");
  await page.locator(".app-modal-overlay").click({ position: { x: 2, y: 2 } });
  assert.equal(await dialog.count(), 1);
  assert.equal(calls.filter((call) => call.command === command).length, 2);
  pending.resolve({ id: "saved-return" });
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Failed to load loan data.", { exact: true }).waitFor();
  assert.equal(calls.filter((call) => call.command === command).length, 2);
}

async function main() {
  const generated = createVisualQaFixture();
  let server;
  let browser;
  try {
    const fixture = buildUiBrowserPerformanceFixture(generated.outputPath);
    server = await createUiViteServer({
      configFile: resolve("ui", "vite.config.ts"), root: resolve("ui"), logLevel: "error",
      server: { host: "127.0.0.1", port: 0, strictPort: false, forwardConsole: false },
    });
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
    const failures = [];
    for (const [name, check] of [
      ["failed reopen clears old selection; retry uses current assignments", checkReopen],
      ["late load cannot overwrite a newly opened draft", checkLateLoad],
      ["lend validation, single submission and refresh failure", checkLendPending],
      ["outbound return errors, draft retention and single submission", (ctx) => checkReturn(ctx, false)],
      ["inbound hand-back errors, draft retention and single submission", (ctx) => checkReturn(ctx, true)],
    ]) {
      try {
        await runCase(browser, url, fixture, name, check);
      } catch (error) {
        failures.push(new Error(name, { cause: error }));
      }
    }
    if (failures.length) throw new AggregateError(failures, "Loan dialog regressions failed");
  } finally {
    try { await browser?.close(); }
    finally {
      try { await server?.close(); }
      finally { cleanupVisualQaDatabase(generated.outputPath); }
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
