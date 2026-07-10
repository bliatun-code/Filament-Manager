import assert from "node:assert/strict";
import test from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { InventoryCatalogMetadataPanel } from "./inventory_catalog_metadata_panel";
import {
  InventorySpoolHomeLocationPanel,
  InventorySpoolOwnershipPanel,
  InventorySpoolTarePanel,
} from "./inventory_spool_maintenance_panels";
import { WeightInput } from "./weight_input";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "") => fallback,
};

function renderWithI18n(children: ReactNode): string {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>{children}</I18nContext.Provider>,
  );
}

function labelTargetIds(html: string): string[] {
  return [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((match) => match[1]);
}

function assertUniqueLabelTargetsExist(html: string, expectedCount: number): string[] {
  const ids = labelTargetIds(html);
  assert.equal(ids.length, expectedCount);
  assert.equal(new Set(ids).size, expectedCount);
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `Expected a control with id ${id}`);
  }
  return ids;
}

test("catalog metadata fields keep visible labels after real values are populated", () => {
  const html = renderWithI18n(
    <InventoryCatalogMetadataPanel
      colorName="Peach Pink"
      disabled={false}
      editUnlocked
      filamentName="PLA Matte"
      hexColor="#F2A7BB"
      material="PLA"
      onChangeColorName={() => {}}
      onChangeFilamentName={() => {}}
      onChangeHexColor={() => {}}
      onChangeMaterial={() => {}}
      onChangeVendor={() => {}}
      onSave={() => {}}
      onToggleEditUnlocked={() => {}}
      resolvedTheme="dark"
      spoolHexColor="#F2A7BB"
      vendor="eSUN"
    />,
  );

  const ids = assertUniqueLabelTargetsExist(html, 6);
  for (const label of [
    "Vendor",
    "Material",
    "Filament name",
    "Color name",
    "Swatch color (optional)",
    "Swatch color code",
    "Swatch color picker",
  ]) {
    assert.match(html, new RegExp(`>${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`));
  }

  const helpId = html.match(/id="([^"]+-help)" class="mt-1 text-xs/)?.[1];
  assert.ok(helpId);
  for (const id of ids) {
    const control = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(control?.includes(`aria-describedby="${helpId}"`));
  }
});

test("spool maintenance fields use labels, fieldset context, and existing help text", () => {
  const html = renderWithI18n(
    <>
      <InventorySpoolTarePanel
        disabled={false}
        onChange={() => {}}
        onSave={() => {}}
        resolvedTheme="dark"
        spoolHexColor="#F2A7BB"
        value="224"
      />
      <InventorySpoolHomeLocationPanel
        assignedToPrinter
        disabled={false}
        onChange={() => {}}
        onSave={() => {}}
        resolvedTheme="dark"
        spoolHexColor="#F2A7BB"
        value="Shelf 3"
      />
      <InventorySpoolOwnershipPanel
        contactValue="owner@example.com"
        disabled={false}
        noteValue="Return next month"
        onChangeContact={() => {}}
        onChangeName={() => {}}
        onChangeNote={() => {}}
        onChangeType={() => {}}
        onSave={() => {}}
        ownerNameValue="Ada"
        resolvedTheme="dark"
        spoolHexColor="#F2A7BB"
        typeValue="BORROWED_IN"
      />
    </>,
  );

  const ids = assertUniqueLabelTargetsExist(html, 5);
  for (const label of [
    "Empty spool weight (g)",
    "Home location",
    "Owner name (required)",
    "Contact (optional)",
    "Note (optional)",
  ]) {
    assert.match(html, new RegExp(`>${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`));
  }
  assert.match(html, /<fieldset[^>]*><legend[^>]*>Ownership<\/legend>/);
  assert.match(html, /role="group" aria-label="Ownership type"/);

  const tareId = ids.find((id) => id.startsWith("inventory-spool-tare-"));
  const locationId = ids.find((id) => id.startsWith("inventory-spool-home-location-"));
  assert.ok(tareId);
  assert.ok(locationId);
  assert.match(html, new RegExp(`id="${tareId}-help"`));
  assert.match(html, new RegExp(`id="${tareId}"[^>]*aria-describedby="${tareId}-help"`));
  assert.match(html, new RegExp(`id="${locationId}-help"`));
  assert.match(
    html,
    new RegExp(`id="${locationId}"[^>]*aria-describedby="${locationId}-help"`),
  );
});

test("owned-spool help describes the ownership fieldset", () => {
  const html = renderWithI18n(
    <InventorySpoolOwnershipPanel
      contactValue=""
      disabled={false}
      noteValue=""
      onChangeContact={() => {}}
      onChangeName={() => {}}
      onChangeNote={() => {}}
      onChangeType={() => {}}
      onSave={() => {}}
      ownerNameValue=""
      resolvedTheme="light"
      typeValue="OWNED"
    />,
  );

  const helpId = html.match(/aria-describedby="([^"]+-owned-help)"/)?.[1];
  assert.ok(helpId);
  assert.ok(html.includes(`id="${helpId}"`));
  assert.match(html, /Owned rolls stay in your inventory/);
});

test("weight range and numeric value have distinct labels and ids", () => {
  const html = renderWithI18n(
    <>
      <WeightInput label="Measured total weight (g)" value={869} />
      <WeightInput label="Current weight (g)" value={645} />
    </>,
  );

  const ids = assertUniqueLabelTargetsExist(html, 4);
  assert.equal(ids.filter((id) => id.startsWith("inventory-weight-range-")).length, 2);
  assert.equal(ids.filter((id) => id.startsWith("inventory-weight-value-")).length, 2);
  assert.equal((html.match(/>Adjust weight</g) ?? []).length, 2);
  assert.equal((html.match(/>Weight value \(g\)</g) ?? []).length, 2);
  assert.match(html, /<fieldset[^>]*><legend[^>]*>Measured total weight \(g\)<\/legend>/);
});
