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

test("initial page resolver opens inventory for the detail fixture only", () => {
  assert.equal(resolveInitialPageFromSearch("?bfm_inventory_fixture=detail"), "inventory");
  assert.equal(resolveInitialPageFromSearch("bfm_inventory_fixture=detail"), "inventory");
  assert.equal(resolveInitialPageFromSearch("?bfm_inventory_fixture=list"), "dashboard");
  assert.equal(resolveInitialPageFromSearch(""), "dashboard");
  assert.equal(resolveInitialPageFromSearch(null), "dashboard");
});
