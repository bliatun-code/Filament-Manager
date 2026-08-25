import assert from "node:assert/strict";
import test from "node:test";

import {
  allFilamentPriceGroups,
  buildFilamentPriceBatchPreview,
  buildFilamentPriceGroups,
  canonicalizeFilamentVendor,
  createDefaultFilamentPriceSelection,
  filamentPriceSelectionState,
  filamentPriceSkipPresentation,
  normalizeFilamentDefaultCurrency,
  parseFilamentGroupPrice,
  updateFilamentPriceGroupSelection,
  type FilamentDefaultsSpoolRow,
} from "./settings_filament_defaults_model";

function spool(
  spoolId: string,
  overrides: Partial<FilamentDefaultsSpoolRow> = {},
): FilamentDefaultsSpoolRow {
  return {
    spoolId,
    masterId: `master-${spoolId}`,
    vendor: "Bambu Lab",
    material: "PLA",
    filamentName: "PLA Basic",
    colorName: spoolId,
    nominalWeightG: 1000,
    purchasePrice: null,
    purchaseCurrency: null,
    purchasePriceSource: null,
    batchPriceLocked: false,
    ownershipType: "OWNED",
    status: "IN_STOCK",
    ...overrides,
  };
}

test("canonical vendor aliases and case do not split Bambu Lab or eSUN groups", () => {
  assert.deepEqual(canonicalizeFilamentVendor(" BambuLab "), {
    key: "bambu-lab",
    label: "Bambu Lab",
    generic: false,
  });
  assert.deepEqual(canonicalizeFilamentVendor("ESUN"), {
    key: "esun",
    label: "eSUN",
    generic: false,
  });

  const categories = buildFilamentPriceGroups([
    spool("white", { vendor: "Bambu" }),
    spool("black", { vendor: "bambu lab" }),
    spool("petg", {
      vendor: "Bambu Lab",
      material: "PETG",
      filamentName: "PETG Basic",
    }),
  ]);

  assert.equal(categories.length, 1);
  assert.equal(categories[0]?.label, "Bambu Lab");
  assert.equal(categories[0]?.spoolCount, 3);
  assert.equal(categories[0]?.groupCount, 2);
});

test("groups use vendor, material, filament series and nominal weight, not color", () => {
  const groups = allFilamentPriceGroups(
    buildFilamentPriceGroups([
      spool("black", { colorName: "Black" }),
      spool("white", { colorName: "Jade White" }),
      spool("mini", { colorName: "Black", nominalWeightG: 250 }),
      spool("matte", { colorName: "Black", filamentName: "PLA Matte" }),
    ]),
  );

  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((group) => [group.filamentLabel, group.nominalWeightG, group.counts.total]),
    [
      ["PLA Basic", 250, 1],
      ["PLA Basic", 1000, 2],
      ["PLA Matte", 1000, 1],
    ],
  );
});

test("ambiguous Generic series fall back to master id while named series still group", () => {
  const groups = allFilamentPriceGroups(
    buildFilamentPriceGroups([
      spool("generic-a-1", {
        masterId: "generic-master-a",
        vendor: "Generic",
        filamentName: "Generic",
      }),
      spool("generic-a-2", {
        masterId: "generic-master-a",
        vendor: "Manual",
        filamentName: "Generic",
      }),
      spool("generic-b", {
        masterId: "generic-master-b",
        vendor: null,
        filamentName: "Unknown",
      }),
      spool("named-a", {
        masterId: "named-master-a",
        vendor: "Generic",
        filamentName: "PLA Silk",
      }),
      spool("named-b", {
        masterId: "named-master-b",
        vendor: "Generic",
        filamentName: "pla silk",
      }),
    ]),
  );

  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((group) => [group.fallbackMasterId, group.counts.total]),
    [
      ["generic-master-a", 2],
      [null, 2],
      ["generic-master-b", 1],
    ],
  );
});

test("group counters distinguish missing, locked, borrowed and manual prices", () => {
  const [group] = allFilamentPriceGroups(
    buildFilamentPriceGroups([
      spool("missing"),
      spool("locked", { batchPriceLocked: true }),
      spool("manual", {
        purchasePrice: 249,
        purchaseCurrency: "NOK",
        purchasePriceSource: "MANUAL",
      }),
      spool("standard", {
        purchasePrice: 229,
        purchaseCurrency: "NOK",
        purchasePriceSource: "STANDARD_BATCH",
      }),
      spool("borrowed", { ownershipType: "BORROWED_IN" }),
    ]),
  );

  assert.deepEqual(group?.counts, {
    total: 5,
    priced: 2,
    missingPrice: 3,
    batchLocked: 1,
    borrowedIn: 1,
    inactive: 0,
    missingCurrency: 3,
    manuallyPriced: 1,
  });
});

test("selection helpers support crossing out individual spools and whole groups", () => {
  const [group] = allFilamentPriceGroups(
    buildFilamentPriceGroups([spool("one"), spool("two"), spool("three")]),
  );
  assert.ok(group);
  const defaults = createDefaultFilamentPriceSelection([group]);
  assert.equal(filamentPriceSelectionState(group.spoolRows, defaults), "ALL");

  defaults.delete("two");
  assert.equal(filamentPriceSelectionState(group.spoolRows, defaults), "SOME");
  const cleared = updateFilamentPriceGroupSelection({
    rows: group.spoolRows,
    selectedSpoolIds: defaults,
    selected: false,
  });
  assert.equal(filamentPriceSelectionState(group.spoolRows, cleared), "NONE");
});

test("missing-only preview updates only unpriced owned rows and reports every skip class", () => {
  const [group] = allFilamentPriceGroups(
    buildFilamentPriceGroups([
      spool("missing"),
      spool("priced", {
        purchasePrice: 220,
        purchaseCurrency: "NOK",
        purchasePriceSource: "MANUAL",
      }),
      spool("locked", { batchPriceLocked: true }),
      spool("borrowed", { ownershipType: "borrowed in" }),
    ]),
  );
  assert.ok(group);
  const preview = buildFilamentPriceBatchPreview({
    group,
    mode: "MISSING_ONLY",
    currency: "NOK",
    selectedSpoolIds: new Set(group.spoolRows.map((row) => row.spoolId)),
  });

  assert.deepEqual(preview, {
    mode: "MISSING_ONLY",
    selectedCount: 4,
    eligibleCount: 1,
    missingPriceCount: 1,
    missingCurrencyCount: 1,
    currencyOnlyCount: 0,
    alreadyCompleteCount: 1,
    manualUpdateCount: 0,
    overwriteCount: 0,
    manualOverwriteCount: 0,
    lockedCount: 1,
    borrowedInCount: 1,
    inactiveCount: 0,
    selectedSpoolIds: ["borrowed", "locked", "missing", "priced"],
    eligibleSpoolIds: ["missing"],
    lockedSpoolIds: ["locked"],
    borrowedInSpoolIds: ["borrowed"],
    inactiveSpoolIds: [],
    manualUpdateSpoolIds: [],
    alreadyCompleteSpoolIds: ["priced"],
  });
});

test("overwrite preview quantifies replacement of individual prices", () => {
  const [group] = allFilamentPriceGroups(
    buildFilamentPriceGroups([
      spool("missing"),
      spool("manual", { purchasePrice: 299, purchasePriceSource: "MANUAL" }),
      spool("standard", {
        purchasePrice: 219,
        purchasePriceSource: "GROUP_STANDARD",
      }),
      spool("locked-manual", {
        purchasePrice: 399,
        purchasePriceSource: "MANUAL",
        batchPriceLocked: true,
      }),
    ]),
  );
  assert.ok(group);
  const preview = buildFilamentPriceBatchPreview({
    group,
    mode: "OVERWRITE",
    currency: "NOK",
    selectedSpoolIds: createDefaultFilamentPriceSelection([group]),
  });

  assert.equal(preview.eligibleCount, 3);
  assert.equal(preview.missingPriceCount, 1);
  assert.equal(preview.overwriteCount, 2);
  assert.equal(preview.manualOverwriteCount, 1);
  assert.equal(preview.lockedCount, 1);
});

test("missing-only can fill currency without replacing price and flags a conflicting currency", () => {
  const [group] = allFilamentPriceGroups(
    buildFilamentPriceGroups([
      spool("currency-only", { purchasePrice: 249, purchaseCurrency: null }),
      spool("same-currency", { purchasePrice: null, purchaseCurrency: "NOK" }),
      spool("other-currency", { purchasePrice: null, purchaseCurrency: "EUR" }),
      spool("invalid-currency", { purchasePrice: null, purchaseCurrency: "kr" }),
    ]),
  );
  assert.ok(group);
  const preview = buildFilamentPriceBatchPreview({
    group,
    mode: "MISSING_ONLY",
    currency: "NOK",
    selectedSpoolIds: createDefaultFilamentPriceSelection([group]),
  });

  assert.equal(preview.eligibleCount, 2);
  assert.equal(preview.currencyOnlyCount, 1);
  assert.equal(preview.missingPriceCount, 1);
  assert.equal(preview.manualUpdateCount, 2);
  assert.deepEqual(preview.manualUpdateSpoolIds, ["invalid-currency", "other-currency"]);
});

test("default selection excludes borrowed and inactive historical spools but includes locks", () => {
  const [group] = allFilamentPriceGroups(
    buildFilamentPriceGroups([
      spool("active"),
      spool("locked", { batchPriceLocked: true }),
      spool("borrowed", { ownershipType: "BORROWED_IN" }),
      spool("empty", { status: "EMPTY" }),
      spool("deleted", { status: "DELETED" }),
    ]),
  );
  assert.ok(group);
  assert.deepEqual(
    Array.from(createDefaultFilamentPriceSelection([group])).sort(),
    ["active", "locked"],
  );
  assert.equal(group.counts.inactive, 1);
  assert.equal(group.counts.total, 4);
});

test("an authoritative backend group key wins over the generated legacy key", () => {
  const [group] = allFilamentPriceGroups(
    buildFilamentPriceGroups([
      spool("one", { groupKey: 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]' }),
      spool("two", { groupKey: 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]' }),
    ]),
  );
  assert.equal(group?.key, 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]');
  assert.equal(group?.counts.total, 2);
});

test("currency, price and receipt reason presentation are strict and stable", () => {
  assert.equal(normalizeFilamentDefaultCurrency(" nok "), "NOK");
  assert.equal(normalizeFilamentDefaultCurrency("N0K"), null);
  assert.equal(parseFilamentGroupPrice("249,50"), 249.5);
  assert.equal(parseFilamentGroupPrice("-1"), null);
  assert.deepEqual(filamentPriceSkipPresentation("BATCH_PRICE_LOCKED"), {
    label: "Batch price lock",
    requiresManualUpdate: true,
  });
  assert.deepEqual(filamentPriceSkipPresentation("BATCH_LOCKED"), {
    label: "Batch price lock",
    requiresManualUpdate: true,
  });
  assert.equal(
    filamentPriceSkipPresentation("ALREADY_PRICED").requiresManualUpdate,
    false,
  );
});
