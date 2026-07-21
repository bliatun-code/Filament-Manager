import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_PAGE_LABEL_FALLBACKS,
  APP_PAGE_ORDER,
  resolveInitialPageFromSearch,
  type PageKey,
} from "./app_navigation_model";

test("app page order keeps the primary navigation stable", () => {
  assert.deepEqual(APP_PAGE_ORDER, [
    "dashboard",
    "inventory",
    "loans",
    "printers",
    "statistics",
    "settings",
  ] satisfies PageKey[]);
  assert.deepEqual(APP_PAGE_LABEL_FALLBACKS, {
    dashboard: "Dashboard",
    inventory: "Inventory",
    loans: "Loans",
    printers: "Printers",
    statistics: "Statistics",
    settings: "Settings",
  } satisfies Record<PageKey, string>);
});

test("initial page resolver opens the page requested by fixtures and visual QA scenarios", () => {
  assert.equal(resolveInitialPageFromSearch("?bfm_inventory_fixture=detail"), "inventory");
  assert.equal(resolveInitialPageFromSearch("bfm_inventory_fixture=detail"), "inventory");
  assert.equal(resolveInitialPageFromSearch("?bfm_visual_qa=dashboard-overview"), "dashboard");
  assert.equal(resolveInitialPageFromSearch("?bfm_visual_qa=inventory-overview"), "inventory");
  assert.equal(resolveInitialPageFromSearch("?bfm_visual_qa=add-filament"), "inventory");
  assert.equal(resolveInitialPageFromSearch("?bfm_visual_qa=wishlist-queue"), "inventory");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=selected-roll-history"), "inventory");
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=selected-roll-danger-zone"),
    "inventory",
  );
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=rfid-capture"), "inventory");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=bambu-batch-add"), "inventory");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=loans-overview"), "loans");
  assert.equal(resolveInitialPageFromSearch("?bfm_visual_qa=return-loan"), "loans");
  assert.equal(resolveInitialPageFromSearch("?bfm_visual_qa=return-inbound-loan"), "loans");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=printer-board"), "printers");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=add-printer"), "printers");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=printer-slot-assignment"), "printers");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=printer-slot-onboarding"), "printers");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=printer-rfid-override"), "printers");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=printer-slot-replacement"), "printers");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=printer-slot-clear"), "printers");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-general"), "settings");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-library"), "settings");
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-library-role-change"),
    "settings",
  );
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-library-network-details"),
    "settings",
  );
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-library-network-editor"),
    "settings",
  );
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-library-pairing"), "settings");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-library-browsers"), "settings");
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-library-browsers-history"),
    "settings",
  );
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-printer-diagnostics"),
    "settings",
  );
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-printer-diagnostics-fields"),
    "settings",
  );
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-printer-diagnostics-paused"),
    "settings",
  );
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-printer-editor"), "settings");
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-printer-editor-dirty"),
    "settings",
  );
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-printer-editor-discard"),
    "settings",
  );
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-catalog"), "settings");
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-catalog-swatch-review"),
    "settings",
  );
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-maintenance"), "settings");
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-application-diagnostics"),
    "settings",
  );
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=statistics-overview"), "statistics");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=statistics-consumption"), "statistics");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=statistics-borrower"), "statistics");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=statistics-loans"), "statistics");
  assert.equal(resolveInitialPageFromSearch("?bfm_inventory_fixture=list"), "dashboard");
  assert.equal(resolveInitialPageFromSearch(""), "dashboard");
  assert.equal(resolveInitialPageFromSearch(null), "dashboard");
});
