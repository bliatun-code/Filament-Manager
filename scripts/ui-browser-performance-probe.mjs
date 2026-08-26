import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";
import { chromium } from "playwright";

import { createVisualQaFixture } from "./create-visual-qa-fixture.mjs";
import {
  cleanupVisualQaDatabase,
  prepareVisualQaDatabase,
} from "./visual-qa-db.mjs";

const DEFAULT_SAMPLES = 3;
const DEFAULT_WARMUP_RUNS = 1;
const DEFAULT_STARTUP_BUDGET_MS = 5_000;
const DEFAULT_TRANSITION_BUDGET_MS = 1_500;
const requireFromUi = createRequire(
  new URL("../ui/package.json", import.meta.url),
);
const PERFORMANCE_APP_VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const PERFORMANCE_PAGE_SPECS = Object.freeze([
  Object.freeze({
    criticalCommand: "list_spools",
    heading: "Spools",
    key: "inventory",
    label: "Inventory",
  }),
  Object.freeze({
    criticalCommand: "list_printer_overview",
    heading: "Printers",
    key: "printers",
    label: "Printers",
  }),
  Object.freeze({
    criticalCommand: "inventory_overview",
    heading: "Dashboard",
    key: "dashboard",
    label: "Dashboard",
  }),
]);

function parseOptionValue(argv, name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = argv.find((argument) =>
    argument.startsWith(equalsPrefix),
  );
  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }
  const index = argv.lastIndexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function parsePositiveNumber(argv, name, fallback, integer = false) {
  const raw = parseOptionValue(argv, name);
  if (raw == null) {
    return fallback;
  }
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    (integer && !Number.isSafeInteger(value))
  ) {
    throw new Error(
      `${name} requires a positive ${integer ? "integer" : "number"}.`,
    );
  }
  return value;
}

export function parseUiBrowserPerformanceOptions(argv) {
  return {
    headless: !argv.includes("--headful"),
    json: argv.includes("--json"),
    samples: parsePositiveNumber(
      argv,
      "--samples",
      DEFAULT_SAMPLES,
      true,
    ),
    sourcePath: parseOptionValue(argv, "--source"),
    startupBudgetMs: parsePositiveNumber(
      argv,
      "--startup-budget-ms",
      DEFAULT_STARTUP_BUDGET_MS,
    ),
    transitionBudgetMs: parsePositiveNumber(
      argv,
      "--transition-budget-ms",
      DEFAULT_TRANSITION_BUDGET_MS,
    ),
    warmupRuns: parsePositiveNumber(
      argv,
      "--warmup-runs",
      DEFAULT_WARMUP_RUNS,
      true,
    ),
  };
}

export function uiBrowserPerformancePageOrder() {
  return PERFORMANCE_PAGE_SPECS.map(({ key }) => key);
}

async function createUiViteServer(options) {
  const viteEntry = requireFromUi.resolve("vite");
  const { createServer } = await import(pathToFileURL(viteEntry).href);
  return createServer(options);
}

function mapSpoolRows(db) {
  return db
    .prepare(
      `SELECT
         fs.id AS spool_id,
         fs.master_id,
         fs.qr_code,
         fs.rfid_tag,
         fs.rfid_observed_at,
         fs.status,
         fs.ownership_type,
         fs.owner_name,
         fs.owner_contact,
         fs.ownership_note,
         fs.initial_weight_g,
         fs.current_weight_g,
         fs.remaining_g,
         fs.spool_tare_weight_g,
         fs.location_id,
         fs.home_location_id,
         m.id AS master_row_id,
         m.material,
         m.filament_name,
         m.color_name,
         m.hex_color,
         m.product_url,
         m.default_weight,
         m.vendor
       FROM filament_spools fs
       JOIN filament_master_list m ON m.id = fs.master_id
       WHERE fs.deleted_at IS NULL
       ORDER BY fs.id`,
    )
    .all()
    .map((row) => ({
      spool: {
        id: row.spool_id,
        master_id: row.master_id,
        qr_code: row.qr_code,
        rfid_tag: row.rfid_tag,
        rfid_observed_at: row.rfid_observed_at,
        status: row.status,
        ownership_type: row.ownership_type,
        owner_name: row.owner_name,
        owner_contact: row.owner_contact,
        ownership_note: row.ownership_note,
        initial_weight_g: row.initial_weight_g,
        current_weight_g: row.current_weight_g,
        remaining_g: row.remaining_g,
        spool_tare_weight_g: row.spool_tare_weight_g,
        location_id: row.location_id,
        home_location_id: row.home_location_id,
      },
      master: {
        id: row.master_row_id,
        material: row.material,
        filament_name: row.filament_name,
        color_name: row.color_name,
        hex_color: row.hex_color,
        product_url: row.product_url,
        default_weight: row.default_weight,
        vendor: row.vendor,
      },
    }));
}

function mapCatalogRows(db) {
  return db
    .prepare(
      `SELECT id, material, filament_name, color_name, hex_color, product_url,
              default_weight, vendor, is_discontinued, discontinued_at
       FROM filament_master_list
       ORDER BY vendor, material, filament_name, color_name`,
    )
    .all()
    .map((row) => ({
      ...row,
      is_discontinued: Boolean(row.is_discontinued),
    }));
}

function mapPrinterRows(db) {
  const usageStatement = db.prepare(
    `SELECT
       COUNT(*) AS total_jobs,
       SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful_jobs,
       SUM(CASE WHEN success = 1 THEN 0 ELSE 1 END) AS failed_jobs,
       COALESCE(SUM(material_used_g), 0) AS total_used_g,
       MAX(COALESCE(ended_at, started_at)) AS last_job_at
     FROM print_jobs
     WHERE printer_id = ?`,
  );
  const slotsStatement = db.prepare(
    `SELECT
       slot.id AS slot_id,
       slot.ams_id,
       slot.slot_index,
       slot.spool_id,
       spool.status AS spool_status,
       spool.ownership_type AS spool_ownership_type,
       spool.owner_name AS spool_owner_name,
       spool.remaining_g AS spool_remaining_g,
       spool.rfid_tag AS spool_rfid_tag,
       master.material AS spool_material,
       master.filament_name AS spool_filament_name,
       master.color_name AS spool_color_name,
       master.hex_color AS spool_hex_color,
       slot.rfid_override_tray_uuid,
       slot.rfid_override_color_hex,
       slot.live_cache_cleared_at
     FROM ams_units unit
     JOIN ams_slots slot ON slot.ams_id = unit.id
     LEFT JOIN filament_spools spool ON spool.id = slot.spool_id
     LEFT JOIN filament_master_list master ON master.id = spool.master_id
     WHERE unit.printer_id = ?
     ORDER BY unit.id, slot.slot_index`,
  );
  return db
    .prepare(
      `SELECT id, model, name, created_at, updated_at
       FROM printers
       ORDER BY name, id`,
    )
    .all()
    .map((printer) => {
      const usage = usageStatement.get(printer.id);
      return {
        printer,
        usage: {
          total_jobs: Number(usage.total_jobs ?? 0),
          successful_jobs: Number(usage.successful_jobs ?? 0),
          failed_jobs: Number(usage.failed_jobs ?? 0),
          total_used_g: Number(usage.total_used_g ?? 0),
          last_job_at: usage.last_job_at,
        },
        slots: slotsStatement.all(printer.id),
      };
    });
}

function mapLoanRows(db) {
  return db
    .prepare(
      `SELECT
         loan.*,
         spool.status AS spool_status,
         spool.remaining_g AS spool_remaining_g,
         spool.spool_tare_weight_g,
         master.material,
         master.filament_name,
         master.color_name,
         master.vendor,
         master.hex_color
       FROM spool_loans loan
       LEFT JOIN filament_spools spool ON spool.id = loan.spool_id
       LEFT JOIN filament_master_list master ON master.id = spool.master_id
       ORDER BY loan.lent_at DESC, loan.id DESC`,
    )
    .all()
    .map((row) => ({
      loan: {
        id: row.id,
        spool_id: row.spool_id,
        borrower_name: row.borrower_name,
        loan_direction: row.loan_direction,
        loan_status: row.loan_status,
        counterparty_name: row.counterparty_name,
        counterparty_contact: row.counterparty_contact,
        counterparty_note: row.counterparty_note,
        grams_out: row.grams_out,
        lent_note: row.lent_note,
        lent_at: row.lent_at,
        expected_return_at: row.expected_return_at,
        returned_at: row.returned_at,
        returned_grams: row.returned_grams,
        consumed_grams: row.consumed_grams,
        return_note: row.return_note,
      },
      spool_status: row.spool_status,
      spool_remaining_g: row.spool_remaining_g,
      spool_tare_weight_g: row.spool_tare_weight_g,
      material: row.material,
      filament_name: row.filament_name,
      color_name: row.color_name,
      vendor: row.vendor,
      hex_color: row.hex_color,
    }));
}

function mapConsumptionRows(db) {
  return db
    .prepare(
      `SELECT
         job.printer_id,
         printer.name AS printer_name,
         master.material,
         master.filament_name,
         master.color_name,
         master.hex_color,
         master.vendor,
         COALESCE(spool.ownership_type, 'OWNED') AS ownership_type,
         spool.owner_name,
         COALESCE(SUM(job.material_used_g), 0) AS used_grams,
         COUNT(*) AS jobs
       FROM print_jobs job
       LEFT JOIN printers printer ON printer.id = job.printer_id
       LEFT JOIN filament_spools spool ON spool.id = job.spool_id
       LEFT JOIN filament_master_list master ON master.id = spool.master_id
       GROUP BY
         job.printer_id, printer.name, master.material, master.filament_name,
         master.color_name, master.hex_color, master.vendor,
         spool.ownership_type, spool.owner_name
       ORDER BY used_grams DESC`,
    )
    .all();
}

function inventoryOverview(spoolRows, consumptionRows) {
  const low = (row) => {
    const initial = Number(row.spool.initial_weight_g ?? 0);
    const remaining = Number(row.spool.remaining_g ?? 0);
    return initial > 0 && remaining <= initial * 0.2;
  };
  const owned = (row) =>
    String(row.spool.ownership_type ?? "OWNED").toUpperCase() !== "BORROWED_IN";
  const inUse = (row) =>
    ["IN_USE", "BORROWED"].includes(
      String(row.spool.status ?? "").toUpperCase(),
    );
  const totalConsumption = consumptionRows.reduce(
    (sum, row) => sum + Number(row.used_grams ?? 0),
    0,
  );
  const ownedConsumption = consumptionRows
    .filter((row) => String(row.ownership_type).toUpperCase() !== "BORROWED_IN")
    .reduce((sum, row) => sum + Number(row.used_grams ?? 0), 0);
  return {
    total_spools: spoolRows.length,
    total_owned_spools: spoolRows.filter(owned).length,
    total_borrowed_in_spools: spoolRows.filter((row) => !owned(row)).length,
    in_use: spoolRows.filter(inUse).length,
    owned_in_use: spoolRows.filter((row) => owned(row) && inUse(row)).length,
    borrowed_in_in_use: spoolRows.filter(
      (row) => !owned(row) && inUse(row),
    ).length,
    low_stock: spoolRows.filter(low).length,
    owned_low_stock: spoolRows.filter((row) => owned(row) && low(row)).length,
    borrowed_in_low_stock: spoolRows.filter(
      (row) => !owned(row) && low(row),
    ).length,
    total_consumption_30d: totalConsumption,
    owned_consumption_30d: ownedConsumption,
    borrowed_in_consumption_30d: totalConsumption - ownedConsumption,
  };
}

function dashboardOnHandSpoolCount(spoolRows) {
  return spoolRows.filter(({ spool }) => {
    const status = String(spool.status ?? "")
      .trim()
      .toUpperCase()
      .replace(/[-\s]+/g, "_");
    return (
      status === "" ||
      status === "IN_STOCK" ||
      status === "IN_USE" ||
      status === "ASSIGNED" ||
      ![
        "BORROWED",
        "LOANED",
        "LOANED_OUT",
        "EMPTY",
        "LOST",
        "MISSING",
        "DELETED",
      ].includes(status)
    );
  }).length;
}

function statisticsPeriodReport(fixture, period) {
  const printerUsage = fixture.printerRows.map(({ printer, usage }) => ({
    printer_id: printer.id,
    total_jobs: Number(usage?.total_jobs ?? 0),
    successful_jobs: Number(usage?.successful_jobs ?? 0),
    failed_jobs: Number(usage?.failed_jobs ?? 0),
    total_used_g: Number(usage?.total_used_g ?? 0),
    last_job_at: usage?.last_job_at ?? null,
  }));
  const totalUsed = fixture.consumptionRows.reduce(
    (sum, row) => sum + Number(row.used_grams ?? 0),
    0,
  );
  const borrowedInUsed = fixture.consumptionRows
    .filter(
      (row) => String(row.ownership_type).toUpperCase() === "BORROWED_IN",
    )
    .reduce((sum, row) => sum + Number(row.used_grams ?? 0), 0);
  const totalJobs = printerUsage.reduce(
    (sum, row) => sum + row.total_jobs,
    0,
  );
  const successfulJobs = printerUsage.reduce(
    (sum, row) => sum + row.successful_jobs,
    0,
  );
  const emptyCoverage = {
    total_rows: 0,
    valued_rows: 0,
    unvalued_rows: 0,
    covered_grams: 0,
    uncovered_grams: 0,
    missing_reasons: [],
    trace_total_rows: 0,
    trace_returned_rows: 0,
    trace_truncated: false,
  };
  return {
    period,
    total_used_g: totalUsed,
    owned_used_g: totalUsed - borrowedInUsed,
    borrowed_in_used_g: borrowedInUsed,
    total_jobs: totalJobs,
    successful_jobs: successfulJobs,
    failed_jobs: Math.max(0, totalJobs - successfulJobs),
    printer_usage: printerUsage,
    filament_consumption: fixture.consumptionRows,
    value_cost: {
      inventory_value: { totals: [], coverage: { ...emptyCoverage } },
      material_cost: { totals: [], coverage: { ...emptyCoverage } },
      inventory_trace: [],
      material_cost_trace: [],
    },
  };
}

export function buildUiBrowserPerformanceFixture(dbPath) {
  const db = new Database(dbPath, { fileMustExist: true, readonly: true });
  try {
    const spoolRows = mapSpoolRows(db);
    const catalogRows = mapCatalogRows(db);
    const printerRows = mapPrinterRows(db);
    const loanRows = mapLoanRows(db);
    const consumptionRows = mapConsumptionRows(db);
    const activeLoanRows = loanRows
      .filter(
        ({ loan }) =>
          loan.returned_at == null &&
          String(loan.loan_status ?? "ACTIVE").toUpperCase() === "ACTIVE",
      )
      .map((row) => ({
        ...row,
        material: row.material ?? "Unknown",
        filament_name: row.filament_name ?? "Unknown",
        color_name: row.color_name ?? "Unknown",
        vendor: row.vendor ?? "Unknown",
      }));
    const wishlistRows = db
      .prepare(
        `SELECT id, master_id, material, filament_name, color_name, vendor,
                status, quantity, note, created_at, updated_at
         FROM wishlist_items
         ORDER BY created_at DESC, id DESC`,
      )
      .all();
    const bambuLiveIntegrations = db
      .prepare(
        `SELECT key, value
         FROM settings
         WHERE key LIKE 'bambu_live_integration:%'
         ORDER BY key`,
      )
      .all()
      .flatMap((row) => {
        try {
          return [
            {
              printer_id: String(row.key).slice(
                "bambu_live_integration:".length,
              ),
              config: JSON.parse(row.value),
            },
          ];
        } catch {
          return [];
        }
      });
    const libraryId =
      db
        .prepare(
          "SELECT value FROM settings WHERE key = 'library_sync_library_id' LIMIT 1",
        )
        .get()?.value ?? "performance-library";
    const overview = inventoryOverview(spoolRows, consumptionRows);
    const topMaterials = Object.values(
      consumptionRows.reduce((groups, row) => {
        const material = row.material ?? "Unknown";
        groups[material] ??= { material, used_grams: 0 };
        groups[material].used_grams += Number(row.used_grams ?? 0);
        return groups;
      }, {}),
    ).sort((left, right) => right.used_grams - left.used_grams);
    const loanUsage = Object.values(
      loanRows.reduce((groups, row) => {
        const direction = String(row.loan.loan_direction ?? "OUTBOUND");
        const borrowerName =
          row.loan.counterparty_name || row.loan.borrower_name || "Unknown";
        const key = `${direction}\u001f${borrowerName}`;
        groups[key] ??= {
          loan_direction: direction,
          borrower_name: borrowerName,
          total_consumed_g: 0,
          completed_loans: 0,
          active_loans: 0,
        };
        groups[key].total_consumed_g += Number(
          row.loan.consumed_grams ?? 0,
        );
        if (row.loan.returned_at == null) {
          groups[key].active_loans += 1;
        } else {
          groups[key].completed_loans += 1;
        }
        return groups;
      }, {}),
    );
    const printerSettings = {
      active_printer_id: printerRows[0]?.printer.id ?? null,
      printers: printerRows.map(({ printer }) => printer),
      printer_models: [
        ...new Set(printerRows.map(({ printer }) => printer.model)),
      ],
      bambu_live_integrations: bambuLiveIntegrations,
    };
    const evidenceLoan =
      activeLoanRows[0] ?? loanRows[0] ?? null;
    return {
      activeLoanRows,
      appVersion: PERFORMANCE_APP_VERSION,
      catalogRows,
      consumptionRows,
      desktopLifecycleSettings: {
        continue_in_background: false,
        launch_at_login: false,
        launch_at_login_available: true,
        tray_available: true,
      },
      evidence: {
        dashboard: String(dashboardOnHandSpoolCount(spoolRows)),
        inventory:
          spoolRows[0]?.master.color_name ??
          spoolRows[0]?.master.filament_name ??
          null,
        loans:
          evidenceLoan?.loan.counterparty_name ??
          evidenceLoan?.loan.borrower_name ??
          null,
        printers: printerRows[0]?.printer.name ?? null,
        settings: PERFORMANCE_APP_VERSION,
        statistics: printerRows[0]?.printer.name ?? null,
      },
      filamentStandards: {
        settings: {
          schema_version: 1,
          default_purchase_currency: "NOK",
          price_standards: [],
        },
        settings_valid: true,
        groups: [],
      },
      librarySyncSettings: {
        mode: "STANDALONE",
        device_name: "Visual QA performance fixture",
        library_id: String(libraryId),
        client_auth_paired: false,
      },
      loanRows,
      loanUsage,
      overview,
      printerRows,
      printerSettings,
      revisions: {
        inventory: 1,
        catalog: 1,
        loans: 1,
        printers: 1,
        jobs: 1,
        wishlist: 1,
      },
      spoolRows,
      topMaterials,
      trustedLanStatus: {
        enabled: false,
        selected_interface_name: null,
        selected_interface_address: null,
        bind_address: null,
        advertised_hostname: null,
        direct_base_url: null,
        base_url: null,
        shell_url: null,
        listen_port: 4278,
        shell_reachable: false,
        health_error: null,
        running: false,
        last_error: null,
        local_name_running: false,
        local_name_error: null,
        api_version: "1",
        auth_mode: "pairing",
      },
      wishlistRows,
    };
  } finally {
    db.close();
  }
}

function boundedSlice(rows, payload, fallbackLimit) {
  const offset = Math.max(0, Number(payload?.offset ?? 0));
  const limit = Math.max(0, Number(payload?.limit ?? fallbackLimit));
  return rows.slice(offset, offset + limit);
}

export function resolveUiBrowserPerformanceInvoke(
  fixture,
  command,
  payload = {},
) {
  switch (command) {
    case "get_desktop_lifecycle_settings":
      return fixture.desktopLifecycleSettings;
    case "set_continue_in_background":
      return {
        ...fixture.desktopLifecycleSettings,
        continue_in_background: Boolean(payload.enabled),
      };
    case "set_launch_at_login":
      return {
        ...fixture.desktopLifecycleSettings,
        launch_at_login: Boolean(payload.enabled),
      };
    case "get_library_sync_settings":
      return fixture.librarySyncSettings;
    case "get_trusted_lan_companion_status":
      return fixture.trustedLanStatus;
    case "get_library_domain_revisions":
      return fixture.revisions;
    case "get_packaged_desktop_e2e_configuration":
      return null;
    case "get_filament_standards":
      return fixture.filamentStandards;
    case "inventory_overview":
      return fixture.overview;
    case "list_inventory_locations":
      return [];
    case "list_spools":
      return boundedSlice(fixture.spoolRows, payload, 100);
    case "list_printer_overview":
      return fixture.printerRows;
    case "get_printer_settings":
      return fixture.printerSettings;
    case "list_active_spool_loans":
      return fixture.activeLoanRows;
    case "list_spool_loans": {
      const requestedDirection = payload.direction
        ? String(payload.direction).toUpperCase()
        : null;
      const direction = requestedDirection === "ALL" ? null : requestedDirection;
      const includeReturned = payload.includeReturned ?? true;
      const rows = fixture.loanRows.filter(
        ({ loan }) =>
          (!direction ||
            String(loan.loan_direction ?? "OUTBOUND").toUpperCase() ===
              direction) &&
          (includeReturned || loan.returned_at == null),
      );
      return boundedSlice(rows, payload, 500);
    }
    case "list_loan_usage_by_person": {
      const requestedDirection = payload.direction
        ? String(payload.direction).toUpperCase()
        : null;
      const direction = requestedDirection === "ALL" ? null : requestedDirection;
      return fixture.loanUsage
        .filter(
          (row) =>
            !direction ||
            String(row.loan_direction).toUpperCase() === direction,
        )
        .slice(0, Number(payload.limit ?? 30));
    }
    case "list_wishlist_items":
      return boundedSlice(fixture.wishlistRows, payload, 500);
    case "top_materials":
      return boundedSlice(fixture.topMaterials, payload, 12);
    case "list_filament_consumption": {
      const printerId =
        payload.printerId ?? payload.printer_id ?? null;
      const rows = printerId
        ? fixture.consumptionRows.filter(
            (row) => row.printer_id === printerId,
          )
        : fixture.consumptionRows;
      return boundedSlice(rows, payload, 500);
    }
    case "statistics_period_report":
      return statisticsPeriodReport(fixture, payload.period);
    case "list_master_catalog": {
      const search = String(payload.search ?? "").trim().toLowerCase();
      const rows = search
        ? fixture.catalogRows.filter((row) =>
            [
              row.vendor,
              row.material,
              row.filament_name,
              row.color_name,
            ].some((value) =>
              String(value ?? "").toLowerCase().includes(search),
            ),
          )
        : fixture.catalogRows;
      return boundedSlice(rows, payload, 250);
    }
    case "get_app_version":
      return fixture.appVersion;
    case "check_for_app_update":
      return {
        current_version: fixture.appVersion,
        latest_version: fixture.appVersion,
        latest_tag: `v${fixture.appVersion}`,
        release_url:
          "https://github.com/bliatun-code/Filament-Manager/releases/latest",
        status: "UP_TO_DATE",
        update_channel: "PUBLIC_METADATA",
      };
    case "list_trusted_lan_interfaces":
    case "list_trusted_lan_paired_browsers":
      return [];
    case "set_window_title":
    case "set_dock_icon_theme":
    case "set_desktop_tray_menu_labels":
    case "prepare_desktop_visual_qa_window":
    case "signal_desktop_visual_qa_readiness":
      return null;
    default:
      if (
        command.startsWith("plugin:event|") ||
        command.startsWith("plugin:window|") ||
        command.startsWith("plugin:webview|")
      ) {
        return command.endsWith("|listen") ? 1 : null;
      }
      throw new Error(
        `Browser performance fixture has no response for Tauri command ${command}.`,
      );
  }
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    maxMs: Math.max(...samples),
    medianMs: sorted[Math.floor(sorted.length / 2)],
    minMs: Math.min(...samples),
    samplesMs: samples,
  };
}

async function waitForRenderedEvidence(page, label, marker, timeoutMs) {
  await page
    .getByRole("heading", { exact: true, name: label })
    .waitFor({ state: "visible", timeout: timeoutMs });
  if (marker) {
    await page
      .getByText(String(marker))
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
  }
  await page.evaluate(
    () =>
      new Promise((resolveFrame) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolveFrame(undefined)),
        ),
      ),
  );
}

async function runBrowserSample({
  baseUrl,
  browser,
  fixture,
  timeoutMs,
}) {
  const context = await browser.newContext();
  const calls = [];
  const pageErrors = [];
  try {
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error));
    await page.exposeFunction(
      "__bfmPerformanceInvoke",
      async (command, payload) => {
        calls.push({ command, payload: payload ?? {} });
        return resolveUiBrowserPerformanceInvoke(
          fixture,
          command,
          payload,
        );
      },
    );
    await page.addInitScript(() => {
      let callbackSequence = 0;
      const callbacks = new Map();
      const invoke = (command, payload) =>
        window.__bfmPerformanceInvoke(command, payload);
      window.__TAURI__ = { invoke };
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener() {},
      };
      window.__TAURI_INTERNALS__ = {
        invoke,
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main", windowLabel: "main" },
        },
        transformCallback(callback, once = false) {
          callbackSequence += 1;
          const id = callbackSequence;
          callbacks.set(id, { callback, once });
          window[`_${id}`] = (...args) => {
            const current = callbacks.get(id);
            if (!current) {
              return;
            }
            current.callback(...args);
            if (current.once) {
              callbacks.delete(id);
              delete window[`_${id}`];
            }
          };
          return id;
        },
        unregisterCallback(id) {
          callbacks.delete(id);
          delete window[`_${id}`];
        },
      };
    });

    const startupStartedAt = performance.now();
    await page.goto(`${baseUrl}?bfm_locale=en`, {
      waitUntil: "domcontentloaded",
    });
    try {
      await waitForRenderedEvidence(
        page,
        "Dashboard",
        fixture.evidence.dashboard,
        timeoutMs,
      );
    } catch (error) {
      const visibleText = (await page.locator("body").innerText())
        .replace(/\s+/g, " ")
        .slice(0, 1_000);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n` +
          `Commands before startup timeout: ${calls.map(({ command }) => command).join(", ") || "(none)"}\n` +
          `Visible UI: ${visibleText || "(empty)"}`,
        { cause: error },
      );
    }
    const startupReadyMs = performance.now() - startupStartedAt;
    const transitions = {};

    for (const spec of PERFORMANCE_PAGE_SPECS) {
      const commandCountBefore = calls.filter(
        ({ command }) => command === spec.criticalCommand,
      ).length;
      const startedAt = performance.now();
      await page
        .getByRole("button", { exact: true, name: spec.label })
        .click();
      await waitForRenderedEvidence(
        page,
        spec.heading,
        fixture.evidence[spec.key],
        timeoutMs,
      );
      assert.ok(
        calls.filter(({ command }) => command === spec.criticalCommand)
          .length > commandCountBefore ||
          spec.key === "dashboard",
        `${spec.label} did not issue its data-backed ${spec.criticalCommand} request.`,
      );
      transitions[spec.key] = performance.now() - startedAt;
    }

    if (pageErrors.length > 0) {
      throw new AggregateError(
        pageErrors,
        `Browser performance page raised ${pageErrors.length} error(s).`,
      );
    }
    return {
      startupReadyMs,
      transitions,
    };
  } finally {
    await context.close();
  }
}

export async function runUiBrowserPerformanceProbe(options) {
  const generatedFixture = options.sourcePath
    ? null
    : createVisualQaFixture();
  let preparedDatabase = null;
  let server = null;
  let browser = null;
  let primaryError = null;
  try {
    preparedDatabase = await prepareVisualQaDatabase({
      profile: generatedFixture ? "base" : "rich",
      sourcePath: options.sourcePath ?? generatedFixture.outputPath,
    });
    const fixture = buildUiBrowserPerformanceFixture(
      preparedDatabase.targetPath,
    );
    assert.ok(
      fixture.spoolRows.length > 0 &&
        fixture.printerRows.length > 0 &&
        fixture.loanRows.length > 0,
      "The browser performance probe requires inventory, printer, and loan fixture data.",
    );

    server = await createUiViteServer({
      configFile: resolve("ui", "vite.config.ts"),
      logLevel: "error",
      root: resolve("ui"),
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: false,
      },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") {
      throw new Error("Vite did not expose a local performance probe port.");
    }
    const baseUrl = `http://127.0.0.1:${address.port}/`;
    browser = await chromium.launch({ headless: options.headless });

    for (let index = 0; index < options.warmupRuns; index += 1) {
      await runBrowserSample({
        baseUrl,
        browser,
        fixture,
        timeoutMs: options.startupBudgetMs * 2,
      });
    }
    const samples = [];
    for (let index = 0; index < options.samples; index += 1) {
      samples.push(
        await runBrowserSample({
          baseUrl,
          browser,
          fixture,
          timeoutMs: options.startupBudgetMs * 2,
        }),
      );
    }

    const startup = summarize(
      samples.map(({ startupReadyMs }) => startupReadyMs),
    );
    const transitions = Object.fromEntries(
      PERFORMANCE_PAGE_SPECS.map(({ key }) => [
        key,
        summarize(samples.map((sample) => sample.transitions[key])),
      ]),
    );
    const violations = [];
    if (startup.medianMs > options.startupBudgetMs) {
      violations.push(
        `Startup-ready median ${startup.medianMs.toFixed(2)} ms exceeds ${options.startupBudgetMs} ms.`,
      );
    }
    for (const [page, measurement] of Object.entries(transitions)) {
      if (measurement.medianMs > options.transitionBudgetMs) {
        violations.push(
          `${page} transition median ${measurement.medianMs.toFixed(2)} ms exceeds ${options.transitionBudgetMs} ms.`,
        );
      }
    }
    return {
      budgets: {
        startupBudgetMs: options.startupBudgetMs,
        transitionBudgetMs: options.transitionBudgetMs,
      },
      fixture: {
        databaseSource: generatedFixture ? "sanitized-visual-qa" : "local-copy",
        loans: fixture.loanRows.length,
        printers: fixture.printerRows.length,
        spools: fixture.spoolRows.length,
      },
      samples: options.samples,
      startup,
      transitions,
      violations,
      warmupRuns: options.warmupRuns,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (server) {
      try {
        await server.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const path of [
      preparedDatabase?.live ? null : preparedDatabase?.targetPath,
      generatedFixture?.outputPath,
    ]) {
      if (!path) {
        continue;
      }
      try {
        cleanupVisualQaDatabase(path);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (primaryError && cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        `${primaryError.message}\nBrowser performance probe cleanup also failed.`,
        { cause: primaryError },
      );
    }
    if (!primaryError && cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        "Browser performance probe cleanup failed.",
      );
    }
  }
  if (primaryError) {
    throw primaryError;
  }
  throw new Error("Browser performance probe did not produce a result.");
}

function formatMeasurement(measurement) {
  return `median ${measurement.medianMs.toFixed(2)} ms (min ${measurement.minMs.toFixed(2)}, max ${measurement.maxMs.toFixed(2)})`;
}

async function main() {
  const options = parseUiBrowserPerformanceOptions(process.argv.slice(2));
  const result = await runUiBrowserPerformanceProbe(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const lines = [
      `Data-backed browser performance probe (${result.fixture.spools} spools, ${result.fixture.printers} printers, ${result.fixture.loans} loans):`,
      `  Startup ready: ${formatMeasurement(result.startup)}`,
      ...Object.entries(result.transitions).map(
        ([page, measurement]) =>
          `  ${page}: ${formatMeasurement(measurement)}`,
      ),
      result.violations.length === 0
        ? "  Result: within advisory local budgets."
        : `  Advisory violations:\n${result.violations.map((violation) => `    - ${violation}`).join("\n")}`,
      "",
    ];
    process.stdout.write(lines.join("\n"));
  }
  if (result.violations.length > 0) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
