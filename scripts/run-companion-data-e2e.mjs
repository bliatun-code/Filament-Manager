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
  loanWeight: 730,
  material: "PLA",
  measuredWeight: 777,
  returnMeasuredWeight: 900,
  returnNote: "Companion data E2E return",
  vendor: "Fixture Works",
};

export const COMPANION_E2E_PRINTER_TARGET = Object.freeze({
  printerId: "qa_printer_bambu",
  printerName: "Atlas QA",
  slotId: "qa_bambu_slot_4",
  slotIndex: "4",
});

export const COMPANION_E2E_WISHLIST_RECEIPT = Object.freeze({
  colorName: "Ocean Teal",
  filamentName: "PETG+",
  initialQuantity: 3,
  itemId: "visual_qa_wishlist_on_order",
  material: "PETG",
  receivedQuantity: 1,
  remainingQuantity: 2,
  spoolWeight: 1000,
  status: "ON_ORDER",
  vendor: "eSUN",
});

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
    const spoolMatches = db
      .prepare(
        `SELECT
           spool.id,
           spool.initial_weight_g,
           spool.current_weight_g,
           spool.remaining_g,
           spool.status,
           spool.ownership_type,
           master.material,
           master.filament_name,
           master.color_name,
           master.vendor,
           location.name AS location_name,
           home_location.name AS home_location_name
         FROM filament_spools AS spool
         JOIN filament_master_list AS master ON master.id = spool.master_id
         LEFT JOIN inventory_locations AS location ON location.id = spool.location_id
         LEFT JOIN inventory_locations AS home_location ON home_location.id = spool.home_location_id
         WHERE master.vendor = ?
           AND master.material = ?
           AND master.filament_name = ?
           AND master.color_name = ?
         ORDER BY spool.created_at DESC, spool.id DESC`,
      )
      .all(record.vendor, record.material, record.filamentName, record.colorName);
    const spool = spoolMatches[0] ?? null;
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
    const loanMatches = spool
      ? db
          .prepare(
            `SELECT *
             FROM spool_loans
             WHERE spool_id = ? AND borrower_name = ?
             ORDER BY lent_at DESC, id DESC`,
          )
          .all(spool.id, record.borrower)
      : [];
    const loan = loanMatches[0] ?? null;
    const printerAssignment = spool
      ? db
          .prepare(
            `SELECT
               slot.id AS slot_id,
               slot.slot_index,
               unit.printer_id,
               printer.name AS printer_name,
               slot.spool_id
             FROM ams_slots AS slot
             JOIN ams_units AS unit ON unit.id = slot.ams_id
             JOIN printers AS printer ON printer.id = unit.printer_id
             WHERE slot.spool_id = ?
             ORDER BY printer.name ASC, slot.slot_index ASC, slot.id ASC
             LIMIT 1`,
          )
          .get(spool.id) ?? null
      : null;
    const printerAssignments = db
      .prepare(
        `SELECT
           slot.id AS slot_id,
           slot.slot_index,
           unit.printer_id,
           printer.name AS printer_name,
           slot.spool_id
         FROM ams_slots AS slot
         JOIN ams_units AS unit ON unit.id = slot.ams_id
         JOIN printers AS printer ON printer.id = unit.printer_id
         ORDER BY printer.name ASC, slot.slot_index ASC, slot.id ASC`,
      )
      .all();
    const wishlistItem = db
      .prepare(
        `SELECT id, master_id, material, filament_name, color_name, vendor, status, quantity
         FROM wishlist_items
         WHERE id = ?`,
      )
      .get(COMPANION_E2E_WISHLIST_RECEIPT.itemId) ?? null;
    const wishlistSpools = wishlistItem?.master_id
      ? db
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
             WHERE spool.master_id = ?
             ORDER BY spool.created_at ASC, spool.id ASC`,
          )
          .all(wishlistItem.master_id)
      : [];
    const wishlistReceiptEvents = wishlistItem?.master_id
      ? db
          .prepare(
            `SELECT event.spool_id, event.payload_json
             FROM spool_history_events AS event
             JOIN filament_spools AS spool ON spool.id = event.spool_id
             WHERE spool.master_id = ?
               AND event.event_type = 'PURCHASE_RECEIPT_RECORDED'
             ORDER BY event.created_at ASC, event.id ASC`,
          )
          .all(wishlistItem.master_id)
          .map((event) => ({
            ...event,
            payload: JSON.parse(event.payload_json),
          }))
      : [];
    return {
      history,
      loan,
      loanMatches,
      printerAssignment,
      printerAssignments,
      spool,
      spoolMatches,
      wishlistItem,
      wishlistReceiptEvents,
      wishlistSpools,
    };
  } finally {
    db.close();
  }
}

function readCompanionInventoryMutationSnapshot(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return JSON.stringify({
      history: db
        .prepare("SELECT * FROM spool_history_events ORDER BY id ASC")
        .all(),
      spools: db.prepare("SELECT * FROM filament_spools ORDER BY id ASC").all(),
    });
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
  const row = await verifySpoolInCurrentUi(
    page,
    timeoutMs,
    spoolId,
    record,
    weight,
    "Reloaded",
    record.location,
  );
  await row.click();
  const detail = page.locator('.detail-modal[aria-busy="false"]');
  await detail.waitFor({ state: "visible", timeout: timeoutMs });
  const detailText = await detail.innerText();
  for (const expected of [
    record.filamentName,
    record.colorName,
    record.vendor,
    record.location,
  ]) {
    if (!detailText.includes(expected)) {
      throw new Error(
        `Reloaded Companion detail did not contain ${JSON.stringify(expected)}.`,
      );
    }
  }
  await detail.locator('[data-action="close-detail"]').click();
  await detail.waitFor({ state: "detached", timeout: timeoutMs });
  return row;
}

async function verifySpoolInCurrentUi(
  page,
  timeoutMs,
  spoolId,
  record,
  weight,
  stateLabel = "Current",
  searchQuery = record.filamentName,
) {
  await page.locator('input[name="inventory-search"]').fill(searchQuery);
  const row = page.locator(`[data-action="select-spool"][data-spool-id="${spoolId}"]`);
  await row.waitFor({ state: "visible", timeout: timeoutMs });
  const text = await row.innerText();
  for (const expected of [
    record.filamentName,
    record.colorName,
    record.vendor,
    record.location,
    `${weight} g`,
  ]) {
    if (!text.includes(expected)) {
      throw new Error(
        `${stateLabel} Companion inventory row did not contain ${JSON.stringify(expected)}.`,
      );
    }
  }
  return row;
}

async function updateWeight(page, timeoutMs, dbPath, spoolId, record, row) {
  await row.click();
  const readyDetail = page.locator('.detail-modal[aria-busy="false"]');
  await readyDetail.waitFor({ state: "visible", timeout: timeoutMs });
  const form = readyDetail.locator('[data-action="update-weight-form"]');
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
  await page.locator('[data-action="close-detail"]').click();
  await page.locator(".detail-modal").waitFor({ state: "hidden", timeout: timeoutMs });
  await verifySpoolInCurrentUi(
    page,
    timeoutMs,
    spoolId,
    record,
    record.measuredWeight,
    "Updated",
  );
  return state;
}

async function loadSpoolIntoPrinterAndClear(
  page,
  timeoutMs,
  dbPath,
  spoolId,
  record,
) {
  const assignmentsBefore = readCompanionDataE2eState(
    dbPath,
    record,
  ).printerAssignments;
  await page.locator('[data-root-flow="printers"]').click();
  const openSlot = page.locator(
    `[data-action="start-printer-slot-assignment"][data-printer-id="${COMPANION_E2E_PRINTER_TARGET.printerId}"][data-slot-id="${COMPANION_E2E_PRINTER_TARGET.slotId}"]`,
  );
  await openSlot.waitFor({ state: "visible", timeout: timeoutMs });
  const target = await openSlot.evaluate((button) => ({
    printerId: button.getAttribute("data-printer-id") || "",
    printerName: button.getAttribute("data-printer-name") || "",
    slotId: button.getAttribute("data-slot-id") || "",
    slotIndex: button.getAttribute("data-slot-index") || "",
    slotLabel: button.getAttribute("data-slot-label") || "",
  }));
  if (!target.printerId || !target.slotId) {
    throw new Error(
      `Companion printer picker did not expose a complete empty-slot target: ${JSON.stringify(target)}.`,
    );
  }
  if (
    target.printerId !== COMPANION_E2E_PRINTER_TARGET.printerId ||
    target.printerName !== COMPANION_E2E_PRINTER_TARGET.printerName ||
    target.slotId !== COMPANION_E2E_PRINTER_TARGET.slotId ||
    target.slotIndex !== COMPANION_E2E_PRINTER_TARGET.slotIndex
  ) {
    throw new Error(
      `Companion printer picker targeted ${JSON.stringify(target)} instead of ${JSON.stringify(COMPANION_E2E_PRINTER_TARGET)}.`,
    );
  }

  await openSlot.click();
  const picker = page.locator(".printer-picker-sheet");
  await picker.waitFor({ state: "visible", timeout: timeoutMs });
  await picker
    .locator('input[name="printer-spool-search"]')
    .fill(record.filamentName);
  const spoolOption = picker.locator(
    `[data-action="assign-selected-spool"][data-spool-id="${spoolId}"]`,
  );
  await spoolOption.waitFor({ state: "visible", timeout: timeoutMs });
  const optionText = await spoolOption.innerText();
  for (const expected of [record.filamentName, record.colorName, record.vendor]) {
    if (!optionText.includes(expected)) {
      throw new Error(
        `Companion printer picker row did not contain ${JSON.stringify(expected)}.`,
      );
    }
  }
  await spoolOption.click();

  const operationForm = page.locator(
    '.printer-weight-sheet [data-action="printer-slot-operation-form"]',
  );
  await operationForm.waitFor({ state: "visible", timeout: timeoutMs });
  const incomingInput = operationForm.locator('input[name="incoming-grams"]');
  await incomingInput.waitFor({ state: "visible", timeout: timeoutMs });
  await incomingInput.fill(String(record.initialWeight));
  const operationPath = `/api/v1/printers/${encodeURIComponent(target.printerId)}/slots/${encodeURIComponent(target.slotId)}/operation`;
  const slotMutationRequests = [];
  const captureSlotMutation = (request) => {
    if (request.method() !== "POST") {
      return;
    }
    const path = new URL(request.url()).pathname;
    if (
      path === operationPath ||
      path.endsWith("/assignment") ||
      path === `/api/v1/printers/${encodeURIComponent(target.printerId)}/spools/${encodeURIComponent(spoolId)}/usage` ||
      path === `/api/v1/spools/${encodeURIComponent(spoolId)}/weight`
    ) {
      slotMutationRequests.push(request);
    }
  };
  page.on("request", captureSlotMutation);
  const operationRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === operationPath,
    { timeout: timeoutMs },
  );
  await operationForm.locator('button[type="submit"]').click();
  const operationRequest = await operationRequestPromise;
  const operationBody = operationRequest.postDataJSON();
  if (
    operationBody?.expected_current_spool_id !== null ||
    operationBody?.target_spool_id !== spoolId ||
    operationBody?.outgoing_measured_total_g !== null ||
    operationBody?.incoming_measured_total_g !== record.initialWeight
  ) {
    throw new Error(
      `Companion printer load sent invalid atomic operation ${JSON.stringify(operationBody)}.`,
    );
  }

  let state = await waitForDatabaseState(
    dbPath,
    (candidate) =>
      candidate.printerAssignment?.printer_id === target.printerId &&
      candidate.printerAssignment?.slot_id === target.slotId &&
      candidate.printerAssignment?.spool_id === spoolId &&
      candidate.spool?.status === "ASSIGNED" &&
      candidate.history.some((event) => event.event_type === "ASSIGNED_TO_AMS"),
    { record, timeoutMs },
  );
  const unchangedAssignmentsBefore = assignmentsBefore.filter(
    (assignment) => assignment.slot_id !== target.slotId,
  );
  const unchangedAssignmentsAfterLoad = state.printerAssignments.filter(
    (assignment) => assignment.slot_id !== target.slotId,
  );
  if (
    JSON.stringify(unchangedAssignmentsAfterLoad) !==
    JSON.stringify(unchangedAssignmentsBefore)
  ) {
    throw new Error("Companion printer load changed an unrelated slot assignment.");
  }
  if (
    slotMutationRequests.length !== 1 ||
    new URL(slotMutationRequests[0].url()).pathname !== operationPath
  ) {
    throw new Error(
      `Companion printer load used ${slotMutationRequests.length} slot mutation requests instead of one atomic operation.`,
    );
  }
  slotMutationRequests.length = 0;
  const clearSlot = page.locator(
    `[data-action="start-printer-weight-update"][data-printer-task-mode="clear"][data-slot-id="${target.slotId}"][data-spool-id="${spoolId}"]`,
  );
  await clearSlot.waitFor({ state: "visible", timeout: timeoutMs });
  const loadedSlotText = await clearSlot.evaluate(
    (button) => button.closest(".slot-card")?.textContent || "",
  );
  for (const expected of [record.filamentName, record.colorName]) {
    if (!loadedSlotText.includes(expected)) {
      throw new Error(
        `Loaded Companion printer slot did not contain ${JSON.stringify(expected)}.`,
      );
    }
  }

  await clearSlot.click();
  await operationForm.waitFor({ state: "visible", timeout: timeoutMs });
  const outgoingInput = operationForm.locator('input[name="outgoing-grams"]');
  await outgoingInput.waitFor({ state: "visible", timeout: timeoutMs });
  if (!(await outgoingInput.inputValue()).trim()) {
    throw new Error("Companion printer clear flow did not prefill the outgoing weight.");
  }
  const clearRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === operationPath,
    { timeout: timeoutMs },
  );
  await operationForm.locator('button[type="submit"]').click();
  const clearRequest = await clearRequestPromise;
  const clearBody = clearRequest.postDataJSON();
  if (
    clearBody?.expected_current_spool_id !== spoolId ||
    clearBody?.target_spool_id !== null ||
    !Number.isFinite(clearBody?.outgoing_measured_total_g) ||
    clearBody?.incoming_measured_total_g !== null
  ) {
    throw new Error(
      `Companion printer clear sent invalid atomic operation ${JSON.stringify(clearBody)}.`,
    );
  }
  state = await waitForDatabaseState(
    dbPath,
    (candidate) =>
      candidate.printerAssignment === null &&
      candidate.spool?.status === "IN_STOCK" &&
      candidate.history.some((event) => event.event_type === "ASSIGNED_TO_AMS"),
    { record, timeoutMs },
  );
  if (JSON.stringify(state.printerAssignments) !== JSON.stringify(assignmentsBefore)) {
    throw new Error(
      "Companion printer clear did not restore the complete slot assignment snapshot.",
    );
  }
  page.off("request", captureSlotMutation);
  if (
    slotMutationRequests.length !== 1 ||
    new URL(slotMutationRequests[0].url()).pathname !== operationPath
  ) {
    throw new Error(
      `Companion printer clear used ${slotMutationRequests.length} slot mutation requests instead of one atomic operation.`,
    );
  }
  await page
    .locator(
      `[data-action="start-printer-slot-assignment"][data-printer-id="${target.printerId}"][data-slot-id="${target.slotId}"]`,
    )
    .waitFor({ state: "visible", timeout: timeoutMs });
  return { state, target };
}

async function receiveWishlistFixture(page, timeoutMs, dbPath, record) {
  await page.locator('[data-root-flow="storage"]').click();
  await page.locator('[data-action="toggle-add-spool-form"]').click();
  const sheet = page.locator(".task-sheet.add-filament-sheet");
  await sheet.waitFor({ state: "visible", timeout: timeoutMs });
  const wishlistQueue = sheet.locator(
    'details[data-collapsible="wishlist-queue"]',
  );
  if ((await wishlistQueue.getAttribute("open")) === null) {
    await wishlistQueue.locator(":scope > summary").click();
  }
  const wishlistRow = sheet.locator(".add-spool-wishlist-row").filter({
    has: page.locator(
      `input[name="wishlist-id"][value="${COMPANION_E2E_WISHLIST_RECEIPT.itemId}"]`,
    ),
  });
  await wishlistRow.waitFor({ state: "visible", timeout: timeoutMs });
  const initialText = await wishlistRow.innerText();
  for (const expected of [
    COMPANION_E2E_WISHLIST_RECEIPT.filamentName,
    COMPANION_E2E_WISHLIST_RECEIPT.colorName,
    COMPANION_E2E_WISHLIST_RECEIPT.vendor,
    `Qty ${COMPANION_E2E_WISHLIST_RECEIPT.initialQuantity}`,
  ]) {
    if (!initialText.includes(expected)) {
      throw new Error(
        `Companion wishlist row did not contain ${JSON.stringify(expected)} before receipt.`,
      );
    }
  }

  const receiptForm = wishlistRow.locator('[data-action="wishlist-stock-form"]');
  const quantityInput = receiptForm.locator('input[name="received-quantity"]');
  await quantityInput.fill(
    String(COMPANION_E2E_WISHLIST_RECEIPT.receivedQuantity),
  );
  const receiptPath = `/api/v1/wishlist/${encodeURIComponent(COMPANION_E2E_WISHLIST_RECEIPT.itemId)}/receive`;
  const receiptRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === receiptPath,
    { timeout: timeoutMs },
  );
  await receiptForm.locator('button[type="submit"]').click();
  const receiptRequest = await receiptRequestPromise;
  if (
    receiptRequest.postDataJSON()?.quantity !==
    COMPANION_E2E_WISHLIST_RECEIPT.receivedQuantity
  ) {
    throw new Error(
      `Companion wishlist receipt sent ${JSON.stringify(receiptRequest.postDataJSON())} instead of one roll.`,
    );
  }

  const state = await waitForDatabaseState(
    dbPath,
    (candidate) =>
      candidate.wishlistItem?.status ===
        COMPANION_E2E_WISHLIST_RECEIPT.status &&
      candidate.wishlistItem?.quantity ===
        COMPANION_E2E_WISHLIST_RECEIPT.remainingQuantity &&
      candidate.wishlistSpools.length ===
        COMPANION_E2E_WISHLIST_RECEIPT.receivedQuantity &&
      candidate.wishlistReceiptEvents.length ===
        COMPANION_E2E_WISHLIST_RECEIPT.receivedQuantity &&
      candidate.wishlistReceiptEvents.every(
        (event) =>
          event.payload?.wishlist_item_id ===
            COMPANION_E2E_WISHLIST_RECEIPT.itemId &&
          event.payload?.initial_weight_g ===
            COMPANION_E2E_WISHLIST_RECEIPT.spoolWeight,
      ) &&
      candidate.wishlistSpools.every(
        (spool) =>
          spool.status === "IN_STOCK" &&
          spool.remaining_g === COMPANION_E2E_WISHLIST_RECEIPT.spoolWeight &&
          spool.material === COMPANION_E2E_WISHLIST_RECEIPT.material &&
          spool.filament_name ===
            COMPANION_E2E_WISHLIST_RECEIPT.filamentName &&
          spool.color_name === COMPANION_E2E_WISHLIST_RECEIPT.colorName &&
          spool.vendor === COMPANION_E2E_WISHLIST_RECEIPT.vendor,
      ),
    { record, timeoutMs },
  );
  const receivedSpoolId = state.wishlistSpools[0]?.id;
  if (!receivedSpoolId) {
    throw new Error("Companion wishlist receipt did not create a spool ID.");
  }

  const detail = page.locator('.detail-modal[aria-busy="false"]');
  await detail.waitFor({ state: "visible", timeout: timeoutMs });
  await detail.locator('[data-action="close-detail"]').click();
  await sheet.waitFor({ state: "visible", timeout: timeoutMs });
  if ((await wishlistQueue.getAttribute("open")) === null) {
    await wishlistQueue.locator(":scope > summary").click();
  }
  const updatedWishlistRow = sheet.locator(".add-spool-wishlist-row").filter({
    has: page.locator(
      `input[name="wishlist-id"][value="${COMPANION_E2E_WISHLIST_RECEIPT.itemId}"]`,
    ),
  });
  await updatedWishlistRow.waitFor({ state: "visible", timeout: timeoutMs });
  const updatedText = await updatedWishlistRow.innerText();
  if (
    !updatedText.includes(
      `Qty ${COMPANION_E2E_WISHLIST_RECEIPT.remainingQuantity}`,
    )
  ) {
    throw new Error(
      `Companion wishlist row did not show ${COMPANION_E2E_WISHLIST_RECEIPT.remainingQuantity} remaining after receipt.`,
    );
  }
  const updatedQuantityInput = updatedWishlistRow.locator(
    'input[name="received-quantity"]',
  );
  if (
    (await updatedQuantityInput.getAttribute("max")) !==
    String(COMPANION_E2E_WISHLIST_RECEIPT.remainingQuantity)
  ) {
    throw new Error("Companion wishlist receipt quantity limit did not refresh.");
  }
  await sheet.locator('[data-action="close-task-sheet"]').click();
  await sheet.waitFor({ state: "detached", timeout: timeoutMs });

  await page
    .locator('input[name="inventory-search"]')
    .fill(COMPANION_E2E_WISHLIST_RECEIPT.colorName);
  const receivedRow = page.locator(
    `[data-action="select-spool"][data-spool-id="${receivedSpoolId}"]`,
  );
  await receivedRow.waitFor({ state: "visible", timeout: timeoutMs });
  const receivedText = await receivedRow.innerText();
  for (const expected of [
    COMPANION_E2E_WISHLIST_RECEIPT.filamentName,
    COMPANION_E2E_WISHLIST_RECEIPT.colorName,
    COMPANION_E2E_WISHLIST_RECEIPT.vendor,
  ]) {
    if (!receivedText.includes(expected)) {
      throw new Error(
        `Received Companion inventory row did not contain ${JSON.stringify(expected)}.`,
      );
    }
  }
  if (!receivedText.replaceAll(/[,\s.]/g, "").includes("1000g")) {
    throw new Error("Received Companion inventory row did not show the 1,000 g weight.");
  }
  return { receivedSpoolId, state };
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
  await createForm
    .locator('input[name="grams-out"]')
    .fill(String(record.loanWeight));
  await createForm.locator('textarea[name="loan-note"]').fill(record.loanNote);
  const loanPath = `/api/v1/spools/${encodeURIComponent(spoolId)}/lend`;
  const loanRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === loanPath,
    { timeout: timeoutMs },
  );
  await createForm.locator('button[type="submit"]').click();
  const loanRequest = await loanRequestPromise;
  const loanPayload = loanRequest.postDataJSON();
  if (
    loanPayload?.borrower_name !== record.borrower ||
    loanPayload?.grams_out !== record.loanWeight ||
    loanPayload?.note !== record.loanNote
  ) {
    throw new Error(
      `Companion loan sent ${JSON.stringify(loanPayload)} instead of the supplied borrower, weight and note.`,
    );
  }
  await createForm.waitFor({ state: "hidden", timeout: timeoutMs });

  let state = await waitForDatabaseState(
    dbPath,
    (candidate) =>
      candidate.loanMatches.length === 1 &&
      candidate.loan?.loan_status === "ACTIVE" &&
      candidate.loan?.borrower_name === record.borrower &&
      candidate.loan?.grams_out === record.loanWeight &&
      candidate.loan?.lent_note === record.loanNote &&
      candidate.spool?.status === "BORROWED" &&
      candidate.spool?.current_weight_g === record.loanWeight &&
      candidate.spool?.remaining_g === record.loanWeight &&
      candidate.spool?.location_name === `Loaned to: ${record.borrower}` &&
      candidate.spool?.home_location_name === record.location,
    { record, timeoutMs },
  );
  let loanCard = page.locator(".loan-card").filter({ hasText: record.borrower }).first();
  await loanCard.waitFor({ state: "visible", timeout: timeoutMs });
  if (!(await loanCard.innerText()).includes(record.loanNote)) {
    throw new Error("Companion loan card did not preserve the outbound loan note.");
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
      candidate.loanMatches.length === 1 &&
      candidate.loan?.loan_status === "RETURNED" &&
      candidate.loan?.grams_out === record.loanWeight &&
      typeof candidate.loan?.returned_at === "string" &&
      candidate.loan.returned_at.length > 0 &&
      candidate.loan?.returned_grams === record.returnMeasuredWeight &&
      candidate.loan?.consumed_grams === 0 &&
      candidate.loan?.return_note === record.returnNote &&
      candidate.spool?.status === "IN_STOCK" &&
      candidate.spool?.current_weight_g === record.returnMeasuredWeight &&
      candidate.spool?.remaining_g === record.returnMeasuredWeight &&
      candidate.spool?.location_name === null &&
      candidate.spool?.home_location_name === record.location &&
      candidate.history.some((event) => event.event_type === "LOAN_RETURNED"),
    { record, timeoutMs },
  );
  await reloadCompanion(page, baseUrl, timeoutMs);
  await verifySpoolInCurrentUi(
    page,
    timeoutMs,
    spoolId,
    record,
    record.returnMeasuredWeight,
    "Reloaded",
  );
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
  let state = await waitForDatabaseState(
    options.dbPath,
    (candidate) =>
      candidate.spoolMatches.length === 1 &&
      candidate.spool?.initial_weight_g === record.initialWeight &&
      candidate.spool?.current_weight_g === record.initialWeight &&
      candidate.spool?.remaining_g === record.initialWeight &&
      candidate.spool?.ownership_type === "OWNED" &&
      candidate.spool?.material === record.material &&
      candidate.spool?.filament_name === record.filamentName &&
      candidate.spool?.color_name === record.colorName &&
      candidate.spool?.vendor === record.vendor &&
      candidate.spool?.location_name === record.location &&
      candidate.spool?.home_location_name === record.location,
    {
      record,
      timeoutMs,
    },
  );
  const spoolId = state.spool.id;
  const inventoryBeforeFind = readCompanionInventoryMutationSnapshot(options.dbPath);
  await verifySpoolInReloadedUi(
    page,
    options.baseUrl,
    timeoutMs,
    spoolId,
    record,
    record.initialWeight,
  );
  const inventoryAfterFind = readCompanionInventoryMutationSnapshot(options.dbPath);
  if (inventoryAfterFind !== inventoryBeforeFind) {
    throw new Error(
      "Companion find/detail workflow mutated inventory or spool history.",
    );
  }
  const printerWorkflow = await loadSpoolIntoPrinterAndClear(
    page,
    timeoutMs,
    options.dbPath,
    spoolId,
    record,
  );
  await page.locator('[data-root-flow="storage"]').click();
  const reloadedRow = await verifySpoolInCurrentUi(
    page,
    timeoutMs,
    spoolId,
    record,
    printerWorkflow.state.spool.remaining_g,
    "Cleared",
  );
  state = await updateWeight(
    page,
    timeoutMs,
    options.dbPath,
    spoolId,
    record,
    reloadedRow,
  );
  const persistedWeight = state.spool.remaining_g;
  const wishlistWorkflow = await receiveWishlistFixture(
    page,
    timeoutMs,
    options.dbPath,
    record,
  );
  state = await lendAndReturnSpool(
    page,
    options.baseUrl,
    timeoutMs,
    options.dbPath,
    spoolId,
    record,
  );
  if (state.loanMatches.length !== 1) {
    throw new Error(
      `Companion E2E expected exactly one matching loan, found ${state.loanMatches.length}.`,
    );
  }
  if (!state.history.some((event) => event.event_type === "LOANED_OUT")) {
    throw new Error("Companion E2E database history did not record LOANED_OUT.");
  }
  if (pageErrors.length > 0) {
    throw new Error(`Companion page errors: ${pageErrors.join("; ")}`);
  }
  return {
    createdSpoolId: spoolId,
    finalLoanStatus: state.loan.loan_status,
    historyEvents: state.history.map((event) => event.event_type),
    persistedWeight,
    postReturnWeight: state.spool.remaining_g,
    printerId: printerWorkflow.target.printerId,
    printerName: printerWorkflow.target.printerName,
    printerSlotCleared: printerWorkflow.state.printerAssignment === null,
    printerSlotId: printerWorkflow.target.slotId,
    receivedWishlistItemId: COMPANION_E2E_WISHLIST_RECEIPT.itemId,
    receivedWishlistSpoolId: wishlistWorkflow.receivedSpoolId,
    wishlistRemainingQuantity:
      wishlistWorkflow.state.wishlistItem.quantity,
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
          scenario: "wishlist-orders",
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
      throw new Error(formatCompanionDataE2eLaunchFailure(launchedResult));
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
    `  - printer load/clear: ${result.workflows.printerName} · ${result.workflows.printerSlotId} (${result.workflows.printerSlotCleared ? "cleared" : "still assigned"})`,
    `  - persisted weight update: ${result.workflows.persistedWeight} g`,
    `  - wishlist receipt: ${result.workflows.receivedWishlistItemId} -> ${result.workflows.receivedWishlistSpoolId} (${result.workflows.wishlistRemainingQuantity} remaining)`,
    `  - weight after return: ${result.workflows.postReturnWeight} g`,
    `  - final loan status: ${result.workflows.finalLoanStatus}`,
    `  - history: ${result.workflows.historyEvents.join(", ")}`,
  ].join("\n");
}

export function formatCompanionDataE2eLaunchFailure(result) {
  const lines = [...result.errors];
  const launchOutputTail =
    typeof result.launchOutputTail === "string"
      ? result.launchOutputTail.trim()
      : "";
  if (launchOutputTail) {
    lines.push("Tauri launch output tail:", launchOutputTail);
  }
  return lines.join("\n");
}

function parsePositiveIntegerCliOption(args, optionName) {
  const optionIndex = args.indexOf(optionName);
  const inlinePrefix = `${optionName}=`;
  const inlineOption = args.find((argument) => argument.startsWith(inlinePrefix));
  if (optionIndex < 0 && inlineOption === undefined) {
    return undefined;
  }
  const rawValue =
    optionIndex >= 0
      ? args[optionIndex + 1]
      : inlineOption?.slice(inlinePrefix.length);
  if (typeof rawValue !== "string" || !/^\d+$/.test(rawValue)) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  const parsedValue = Number(rawValue);
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsedValue;
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
  return {
    live: args.includes("--live"),
    startupTimeoutMs: parsePositiveIntegerCliOption(
      args,
      "--startup-timeout-ms",
    ),
    timeoutMs: parsePositiveIntegerCliOption(args, "--timeout-ms"),
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
