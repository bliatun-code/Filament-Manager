import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const inventorySource = readFileSync(new URL("./inventory.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./settings.tsx", import.meta.url), "utf8");
const settingsPrintersSource = readFileSync(
  new URL("./use_settings_printers_section.ts", import.meta.url),
  "utf8",
);

test("Dashboard header action button keeps shared focus treatment", () => {
  assert.match(source, /PageHeaderButton/);
  assert.match(source, /variant="soft"/);
  assert.match(source, /responsive=\{false\}/);
  assert.doesNotMatch(
    source,
    /inline-flex items-center gap-2 rounded-lg border border-slate-300\/70 bg-white\/86 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-300\/25 backdrop-blur transition hover:bg-white dark:border-slate-700\/70/,
  );
});

test("Dashboard shows headline data in two columns in compact desktop windows", () => {
  assert.match(source, /min-\[720px\]:grid-cols-2 xl:grid-cols-4/);
  assert.doesNotMatch(source, /gap-4 md:grid-cols-2 xl:grid-cols-4/);
});

test("empty dashboard action opens the real add-spool workflow", () => {
  assert.match(source, /onAddFirstSpool=\{onAddFirstSpool\}/);
  assert.match(appSource, /kind: "ADD_SPOOL"/);
  assert.match(inventorySource, /navigationIntent\.kind === "ADD_SPOOL"/);
  assert.match(inventorySource, /openAddModal\(\)/);
});

test("Bambu Live attention opens the affected printer in Settings", () => {
  assert.match(source, /bambuLiveAttention\.map/);
  assert.match(source, /onOpenBambuLiveSettings\?\.\(attention\.printerId\)/);
  assert.match(appSource, /setSettingsInitialTab\("PRINTERS"\)/);
  assert.match(appSource, /setSettingsInitialPrinterId\(printerId\)/);
  assert.match(settingsSource, /initialPrinterId/);
  assert.match(
    settingsPrintersSource,
    /sortedPrinters\.find\(\(candidate\) => candidate\.id === initialPrinterId\)/,
  );
  assert.match(settingsPrintersSource, /handleStartEditPrinter\(printer\)/);
  assert.match(settingsPrintersSource, /settings-printer-editor/);
});
