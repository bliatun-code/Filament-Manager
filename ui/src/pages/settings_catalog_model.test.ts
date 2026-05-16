import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsCatalogRefreshSuccessMessage,
  buildSettingsCatalogRefreshFallbackErrorMessage,
  buildSettingsCatalogRefreshPreparingMessage,
  buildSettingsCatalogRefreshZeroImportMessage,
  buildSettingsCatalogState,
  buildSettingsNoMissingSwatchesMessage,
  buildSettingsSwatchBulkResultMessage,
  buildSettingsSwatchBulkConfirmMessage,
  buildSettingsSwatchDrafts,
  buildSettingsSwatchErrorMessage,
  buildSettingsSwatchSavedMessage,
  resolveSettingsSwatchHex,
  settingsCatalogRefreshSummaryGridClass,
  settingsCatalogRefreshSummaryHasFetchDetails,
  toggleSettingsCatalogRefreshMaterial,
} from "./settings_catalog_model";
import type { CatalogRefreshResult, MasterCatalogRow } from "../lib/tauri_client";

function catalogMaster(overrides: Partial<MasterCatalogRow>): MasterCatalogRow {
  return {
    id: "master-1",
    material: "PLA",
    filament_name: "PLA Basic",
    color_name: "Orange",
    hex_color: "#FFAA00",
    default_weight: 1000,
    vendor: "Bambu Lab",
    ...overrides,
  };
}

function refreshResult(overrides: Partial<CatalogRefreshResult> = {}): CatalogRefreshResult {
  return {
    imported: 12,
    reactivated_count: 2,
    discontinued_count: 1,
    output: "",
    ...overrides,
  };
}

test("settings catalog state groups vendor catalogs and material filters", () => {
  const state = buildSettingsCatalogState({
    bambuRefreshMaterials: ["PLA"],
    catalogMasters: [
      catalogMaster({ id: "bambu-pla", material: "PLA", vendor: "Bambu Lab" }),
      catalogMaster({ id: "bambu-petg", material: " PETG ", vendor: "Bambu Lab" }),
      catalogMaster({ id: "esun-abs", material: "ABS", vendor: "eSUN" }),
      catalogMaster({ id: "other", material: "ASA", vendor: "Other" }),
    ],
    catalogVendor: "Bambu",
    esunRefreshMaterials: ["ABS"],
    swatchVendorFilter: "ALL",
  });

  assert.deepEqual(
    state.bambuCatalogMasters.map((master) => master.id),
    ["bambu-pla", "bambu-petg"],
  );
  assert.deepEqual(state.bambuCatalogMaterialOptions, ["PETG", "PLA"]);
  assert.deepEqual(
    state.esunCatalogMasters.map((master) => master.id),
    ["esun-abs"],
  );
  assert.deepEqual(state.esunCatalogMaterialOptions, ["ABS"]);
  assert.equal(state.activeCatalogMasterCount, 2);
  assert.deepEqual(state.activeCatalogMaterialOptions, ["PETG", "PLA"]);
  assert.deepEqual(state.activeCatalogRefreshMaterials, ["PLA"]);
});

test("settings catalog state tracks missing swatches and visible vendor count", () => {
  const state = buildSettingsCatalogState({
    bambuRefreshMaterials: [],
    catalogMasters: [
      catalogMaster({ id: "bambu-missing", hex_color: "", vendor: "Bambu Lab" }),
      catalogMaster({ id: "bambu-ok", hex_color: "#112233", vendor: "Bambu Lab" }),
      catalogMaster({ id: "esun-missing", hex_color: "nope", vendor: "eSUN" }),
      catalogMaster({ id: "other-missing", hex_color: null, vendor: "Other" }),
    ],
    catalogVendor: "eSUN",
    esunRefreshMaterials: ["ABS"],
    swatchVendorFilter: "esun",
  });

  assert.deepEqual(
    state.missingSwatchMasters.map((master) => master.id),
    ["bambu-missing", "esun-missing", "other-missing"],
  );
  assert.deepEqual(state.swatchVendorOptions, ["ALL", "Bambu Lab", "eSUN", "Other"]);
  assert.deepEqual(
    state.visibleMissingSwatchMasters.map((master) => master.id),
    ["esun-missing"],
  );
  assert.equal(state.visibleMissingSwatchVendorCount, 1);
  assert.equal(state.activeCatalogMasterCount, 1);
  assert.deepEqual(state.activeCatalogRefreshMaterials, ["ABS"]);
});

test("settings swatch drafts normalize saved colors and suggest missing swatches", () => {
  const drafts = buildSettingsSwatchDrafts([
    catalogMaster({ id: "short-hex", hex_color: "#abc", color_name: "Blue" }),
    catalogMaster({ id: "named-color", hex_color: "", color_name: "Orange" }),
    catalogMaster({ id: "unknown", hex_color: "not-a-color", color_name: "Mystery Fog" }),
  ]);

  assert.equal(drafts["short-hex"], "#ABC");
  assert.equal(drafts["named-color"], "#F97316");
  assert.match(drafts.unknown, /^#[0-9A-F]{6}$/);
});

test("settings swatch hex resolves draft values before fallback suggestions", () => {
  const master = catalogMaster({
    id: "draft",
    hex_color: "",
    color_name: "Orange",
  });

  assert.equal(
    resolveSettingsSwatchHex({ master, swatchDraftById: { draft: "#abc" } }),
    "#ABC",
  );
  assert.equal(
    resolveSettingsSwatchHex({ master, swatchDraftById: { draft: "not-a-color" } }),
    "#F97316",
  );
  assert.equal(resolveSettingsSwatchHex({ master, swatchDraftById: {} }), "#F97316");
});

test("settings catalog material toggles are immutable and symmetric", () => {
  const existing = ["ABS", "PLA"];

  assert.deepEqual(toggleSettingsCatalogRefreshMaterial(existing, "PETG"), [
    "ABS",
    "PLA",
    "PETG",
  ]);
  assert.deepEqual(toggleSettingsCatalogRefreshMaterial(existing, "ABS"), ["PLA"]);
  assert.deepEqual(existing, ["ABS", "PLA"]);
});

test("settings catalog refresh summary presentation detects optional fetch details", () => {
  const basic = refreshResult();
  const withCache = refreshResult({ reused_cached_products: 4 });
  const withFetches = refreshResult({ detail_fetches: 7 });

  assert.equal(settingsCatalogRefreshSummaryHasFetchDetails(basic), false);
  assert.equal(settingsCatalogRefreshSummaryGridClass(basic), "sm:grid-cols-3");
  assert.equal(settingsCatalogRefreshSummaryHasFetchDetails(withCache), true);
  assert.equal(settingsCatalogRefreshSummaryGridClass(withCache), "sm:grid-cols-2 xl:grid-cols-5");
  assert.equal(settingsCatalogRefreshSummaryHasFetchDetails(withFetches), true);
});

test("settings catalog refresh success message keeps the compact summary stable", () => {
  assert.equal(
    buildSettingsCatalogRefreshSuccessMessage(refreshResult(), {
      imported: "Imported",
      reactivated: "Reactivated",
      discontinued: "Discontinued",
    }),
    "Imported 12 · Reactivated 2 · Discontinued 1",
  );
});

test("settings catalog refresh vendor messages follow the selected vendor", () => {
  const labels = {
    refreshBambuFailed: "Catalog refresh failed.",
    refreshEsunFailed: "eSUN catalog refresh failed.",
    refreshPreparingBambu: "Preparing Bambu catalog refresh...",
    refreshPreparingEsun: "Preparing eSUN catalog refresh...",
    zeroBambu:
      "Refresh completed with 0 imported rows. The store may be rate-limited or changed.",
    zeroEsun: "eSUN refresh completed with 0 imported rows. Store format may have changed.",
  };

  assert.equal(
    buildSettingsCatalogRefreshPreparingMessage("Bambu", labels),
    labels.refreshPreparingBambu,
  );
  assert.equal(
    buildSettingsCatalogRefreshPreparingMessage("eSUN", labels),
    labels.refreshPreparingEsun,
  );
  assert.equal(buildSettingsCatalogRefreshZeroImportMessage("Bambu", labels), labels.zeroBambu);
  assert.equal(buildSettingsCatalogRefreshZeroImportMessage("eSUN", labels), labels.zeroEsun);
  assert.equal(
    buildSettingsCatalogRefreshFallbackErrorMessage("Bambu", labels),
    labels.refreshBambuFailed,
  );
  assert.equal(
    buildSettingsCatalogRefreshFallbackErrorMessage("eSUN", labels),
    labels.refreshEsunFailed,
  );
});

test("settings swatch bulk result message reports no updated rows as an error", () => {
  assert.deepEqual(
    buildSettingsSwatchBulkResultMessage(
      { failed: 2, skipped: 1, updated: 0 },
      {
        confirmBulkSwatchTapAgain: "Click Auto-fill visible missing swatches again to confirm.",
        failed: "failed",
        noMissingSwatches: "No missing swatches to fill.",
        noVisibleMissingSwatchesCouldBeAutoFilled:
          "No visible missing swatches could be auto-filled.",
        skipped: "skipped",
        swatchBulkUpdateCompleted: "Swatch bulk update completed",
        updated: "updated",
      },
    ),
    {
      kind: "error",
      message: "No visible missing swatches could be auto-filled. failed 2, skipped 1.",
    },
  );
});

test("settings swatch bulk result message reports successful updates with optional failures", () => {
  assert.deepEqual(
    buildSettingsSwatchBulkResultMessage(
      { failed: 0, skipped: 0, updated: 5 },
      {
        confirmBulkSwatchTapAgain: "Click Auto-fill visible missing swatches again to confirm.",
        failed: "failed",
        noMissingSwatches: "No missing swatches to fill.",
        noVisibleMissingSwatchesCouldBeAutoFilled:
          "No visible missing swatches could be auto-filled.",
        skipped: "skipped",
        swatchBulkUpdateCompleted: "Swatch bulk update completed",
        updated: "updated",
      },
    ),
    {
      kind: "info",
      message: "Swatch bulk update completed: updated 5.",
    },
  );

  assert.deepEqual(
    buildSettingsSwatchBulkResultMessage(
      { failed: 1, skipped: 2, updated: 5 },
      {
        confirmBulkSwatchTapAgain: "Click Auto-fill visible missing swatches again to confirm.",
        failed: "failed",
        noMissingSwatches: "No missing swatches to fill.",
        noVisibleMissingSwatchesCouldBeAutoFilled:
          "No visible missing swatches could be auto-filled.",
        skipped: "skipped",
        swatchBulkUpdateCompleted: "Swatch bulk update completed",
        updated: "updated",
      },
    ),
    {
      kind: "info",
      message: "Swatch bulk update completed: updated 5, failed 1, skipped 2.",
    },
  );
});

test("settings swatch single-action messages return stable copy", () => {
  const bulkLabels = {
    confirmBulkSwatchTapAgain: "Click Auto-fill visible missing swatches again to confirm.",
    failed: "failed",
    noMissingSwatches: "No missing swatches to fill.",
    noVisibleMissingSwatchesCouldBeAutoFilled:
      "No visible missing swatches could be auto-filled.",
    skipped: "skipped",
    swatchBulkUpdateCompleted: "Swatch bulk update completed",
    updated: "updated",
  };

  assert.equal(
    buildSettingsSwatchSavedMessage("PLA Basic Black", { swatchSaved: "Saved swatch" }),
    "Saved swatch: PLA Basic Black",
  );
  assert.equal(buildSettingsNoMissingSwatchesMessage(bulkLabels), bulkLabels.noMissingSwatches);
  assert.equal(
    buildSettingsSwatchBulkConfirmMessage(bulkLabels),
    bulkLabels.confirmBulkSwatchTapAgain,
  );
});

test("settings swatch error messages return stable fallback copy", () => {
  const labels = {
    invalidSwatchHex: "Invalid swatch hex value. Use #RGB or #RRGGBB.",
    saveSwatchFailed: "Failed to save swatch for selected filament.",
  };

  assert.equal(
    buildSettingsSwatchErrorMessage("invalidSwatchHex", labels),
    labels.invalidSwatchHex,
  );
  assert.equal(
    buildSettingsSwatchErrorMessage("saveSwatchFailed", labels),
    labels.saveSwatchFailed,
  );
});
