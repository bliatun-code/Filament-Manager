import assert from "node:assert/strict";
import test from "node:test";

import {
  parseUiBrowserPerformanceOptions,
  resolveUiBrowserPerformanceInvoke,
  uiBrowserPerformancePageOrder,
} from "./ui-browser-performance-probe.mjs";

function fixture() {
  return {
    activeLoanRows: [{ loan: { id: "active" } }],
    appVersion: "0.22.0",
    catalogRows: [{ id: "master-a", color_name: "Black" }],
    consumptionRows: [
      { printer_id: "printer-a", material: "PLA", used_grams: 10 },
      { printer_id: "printer-b", material: "PETG", used_grams: 20 },
    ],
    desktopLifecycleSettings: {
      continue_in_background: false,
      launch_at_login: false,
      launch_at_login_available: true,
      tray_available: true,
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
    librarySyncSettings: { mode: "STANDALONE" },
    loanRows: [
      {
        loan: {
          id: "active",
          loan_direction: "OUTBOUND",
          returned_at: null,
        },
      },
      {
        loan: {
          id: "returned",
          loan_direction: "INBOUND",
          returned_at: "2026-07-29",
        },
      },
    ],
    loanUsage: [
      { loan_direction: "OUTBOUND", borrower_name: "Fixture" },
    ],
    overview: { total_spools: 2 },
    printerRows: [{ printer: { id: "printer-a" } }],
    printerSettings: { printers: [{ id: "printer-a" }] },
    revisions: { inventory: 1 },
    spoolRows: [{ spool: { id: "spool-a" } }, { spool: { id: "spool-b" } }],
    topMaterials: [{ material: "PLA" }],
    trustedLanStatus: { enabled: false },
    wishlistRows: [{ id: "wish-a" }],
  };
}

test("browser performance options keep wall-clock work advisory and local", () => {
  assert.deepEqual(parseUiBrowserPerformanceOptions([]), {
    headless: true,
    json: false,
    samples: 3,
    sourcePath: null,
    startupBudgetMs: 5_000,
    transitionBudgetMs: 1_500,
    warmupRuns: 1,
  });
  assert.deepEqual(
    parseUiBrowserPerformanceOptions([
      "--headful",
      "--json",
      "--samples=5",
      "--source",
      "fixture.db",
      "--startup-budget-ms=6000",
      "--transition-budget-ms",
      "2000",
      "--warmup-runs=2",
    ]),
    {
      headless: false,
      json: true,
      samples: 5,
      sourcePath: "fixture.db",
      startupBudgetMs: 6_000,
      transitionBudgetMs: 2_000,
      warmupRuns: 2,
    },
  );
  assert.throws(
    () => parseUiBrowserPerformanceOptions(["--samples=1.5"]),
    /--samples requires a positive integer/,
  );
});

test("browser performance page order covers the primary data-heavy transitions and revisit", () => {
  assert.deepEqual(uiBrowserPerformancePageOrder(), [
    "inventory",
    "printers",
    "dashboard",
  ]);
});

test("browser performance invoke adapter serves bounded data-backed pages", () => {
  const data = fixture();
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(
      data,
      "get_desktop_lifecycle_settings",
    ),
    data.desktopLifecycleSettings,
  );
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(data, "set_continue_in_background", {
      enabled: true,
    }),
    {
      ...data.desktopLifecycleSettings,
      continue_in_background: true,
    },
  );
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(data, "set_launch_at_login", {
      enabled: true,
    }),
    {
      ...data.desktopLifecycleSettings,
      launch_at_login: true,
    },
  );
  assert.equal(
    resolveUiBrowserPerformanceInvoke(
      data,
      "set_desktop_tray_menu_labels",
      { openLabel: "Open", quitLabel: "Quit" },
    ),
    null,
  );
  assert.equal(
    resolveUiBrowserPerformanceInvoke(
      data,
      "get_packaged_desktop_e2e_configuration",
    ),
    null,
  );
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(data, "get_filament_standards"),
    data.filamentStandards,
  );
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(data, "list_inventory_locations"),
    [],
  );
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(data, "list_spools", {
      limit: 1,
      offset: 1,
    }),
    [{ spool: { id: "spool-b" } }],
  );
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(data, "list_spool_loans", {
      direction: "OUTBOUND",
      includeReturned: false,
    }),
    [data.loanRows[0]],
  );
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(data, "list_spool_loans", {
      direction: "ALL",
      includeReturned: true,
    }),
    data.loanRows,
  );
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(data, "list_filament_consumption", {
      printerId: "printer-b",
    }),
    [data.consumptionRows[1]],
  );
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(data, "statistics_period_report", {
      period: {
        start_at_utc: "2026-08-01T00:00:00Z",
        end_at_utc: "2026-09-01T00:00:00Z",
      },
    }),
    {
      period: {
        start_at_utc: "2026-08-01T00:00:00Z",
        end_at_utc: "2026-09-01T00:00:00Z",
      },
      total_used_g: 30,
      owned_used_g: 30,
      borrowed_in_used_g: 0,
      total_jobs: 0,
      successful_jobs: 0,
      failed_jobs: 0,
      printer_usage: [
        {
          printer_id: "printer-a",
          total_jobs: 0,
          successful_jobs: 0,
          failed_jobs: 0,
          total_used_g: 0,
          last_job_at: null,
        },
      ],
      filament_consumption: data.consumptionRows,
      value_cost: {
        inventory_value: {
          totals: [],
          coverage: {
            total_rows: 0,
            valued_rows: 0,
            unvalued_rows: 0,
            covered_grams: 0,
            uncovered_grams: 0,
            missing_reasons: [],
            trace_total_rows: 0,
            trace_returned_rows: 0,
            trace_truncated: false,
          },
        },
        material_cost: {
          totals: [],
          coverage: {
            total_rows: 0,
            valued_rows: 0,
            unvalued_rows: 0,
            covered_grams: 0,
            uncovered_grams: 0,
            missing_reasons: [],
            trace_total_rows: 0,
            trace_returned_rows: 0,
            trace_truncated: false,
          },
        },
        inventory_trace: [],
        material_cost_trace: [],
      },
    },
  );
  assert.deepEqual(
    resolveUiBrowserPerformanceInvoke(data, "check_for_app_update"),
    {
      current_version: "0.22.0",
      latest_version: "0.22.0",
      latest_tag: "v0.22.0",
      release_url:
        "https://github.com/bliatun-code/Filament-Manager/releases/latest",
      status: "UP_TO_DATE",
      update_channel: "PUBLIC_METADATA",
    },
  );
  assert.throws(
    () =>
      resolveUiBrowserPerformanceInvoke(
        data,
        "unreviewed_performance_command",
      ),
    /no response for Tauri command/,
  );
});
