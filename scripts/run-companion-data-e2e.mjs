import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { chromium } from "playwright";

import {
  createVisualQaFixture,
} from "./create-visual-qa-fixture.mjs";
import {
  runLaunchedCompanionScreenshotGate,
} from "./run-companion-screenshot-gate.mjs";
import {
  cleanupVisualQaDatabase,
  prepareVisualQaDatabase,
} from "./visual-qa-db.mjs";

export const COMPANION_E2E_LOOPBACK_INTERFACE = Object.freeze({
  address: "127.0.0.1",
  name: "Loopback QA",
});

export const COMPANION_E2E_RECORD = {
  borrower: "Companion QA Borrower",
  colorName: "Signal Violet QA",
  filamentName: "Precision Flow QA",
  initialWeight: 913,
  loanNote: "Companion data E2E loan",
  location: "QA Shelf",
  material: "PLA",
  measuredWeight: 777,
  returnMeasuredWeight: 900,
  returnNote: "Companion data E2E return",
  vendor: "Fixture Works",
};

const companionPageErrors = new WeakMap();

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export function assertCompanionDataE2eOptions(options = {}) {
  if (options.live) {
    throw new Error(
      "Companion data E2E refuses --live. Mutating workflows must use a temporary database copy.",
    );
  }
  if (Object.prototype.hasOwnProperty.call(options, "sourcePath")) {
    throw new Error(
      "Companion data E2E refuses sourcePath/--source. The network-served workflow must start from a generated sanitized fixture.",
    );
  }
  if (Object.prototype.hasOwnProperty.call(options, "interfaces")) {
    throw new Error(
      "Companion data E2E uses a fixed loopback interface; network interfaces cannot be overridden.",
    );
  }
  const databaseDependencyOverride = [
    "cleanupVisualQaDatabase",
    "createVisualQaFixture",
    "prepareVisualQaDatabase",
    "runLaunchedCompanionScreenshotGate",
  ].find((key) => Object.prototype.hasOwnProperty.call(options, key));
  if (databaseDependencyOverride) {
    throw new Error(
      `Companion data E2E refuses the ${databaseDependencyOverride} dependency override. Database creation, copying, launch and cleanup are fixed to the sanitized-fixture workflow.`,
    );
  }
}

export async function findAvailableCompanionDataE2ePort(
  host,
  createServerFn = createServer,
) {
  return new Promise((resolvePort, reject) => {
    const server = createServerFn();
    const fail = (error) => reject(error);
    server.once("error", fail);
    server.listen({ exclusive: true, host, port: 0 }, () => {
      server.off("error", fail);
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
        } else if (!Number.isSafeInteger(port) || port <= 0) {
          reject(new Error("Could not allocate a temporary Companion E2E port."));
        } else {
          resolvePort(port);
        }
      });
    });
    server.unref?.();
  });
}

export function readCompanionDataE2eState(dbPath, record = COMPANION_E2E_RECORD) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const spool = db
      .prepare(
        `SELECT
           spool.id,
           spool.current_weight_g,
           spool.remaining_g,
           spool.status,
           master.material,
           master.filament_name,
           master.color_name,
           master.vendor
         FROM filament_spools AS spool
         JOIN filament_master_list AS master ON master.id = spool.master_id
         WHERE master.vendor = ?
           AND master.material = ?
           AND master.filament_name = ?
           AND master.color_name = ?
         ORDER BY spool.created_at DESC, spool.id DESC
         LIMIT 1`,
      )
      .get(record.vendor, record.material, record.filamentName, record.colorName) ?? null;
    const history = spool
      ? db
          .prepare(
            `SELECT event_type, payload_json, created_at
             FROM spool_history_events
             WHERE spool_id = ?
             ORDER BY created_at DESC, id DESC`,
          )
          .all(spool.id)
      : [];
    const loan = spool
      ? db
          .prepare(
            `SELECT *
             FROM spool_loans
             WHERE spool_id = ? AND borrower_name = ?
             ORDER BY lent_at DESC, id DESC
             LIMIT 1`,
          )
          .get(spool.id, record.borrower) ?? null
      : null;
    return { history, loan, spool };
  } finally {
    db.close();
  }
}

async function waitForDatabaseState(dbPath, predicate, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      lastState = readCompanionDataE2eState(dbPath, options.record);
      if (predicate(lastState)) {
        return lastState;
      }
    } catch {
      // A short write lock is expected while the app commits a workflow step.
    }
    await wait(100);
  }
  throw new Error(
    `Companion data E2E database state did not settle within ${timeoutMs} ms: ${JSON.stringify(lastState)}`,
  );
}

async function openCompanion(page, baseUrl, timeoutMs) {
  await page.goto(new URL("/companion", `${baseUrl}/`).toString(), {
    timeout: timeoutMs,
    waitUntil: "domcontentloaded",
  });
  try {
    await page.locator('[data-root-flow="storage"]').waitFor({
      state: "visible",
      timeout: timeoutMs,
    });
  } catch (error) {
    const browserErrors = companionPageErrors.get(page) ?? [];
    const bodySample = (await page.locator("body").innerText().catch(() => ""))
      .replaceAll(/\s+/g, " ")
      .slice(0, 700);
    throw new Error(
      `Companion inventory navigation did not render. Browser errors: ${browserErrors.join("; ") || "none"}. Body: ${bodySample || "<empty>"}`,
      { cause: error },
    );
  }
  await page.waitForFunction(
    () => !document.body.innerText.includes("Trusted-LAN browser companion"),
    undefined,
    { timeout: timeoutMs },
  );
}

async function reloadCompanion(page, baseUrl, timeoutMs) {
  await openCompanion(page, baseUrl, timeoutMs);
  await page.locator('[data-root-flow="storage"]').click();
  await page.locator('[data-action="select-spool"]').first().waitFor({
    state: "visible",
    timeout: timeoutMs,
  });
}

async function verifyTaskSheetAccessibility(page, sheet, opener, timeoutMs) {
  const semantics = await sheet.evaluate((overlay) => {
    const labelledBy = overlay.getAttribute("aria-labelledby") || "";
    return {
      ariaModal: overlay.getAttribute("aria-modal"),
      label: labelledBy
        ? document.getElementById(labelledBy)?.textContent?.trim() || ""
        : "",
      role: overlay.getAttribute("role"),
    };
  });
  if (
    semantics.role !== "dialog" ||
    semantics.ariaModal !== "true" ||
    !semantics.label
  ) {
    throw new Error(
      `Companion task sheet did not expose a named modal dialog: ${JSON.stringify(semantics)}.`,
    );
  }

  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-action") === "close-task-sheet",
    undefined,
    { timeout: timeoutMs },
  );
  await page.keyboard.press("Shift+Tab");
  const wrappedBackward = await sheet.evaluate(
    (overlay) =>
      overlay.contains(document.activeElement) &&
      document.activeElement?.getAttribute("data-action") !== "close-task-sheet",
  );
  if (!wrappedBackward) {
    throw new Error("Companion task sheet did not wrap Shift+Tab to its final focusable control.");
  }
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-action") === "close-task-sheet",
    undefined,
    { timeout: timeoutMs },
  );

  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached", timeout: timeoutMs });
  const openerRestored = await opener.evaluate(
    (element) => document.activeElement === element,
  );
  if (!openerRestored) {
    throw new Error("Companion task sheet did not return focus to its opener after Escape.");
  }
}

async function createManualSpool(page, timeoutMs, record) {
  const opener = page.locator('[data-action="toggle-add-spool-form"]');
  const sheet = page.locator(".task-sheet.add-filament-sheet");
  await opener.click();
  await sheet.waitFor({
    state: "visible",
    timeout: timeoutMs,
  });
  await verifyTaskSheetAccessibility(page, sheet, opener, timeoutMs);
  await opener.click();
  await sheet.waitFor({ state: "visible", timeout: timeoutMs });
  await page
    .locator('[data-action="set-filament-source"][data-filament-source="manual"]')
    .click();
  await page
    .locator('[data-filament-source="manual"][data-active="true"]')
    .waitFor({ state: "visible", timeout: timeoutMs });

  for (const [name, value] of [
    ["filament-manual-vendor", record.vendor],
    ["filament-material", record.material],
    ["filament-name", record.filamentName],
    ["filament-color-name", record.colorName],
    ["filament-initial-weight", String(record.initialWeight)],
    ["filament-location", record.location],
  ]) {
    await page.locator(`input:not([type="hidden"])[name="${name}"]`).fill(value);
  }
  await page
    .locator('input:not([type="hidden"])[name="filament-hex-color"]')
    .fill("#7c3aed");
  await page.locator('[data-action="add-spool-form"] button[type="submit"]').click();
  await page.locator(".detail-modal").waitFor({ state: "visible", timeout: timeoutMs });
}

async function verifySpoolInReloadedUi(page, baseUrl, timeoutMs, spoolId, record, weight) {
  await reloadCompanion(page, baseUrl, timeoutMs);
  await page.locator('input[name="inventory-search"]').fill(record.filamentName);
  const row = page.locator(`[data-action="select-spool"][data-spool-id="${spoolId}"]`);
  await row.waitFor({ state: "visible", timeout: timeoutMs });
  const text = await row.innerText();
  for (const expected of [record.filamentName, record.colorName, record.vendor, `${weight} g`]) {
    if (!text.includes(expected)) {
      throw new Error(`Reloaded Companion inventory row did not contain ${JSON.stringify(expected)}.`);
    }
  }
  return row;
}

async function updateWeight(page, baseUrl, timeoutMs, dbPath, spoolId, record) {
  const row = await verifySpoolInReloadedUi(
    page,
    baseUrl,
    timeoutMs,
    spoolId,
    record,
    record.initialWeight,
  );
  await row.click();
  const form = page.locator('[data-action="update-weight-form"]');
  await form.waitFor({ state: "visible", timeout: timeoutMs });
  const gramsInput = form.locator('input[name="grams"]');
  const expectedWeight = String(record.measuredWeight);
  await gramsInput.fill(expectedWeight);
  const enteredWeight = await gramsInput.inputValue();
  if (enteredWeight !== expectedWeight) {
    throw new Error(
      `Companion weight field contained ${JSON.stringify(enteredWeight)} after entering ${expectedWeight}.`,
    );
  }
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname ===
        `/api/v1/spools/${encodeURIComponent(spoolId)}/weight`,
    { timeout: Math.min(timeoutMs, 5_000) },
  );
  await form.locator('button[type="submit"]').click();
  const request = await requestPromise;
  const requestPayload = request.postDataJSON();
  if (requestPayload?.grams !== record.measuredWeight) {
    throw new Error(
      `Companion weight request sent ${JSON.stringify(requestPayload)} instead of ${record.measuredWeight} g.`,
    );
  }
  const state = await waitForDatabaseState(
    dbPath,
    (candidate) =>
      candidate.spool?.remaining_g === record.measuredWeight &&
      candidate.history.some((event) => event.event_type === "WEIGHT_UPDATED"),
    { record, timeoutMs },
  );
  await page.waitForFunction(
    () =>
      document.getElementById("companion-live-region-polite")?.textContent?.trim() ===
      "Weight updated.",
    undefined,
    { timeout: timeoutMs },
  );
  await verifySpoolInReloadedUi(
    page,
    baseUrl,
    timeoutMs,
    spoolId,
    record,
    record.measuredWeight,
  );
  return state;
}

async function lendAndReturnSpool(page, baseUrl, timeoutMs, dbPath, spoolId, record) {
  await page.locator('[data-root-flow="loans"]').click();
  await page.locator('[data-action="start-loan-picker"]').click();
  const option = page.locator(
    `[data-action="select-loan-spool"][data-spool-id="${spoolId}"]`,
  );
  await option.waitFor({ state: "visible", timeout: timeoutMs });
  await option.click();
  const createForm = page.locator('[data-action="loan-spool-form"]');
  await createForm.waitFor({ state: "visible", timeout: timeoutMs });
  await createForm.locator('input[name="borrower-name"]').fill(record.borrower);
  await createForm.locator('textarea[name="loan-note"]').fill(record.loanNote);
  await createForm.locator('button[type="submit"]').click();

  let state = await waitForDatabaseState(
    dbPath,
    (candidate) => candidate.loan?.loan_status === "ACTIVE",
    { record, timeoutMs },
  );
  await openCompanion(page, baseUrl, timeoutMs);
  await page.locator('[data-root-flow="loans"]').click();
  let loanCard = page.locator(".loan-card").filter({ hasText: record.borrower }).first();
  await loanCard.waitFor({ state: "visible", timeout: timeoutMs });
  if (!(await loanCard.innerText()).includes(record.loanNote)) {
    throw new Error("Reloaded Companion loan card did not preserve the outbound loan note.");
  }

  await loanCard.locator('[data-action="toggle-loan-return"]').click();
  const returnForm = page.locator('[data-action="return-loan-history-form"]');
  await returnForm.waitFor({ state: "visible", timeout: timeoutMs });
  await returnForm
    .locator('input[name="returned-grams"]')
    .fill(String(record.returnMeasuredWeight));
  await returnForm.locator('textarea[name="return-note"]').fill(record.returnNote);
  await returnForm.locator('button[type="submit"]').click();

  state = await waitForDatabaseState(
    dbPath,
    (candidate) =>
      candidate.loan?.loan_status === "RETURNED" &&
      candidate.spool?.remaining_g === record.returnMeasuredWeight &&
      candidate.history.some((event) => event.event_type === "LOAN_RETURNED"),
    { record, timeoutMs },
  );
  await openCompanion(page, baseUrl, timeoutMs);
  await page.locator('[data-root-flow="loans"]').click();
  await page
    .locator('[data-action="set-loan-status"][data-loan-status="RETURNED"]')
    .click();
  loanCard = page.locator(".loan-card").filter({ hasText: record.borrower }).first();
  await loanCard.waitFor({ state: "visible", timeout: timeoutMs });
  const returnedText = await loanCard.innerText();
  if (!returnedText.includes(record.returnNote)) {
    throw new Error("Reloaded Companion loan card did not preserve the return note.");
  }
  return state;
}

async function runCompanionDataPageWorkflows(page, options, pageErrors) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const record = options.record ?? COMPANION_E2E_RECORD;
  const session = await page.goto(new URL("/api/v1/qa/session", `${options.baseUrl}/`).toString(), {
    timeout: timeoutMs,
    waitUntil: "domcontentloaded",
  });
  if (!session?.ok()) {
    throw new Error(`/api/v1/qa/session returned HTTP ${session?.status() ?? "unknown"}.`);
  }
  await page.evaluate(() => {
    localStorage.setItem("bfm-companion-locale", "en");
  });
  await openCompanion(page, options.baseUrl, timeoutMs);
  await createManualSpool(page, timeoutMs, record);
  let state = await waitForDatabaseState(options.dbPath, (candidate) => Boolean(candidate.spool), {
    record,
    timeoutMs,
  });
  const spoolId = state.spool.id;
  await verifySpoolInReloadedUi(
    page,
    options.baseUrl,
    timeoutMs,
    spoolId,
    record,
    record.initialWeight,
  );
  state = await updateWeight(
    page,
    options.baseUrl,
    timeoutMs,
    options.dbPath,
    spoolId,
    record,
  );
  const persistedWeight = state.spool.remaining_g;
  state = await lendAndReturnSpool(
    page,
    options.baseUrl,
    timeoutMs,
    options.dbPath,
    spoolId,
    record,
  );
  if (!state.history.some((event) => event.event_type === "LOANED_OUT")) {
    throw new Error("Companion E2E database history did not record LOANED_OUT.");
  }
  if (pageErrors.length > 0) {
    throw new Error(`Companion page errors: ${pageErrors.join("; ")}`);
  }
  return {
    createdSpoolId: spoolId,
    finalLoanStatus: state.loan.loan_status,
    persistedWeight,
    postReturnWeight: state.spool.remaining_g,
    historyEvents: state.history.map((event) => event.event_type),
  };
}

function lifecycleError(primaryError, cleanupErrors, label) {
  if (primaryError && cleanupErrors.length > 0) {
    return new AggregateError(
      [primaryError, ...cleanupErrors],
      `${primaryError instanceof Error ? primaryError.message : String(primaryError)}\n${label}: ${cleanupErrors.map((error) => error instanceof Error ? error.message : String(error)).join("; ")}`,
      { cause: primaryError },
    );
  }
  if (primaryError) {
    return primaryError;
  }
  if (cleanupErrors.length === 1) {
    return cleanupErrors[0];
  }
  if (cleanupErrors.length > 1) {
    return new AggregateError(cleanupErrors, label);
  }
  return null;
}

export async function runCompanionDataWorkflows(options) {
  let browser = null;
  let context = null;
  let result = null;
  let primaryError = null;
  const pageErrors = [];
  try {
    browser = await (options.chromium ?? chromium).launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    companionPageErrors.set(page, pageErrors);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        pageErrors.push(message.text());
      }
    });
    const runPageWorkflows = options.runPageWorkflows ?? runCompanionDataPageWorkflows;
    result = await runPageWorkflows(page, options, pageErrors);
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];
  if (context) {
    try {
      await context.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  const finalError = lifecycleError(
    primaryError,
    cleanupErrors,
    "Companion browser cleanup also failed",
  );
  if (finalError) {
    throw finalError;
  }
  return result;
}

export async function runCompanionDataE2e(options = {}) {
  assertCompanionDataE2eOptions(options);
  const interfaces = [{ ...COMPANION_E2E_LOOPBACK_INTERFACE }];
  const selectedInterface = interfaces[0];
  const trustedLanPort =
    options.trustedLanPort ??
    (await findAvailableCompanionDataE2ePort(
      selectedInterface.address,
      options.createServer,
    ));
  let sourcePath = null;
  let preparedDatabase = null;
  let result = null;
  let primaryError = null;
  try {
    sourcePath = createVisualQaFixture().outputPath;
    if (!sourcePath) {
      throw new Error("Generated Companion E2E fixture did not provide a database path.");
    }
    const launchedResult = await runLaunchedCompanionScreenshotGate({
      profile: "base",
      sourcePath,
      startupTimeoutMs: options.startupTimeoutMs,
      timeoutMs: options.timeoutMs,
      prepareVisualQaDatabase: async (databaseOptions) => {
        preparedDatabase = await prepareVisualQaDatabase({
          ...databaseOptions,
          interfaces,
          trustedLanPort,
        });
        return preparedDatabase;
      },
      runCompanionVisualGate: async () => ({ errors: [] }),
      runCompanionScreenshotGate: async ({ baseUrl }) => ({
        errors: [],
        workflows: await runCompanionDataWorkflows({
          baseUrl,
          chromium: options.chromium,
          dbPath: preparedDatabase.targetPath,
          record: options.record,
          runPageWorkflows: options.runPageWorkflows,
          timeoutMs: options.timeoutMs,
        }),
      }),
    });
    if (launchedResult.errors.length > 0) {
      throw new Error(launchedResult.errors.join("\n"));
    }
    result = {
      baseUrl: launchedResult.baseUrl,
      sourcePath,
      workflows: launchedResult.screenshotGate.workflows,
    };
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];
  if (sourcePath && existsSync(sourcePath)) {
    try {
      cleanupVisualQaDatabase(sourcePath);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  const finalError = lifecycleError(
    primaryError,
    cleanupErrors,
    "Generated Companion E2E source cleanup also failed",
  );
  if (finalError) {
    throw finalError;
  }
  return result;
}

export function formatCompanionDataE2eReport(result) {
  return [
    "Companion data E2E passed on temporary database copies.",
    `  - created spool: ${result.workflows.createdSpoolId}`,
    `  - persisted weight update: ${result.workflows.persistedWeight} g`,
    `  - weight after return: ${result.workflows.postReturnWeight} g`,
    `  - final loan status: ${result.workflows.finalLoanStatus}`,
    `  - history: ${result.workflows.historyEvents.join(", ")}`,
  ].join("\n");
}

export function parseCompanionDataE2eCliOptions(args) {
  if (
    args.some(
      (argument) => argument === "--source" || argument.startsWith("--source="),
    )
  ) {
    throw new Error(
      "Companion data E2E refuses --source. It always generates a sanitized fixture.",
    );
  }
  const timeoutIndex = args.indexOf("--timeout-ms");
  const parsedTimeout = timeoutIndex >= 0 ? Number.parseInt(args[timeoutIndex + 1], 10) : undefined;
  return {
    live: args.includes("--live"),
    timeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : undefined,
  };
}

async function runCli() {
  const result = await runCompanionDataE2e(
    parseCompanionDataE2eCliOptions(process.argv.slice(2)),
  );
  console.log(formatCompanionDataE2eReport(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
