import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";

import { lookup, type Locale } from "../lib/i18n";
import { deDictionary } from "../lib/i18n_locales/locales/de";
import { enDictionary } from "../lib/i18n_locales/locales/en";
import { frDictionary } from "../lib/i18n_locales/locales/fr";
import { nbDictionary } from "../lib/i18n_locales/locales/nb";
import type {
  FilamentDefaultsSpoolRow,
  FilamentPriceBatchReceipt,
} from "../lib/settings_filament_defaults_model";
import { SettingsFilamentDefaultsTab } from "./settings_filament_defaults_tab";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function translator(locale: Locale) {
  const dictionary =
    locale === "nb"
      ? nbDictionary
      : locale === "de"
        ? deDictionary
        : locale === "fr"
          ? frDictionary
          : enDictionary;
  return (key: string, fallback = "", params = {}) =>
    formatMessage(lookup(dictionary, key) ?? fallback, params, locale);
}

function spool(
  spoolId: string,
  overrides: Partial<FilamentDefaultsSpoolRow> = {},
): FilamentDefaultsSpoolRow {
  return {
    spoolId,
    masterId: `master-${spoolId}`,
    groupKey: 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]',
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

function renderTab({
  batchReceipt,
  locale = "en",
  hostUnsupported = false,
  readOnly = false,
  settingsValid = true,
}: {
  batchReceipt?: FilamentPriceBatchReceipt | null;
  locale?: Locale;
  hostUnsupported?: boolean;
  readOnly?: boolean;
  settingsValid?: boolean;
} = {}) {
  const t = translator(locale);
  return renderToStaticMarkup(
    <SettingsFilamentDefaultsTab
      busy={false}
      hostUnsupported={hostUnsupported}
      locale={locale}
      batchReceipt={batchReceipt}
      readOnly={readOnly}
      t={t}
      defaultCurrency="NOK"
      persistedGroupPrices={[
        {
          groupKey: 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]',
          price: 249,
          currency: "NOK",
        },
      ]}
      settingsValid={settingsValid}
      spoolRows={[
        spool("spool_1775435249521", { colorName: "White" }),
        spool("black", {
          purchasePrice: 279,
          purchaseCurrency: "NOK",
          purchasePriceSource: "MANUAL",
        }),
        spool("locked", { batchPriceLocked: true }),
        spool("empty", { status: "EMPTY" }),
      ]}
      lowStock={{
        busy: false,
        materialOptions: ["PLA", "PETG"],
        policy: {
          default_threshold_g: 200,
          material_overrides: [],
        },
        policyValid: true,
        readOnly,
        onSave: () => {},
      }}
      onSaveDefaultCurrency={() => {}}
      onSaveGroupPrice={() => {}}
      onApplyBatch={() => ({
        groupKey: 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]',
        mode: "MISSING_ONLY",
        price: 249,
        currency: "NOK",
        committed: true,
        updated: [],
        skipped: [],
      })}
      onOpenSpoolDetail={() => {}}
    />,
  );
}

test("filament defaults tab combines currency, low stock and collapsed price groups", () => {
  const html = renderTab();

  assert.match(html, /Default purchase currency/);
  assert.match(html, /min-w-0 space-y-4/);
  assert.match(html, /lg:col-span-2/);
  assert.match(html, /value="NOK"/);
  assert.match(html, /Low-stock thresholds/);
  assert.match(html, /Filament group prices/);
  assert.match(html, /<details/);
  assert.match(html, /Bambu Lab/);
  assert.match(html, /4 spools/);
  assert.match(html, /PLA Basic/);
  assert.match(html, /#249521/);
  assert.match(html, /aria-label="Select spool · PLA Basic · White · #249521"/);
  assert.doesNotMatch(html, /#spool_1775435249521/);
  assert.match(html, /Batch locked/);
  assert.match(html, /Historical/);
  assert.match(html, /Historical · Empty/);
  assert.match(html, /Historical and used-up spools are protected and excluded by default/);
  assert.match(html, /Set price on historical spool and protect it from later group updates/);
  assert.match(html, /Only missing prices/);
  assert.match(html, /Update selected prices/);
  assert.match(html, /Price spools missing a price/);
  assert.match(html, /No supplier prices are hard-coded/);
  assert.doesNotMatch(html, /24\.99|29\.99|34\.99/);
});

test("filament defaults group weights follow the selected app locale", () => {
  const html = renderTab({ locale: "nb" });

  assert.match(html, /1\u00a0000 g/);
});

test("read-only filament defaults tab disables library-wide controls", () => {
  const html = renderTab({ readOnly: true });

  assert.match(html, /Manage library-wide filament defaults on the Host desktop app/);
  assert.match(html, /<input[^>]*disabled[^>]*value="NOK"/);
  assert.match(html, /Manage these library-wide thresholds on the Host desktop app/);
});

test("older Hosts expose the localized upgrade warning while fallback rows remain visible", () => {
  const german = renderTab({
    hostUnsupported: true,
    locale: "de",
    readOnly: true,
  });
  assert.match(
    german,
    /Aktualisiere den Host, bevor du Filament-Preisstandards verwendest/,
  );
  assert.match(german, /PLA Basic/);

  const french = renderTab({
    hostUnsupported: true,
    locale: "fr",
    readOnly: true,
  });
  assert.match(
    french,
    /Mettez à jour l’hôte avant d’utiliser les valeurs de tarification des filaments/,
  );
  assert.match(french, /PLA Basic/);
});

test("invalid or orphaned saved standards expose the repair state", () => {
  const writable = renderTab({ settingsValid: false });
  assert.match(writable, /have been excluded/);
  assert.match(writable, /repairs the stored settings/);

  const readOnly = renderTab({ readOnly: true, settingsValid: false });
  assert.match(readOnly, /Repair them on the Host desktop app/);
});

test("overwrite uses AppModal and manual receipt entries navigate to spool details", () => {
  const source = readFileSync(
    new URL("./settings_filament_defaults_tab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /<AppModal/);
  assert.match(source, /Overwrite review/);
  assert.match(source, /Review and confirm overwrite/);
  assert.match(source, /individually set/);
  assert.match(source, /filamentPriceSkipPresentation/);
  assert.match(source, /presentation\.requiresManualUpdate/);
  assert.match(source, /onOpenSpoolDetail\(entry\.spoolId\)/);
  assert.match(source, /settings-filament-selection-status/);
  assert.match(source, /filamentDefaultsHistoricalSelectionRemoved/);
  assert.match(source, /receipt stays here until you dismiss it or run another price update/i);
});

test("an app-owned receipt remains renderable after the settings route remounts", () => {
  const receipt: FilamentPriceBatchReceipt = {
    batchId: "batch-persisted",
    groupKey: 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]',
    mode: "MISSING_ONLY",
    price: 249,
    currency: "NOK",
    committed: true,
    updated: [],
    skipped: [
      {
        spoolId: "locked",
        spoolLabel: "PLA Basic · Locked",
        reason: "BATCH_LOCKED",
      },
    ],
  };

  const html = renderTab({ batchReceipt: receipt });
  assert.match(html, /Latest pricing receipt/);
  assert.match(html, /PLA Basic · Locked/);
  assert.match(html, /Protected from batch pricing/);
});

test("a historical missing-price receipt exposes the retained protection and detail link", () => {
  const receipt: FilamentPriceBatchReceipt = {
    batchId: "batch-historical",
    groupKey: 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]',
    mode: "MISSING_ONLY",
    price: 249,
    currency: "NOK",
    committed: true,
    updated: [
      {
        spoolId: "empty",
        spoolLabel: "PLA Basic · Empty",
        protectedFromBatchPricing: true,
      },
    ],
    skipped: [],
  };

  const html = renderTab({ batchReceipt: receipt });
  assert.match(html, /1 updated · 1 protected from later group updates · 0 not updated/);
  assert.match(html, /Price set · Protected from later group updates/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="status"/);
});
