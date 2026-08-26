import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { InventoryCreateActionsPanel } from "./inventory_create_actions_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
};

function renderPanel({
  initialWeight = "1000",
  ownershipType = "BORROWED_IN",
  purpose = "STOCK",
}: {
  initialWeight?: string;
  ownershipType?: "OWNED" | "BORROWED_IN";
  purpose?: "STOCK" | "PURCHASE";
} = {}) {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventoryCreateActionsPanel
        borrowedFromContact="ada@example.com"
        borrowedFromName="Ada"
        borrowedInNote="Return next week"
        disabledCreate={false}
        disabledWishlistCreate={false}
        initialWeight={initialWeight}
        location="Shelf A"
        onAddCurrentToWishlist={() => {}}
        onBorrowedFromContactChange={() => {}}
        onBorrowedFromNameChange={() => {}}
        onBorrowedInNoteChange={() => {}}
        onCreateSpool={() => {}}
        onInitialWeightChange={() => {}}
        onLocationChange={() => {}}
        onOwnershipTypeChange={() => {}}
        ownershipType={ownershipType}
        purpose={purpose}
        selectionSummary={{
          title: "PLA Basic · Jade White",
          detail: "Bambu · PLA",
          hexColor: "#FFFFFF",
          initialWeightGrams: 1000,
        }}
        tauriAvailable
      />
    </I18nContext.Provider>,
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
  const html = renderPanel();

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
  const html = renderPanel({ initialWeight: "-2.5" });

  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="[^"]+"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Weight value is invalid\./);
  assert.match(html, /<button(?=[^>]*disabled="")[^>]*>\s*Register borrowed-in spool/);
});

test("stock entry only renders inventory registration controls", () => {
  const html = renderPanel({ ownershipType: "OWNED", purpose: "STOCK" });

  assert.match(html, />Ownership</);
  assert.match(html, />Initial weight \(g\)</);
  assert.match(html, />Add spool to inventory<\/button>/);
  assert.doesNotMatch(html, />Add current selection to wishlist<\/button>/);
});

test("purchase entry only renders the purchase queue action", () => {
  const html = renderPanel({ purpose: "PURCHASE" });

  assert.match(html, />Add current selection to wishlist<\/button>/);
  assert.doesNotMatch(html, />Ownership</);
  assert.doesNotMatch(html, />Initial weight \(g\)</);
  assert.doesNotMatch(html, />Add spool to inventory<\/button>/);
});
