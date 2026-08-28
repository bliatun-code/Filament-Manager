import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./settings_ui.tsx", import.meta.url), "utf8");
const catalogRefreshPanelSource = readFileSync(
  new URL("../pages/settings_catalog_refresh_panel.tsx", import.meta.url),
  "utf8",
);
const catalogTabSource = readFileSync(
  new URL("../pages/settings_catalog_tab.tsx", import.meta.url),
  "utf8",
);
const generalTabSource = readFileSync(
  new URL("./settings_general_tab.tsx", import.meta.url),
  "utf8",
);
const libraryTabSource = readFileSync(
  new URL("../pages/settings_library_tab.tsx", import.meta.url),
  "utf8",
);
const libraryClientPanelSource = readFileSync(
  new URL("../pages/settings_library_client_panel.tsx", import.meta.url),
  "utf8",
);
const libraryRolePanelSource = readFileSync(
  new URL("../pages/settings_library_role_panel.tsx", import.meta.url),
  "utf8",
);
const libraryWebappControlSource = readFileSync(
  new URL("../pages/settings_library_webapp_control.tsx", import.meta.url),
  "utf8",
);
const maintenanceTabSource = readFileSync(
  new URL("./settings_maintenance_tab.tsx", import.meta.url),
  "utf8",
);
const missingSwatchesPanelSource = readFileSync(
  new URL("./settings_missing_swatches_panel.tsx", import.meta.url),
  "utf8",
);

test("Settings UI primitives use shared section label typography", () => {
  assert.match(source, /settingsSectionLabelClass/);
  assert.doesNotMatch(source, /tracking-\[0\.22em\]/);
});

test("settings section chrome is owned by shared primitives", () => {
  for (const exportName of [
    "SettingsNotice",
    "SettingsSectionPanel",
    "SettingsSectionHeader",
    "SettingsSectionBody",
    "SettingsSectionControls",
    "SettingsSectionEmptyState",
    "SettingsSurfaceCard",
  ]) {
    assert.match(source, new RegExp(`export function ${exportName}`));
  }
  assert.match(source, /surface-subtle overflow-hidden p-0/);
  assert.match(source, /border-b border-slate-200\/80 px-5 py-5/);
  assert.match(source, /rounded-lg border border-slate-200 bg-white\/75 p-4/);
  assert.match(source, /settingsNoticeToneClassNames/);
});

test("settings top-level tabs use the shared surface card primitive", () => {
  for (const panelSource of [
    catalogTabSource,
    generalTabSource,
    libraryTabSource,
    maintenanceTabSource,
    readFileSync(new URL("./settings_printers_tab.tsx", import.meta.url), "utf8"),
  ]) {
    assert.match(panelSource, /SettingsSurfaceCard/);
    assert.doesNotMatch(panelSource, /<section className="surface-card/);
  }
});

test("settings library panels use shared wide group labels", () => {
  for (const panelSource of [
    libraryClientPanelSource,
    libraryRolePanelSource,
    libraryWebappControlSource,
  ]) {
    assert.match(panelSource, /settingsGroupLabelClass/);
    assert.doesNotMatch(panelSource, /tracking-\[0\.28em\]/);
  }
});

test("settings catalog and maintenance panels use shared section chrome", () => {
  for (const panelSource of [
    catalogRefreshPanelSource,
    maintenanceTabSource,
    missingSwatchesPanelSource,
  ]) {
    assert.match(panelSource, /SettingsSectionPanel/);
    assert.match(panelSource, /SettingsSectionHeader/);
    assert.match(panelSource, /SettingsSectionBody/);
    assert.match(panelSource, /SettingsNotice/);
    assert.doesNotMatch(panelSource, /surface-subtle mt-[46] overflow-hidden p-0/);
    assert.doesNotMatch(panelSource, /border-b border-slate-200\/80 px-5 py-5/);
    assert.doesNotMatch(
      panelSource,
      /rounded-lg border border-slate-200 bg-white\/75 p-4 shadow-sm/,
    );
    assert.doesNotMatch(
      panelSource,
      /rounded-lg border border-sky-500\/30 bg-sky-500\/10 px-3 py-2 text-xs font-medium/,
    );
  }
});

test("settings catalog uses discovery before a single-material refresh", () => {
  assert.match(catalogRefreshPanelSource, /role="progressbar"/);
  assert.match(catalogRefreshPanelSource, /aria-label=\{catalogRefreshProgressMessage\}/);
  assert.doesNotMatch(catalogRefreshPanelSource, /w-2\/3 animate-pulse/);
  assert.match(catalogRefreshPanelSource, /settings\.discoverCatalogMaterials/);
  assert.match(catalogRefreshPanelSource, /settings\.refreshSelectedMaterial/);
  assert.match(catalogRefreshPanelSource, /!activeCatalogRefreshMaterial/);
  assert.doesNotMatch(catalogRefreshPanelSource, /settings\.runFullVendorAudit/);
  assert.doesNotMatch(catalogRefreshPanelSource, /settings\.catalogAllTypes/);
});

test("settings swatch visual QA waits for data and scrolls a permanent target", () => {
  assert.match(catalogTabSource, /visibleMissingSwatchMasters\.length/);
  assert.match(catalogTabSource, /visibleMissingSwatchCount === 0/);
  assert.match(catalogTabSource, /requestAnimationFrame/);
  assert.match(catalogTabSource, /id="settings-catalog-swatch-review-panel"/);
  assert.match(catalogTabSource, /className="scroll-mt-24"/);
  assert.match(catalogTabSource, /scrollIntoView\(\{ behavior: "auto", block: "start" \}\)/);
  assert.doesNotMatch(catalogTabSource, /setTimeout/);
});
