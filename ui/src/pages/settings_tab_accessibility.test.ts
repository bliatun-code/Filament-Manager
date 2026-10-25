import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveSettingsTabNavigationIndex,
  settingsTabId,
  settingsTabPanelId,
} from "./settings_tab_accessibility";
import { settingsRouteOutletGridClass } from "./settings_route_layout";

const navSource = readFileSync(new URL("./settings_tab_nav.tsx", import.meta.url), "utf8");
const accessibilitySource = readFileSync(
  new URL("./settings_tab_accessibility.ts", import.meta.url),
  "utf8",
);
const outletSource = readFileSync(new URL("./settings_route_outlet.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("./settings_page_layout.tsx", import.meta.url), "utf8");

test("settings tabs and active panel expose matching ARIA relationships", () => {
  assert.match(navSource, /role="tablist"/);
  assert.match(navSource, /aria-label=\{label\}/);
  assert.match(navSource, /role="tab"/);
  assert.match(navSource, /aria-selected=\{tab\.active\}/);
  assert.match(navSource, /aria-controls=\{settingsTabPanelId\(tab\.id\)\}/);
  assert.match(navSource, /tabIndex=\{tab\.active \? 0 : -1\}/);
  assert.match(accessibilitySource, /key === "ArrowRight"/);
  assert.match(accessibilitySource, /key === "ArrowLeft"/);
  assert.match(outletSource, /role="tabpanel"/);
  assert.match(outletSource, /aria-labelledby=\{settingsTabId\(activeTab\)\}/);
  assert.match(layoutSource, /<SettingsTabNav label=\{title\}/);
  assert.equal(settingsTabId("GENERAL"), "settings-tab-general");
  assert.equal(settingsTabPanelId("GENERAL"), "settings-panel-general");
  assert.equal(
    settingsTabId("FILAMENT_DEFAULTS"),
    "settings-tab-filament-defaults",
  );
  assert.equal(
    settingsTabPanelId("FILAMENT_DEFAULTS"),
    "settings-panel-filament-defaults",
  );
});

test("settings navigation uses a vertical sidebar with a compact narrow layout", () => {
  assert.match(navSource, /settings-balanced-sidebar/);
  assert.match(navSource, /aria-orientation="vertical"/);
  assert.match(navSource, /settings-balanced-tab-active/);
  assert.doesNotMatch(navSource, /min-\[1050px\]:grid-cols-6/);
});

test("compact settings tabs keep two columns at laptop widths", () => {
  assert.equal(
    settingsRouteOutletGridClass("FILAMENT_DEFAULTS"),
    "grid min-w-0 grid-cols-1",
  );
  assert.equal(
    settingsRouteOutletGridClass("GENERAL"),
    "grid min-w-0 grid-cols-1",
  );
  assert.equal(settingsRouteOutletGridClass("PRINTERS"), "grid min-w-0 grid-cols-1");
});

test("settings tab keyboard navigation wraps and supports Home and End", () => {
  assert.equal(resolveSettingsTabNavigationIndex(0, 6, "ArrowRight"), 1);
  assert.equal(resolveSettingsTabNavigationIndex(5, 6, "ArrowRight"), 0);
  assert.equal(resolveSettingsTabNavigationIndex(0, 6, "ArrowLeft"), 5);
  assert.equal(resolveSettingsTabNavigationIndex(5, 6, "ArrowDown"), 0);
  assert.equal(resolveSettingsTabNavigationIndex(0, 6, "ArrowUp"), 5);
  assert.equal(resolveSettingsTabNavigationIndex(3, 6, "Home"), 0);
  assert.equal(resolveSettingsTabNavigationIndex(1, 6, "End"), 5);
  assert.equal(resolveSettingsTabNavigationIndex(1, 6, "Enter"), null);
  assert.equal(resolveSettingsTabNavigationIndex(0, 0, "ArrowRight"), null);
});
