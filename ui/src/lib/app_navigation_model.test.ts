import assert from "node:assert/strict";
import test from "node:test";

import {
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
});

test("initial page resolver opens the page requested by fixtures and visual QA scenarios", () => {
  assert.equal(resolveInitialPageFromSearch("?bfm_inventory_fixture=detail"), "inventory");
  assert.equal(resolveInitialPageFromSearch("bfm_inventory_fixture=detail"), "inventory");
  assert.equal(resolveInitialPageFromSearch("?bfm_visual_qa=add-filament"), "inventory");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=rfid-capture"), "inventory");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=bambu-batch-add"), "inventory");
  assert.equal(resolveInitialPageFromSearch("?bfm_visual_qa=return-loan"), "loans");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=printer-board"), "printers");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=printer-slot-assignment"), "printers");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=printer-slot-onboarding"), "printers");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-general"), "settings");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-library"), "settings");
  assert.equal(
    resolveInitialPageFromSearch("bfm_visual_qa=settings-printer-diagnostics"),
    "settings",
  );
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-catalog"), "settings");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=settings-maintenance"), "settings");
  assert.equal(resolveInitialPageFromSearch("bfm_visual_qa=statistics-overview"), "statistics");
  assert.equal(resolveInitialPageFromSearch("?bfm_inventory_fixture=list"), "dashboard");
  assert.equal(resolveInitialPageFromSearch(""), "dashboard");
  assert.equal(resolveInitialPageFromSearch(null), "dashboard");
});
