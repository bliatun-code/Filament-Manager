import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { InventoryCreateActionsPanel } from "./inventory_create_actions_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "") => fallback,
};

function renderPanel(initialWeight: string): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue },
      React.createElement(InventoryCreateActionsPanel, {
        borrowedFromContact: "ada@example.com",
        borrowedFromName: "Ada",
        borrowedInNote: "Return next week",
        disabledCreate: false,
        disabledWishlistCreate: false,
        initialWeight,
        location: "Shelf A",
        onAddCurrentToWishlist: () => {},
        onBorrowedFromContactChange: () => {},
        onBorrowedFromNameChange: () => {},
        onBorrowedInNoteChange: () => {},
        onCreateSpool: () => {},
        onInitialWeightChange: () => {},
        onLocationChange: () => {},
        onOwnershipTypeChange: () => {},
        ownershipType: "BORROWED_IN",
        selectionSummary: {
          title: "PLA Basic · Black",
          detail: "Bambu · PLA",
          hexColor: "#111111",
          initialWeightGrams: 1000,
        },
        tauriAvailable: true,
      }),
    ),
  );
}

function assertLabelContainsValue(html: string, label: string, value: string): void {
  const labelText = `<span>${label}</span>`;
  const labelTextIndex = html.indexOf(labelText);
  assert.notEqual(labelTextIndex, -1, `missing label text: ${label}`);

  const labelEndIndex = html.indexOf("</label>", labelTextIndex);
  assert.notEqual(labelEndIndex, -1, `missing closing label tag: ${label}`);

  const valueIndex = html.indexOf(`value="${value}"`, labelTextIndex);
  assert.ok(
    valueIndex > labelTextIndex && valueIndex < labelEndIndex,
    `label does not contain expected value: ${label}`,
  );
}

test("InventoryCreateActionsPanel keeps permanent labels on populated stock fields", () => {
  const html = renderPanel("1000");

  for (const [label, value] of [
    ["Borrowed from", "Ada"],
    ["Owner contact (optional)", "ada@example.com"],
    ["Borrowed-in note (optional)", "Return next week"],
    ["Initial weight (g)", "1000"],
    ["Home location (optional)", "Shelf A"],
  ]) {
    assertLabelContainsValue(html, label, value);
  }
  assert.match(html, /type="number" min="1" step="1" inputMode="numeric"/);
  assert.doesNotMatch(html, /role="alert"/);
});

test("InventoryCreateActionsPanel shows accessible validation for invalid start weight", () => {
  const html = renderPanel("-2.5");

  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="[^"]+"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Weight value is invalid\./);
  assert.match(html, /<button(?=[^>]*disabled="")[^>]*>\s*Register borrowed-in spool/);
});
