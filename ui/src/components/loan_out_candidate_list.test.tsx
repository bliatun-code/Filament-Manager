import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import type { LoanableSpool } from "../lib/loan_out_data_source";
import { LoanOutCandidateList } from "./loan_out_candidate_list";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
};

const spools: LoanableSpool[] = [
  {
    id: "493767",
    vendor: "eSUN",
    material: "PLA-Matte",
    filamentName: "PLA Matte",
    colorName: "Peach Pink",
    hexColor: "#F6A6B8",
    status: "IN_STOCK",
    remainingGrams: 645,
    location: "Shelf 3",
  },
  {
    id: "248216",
    vendor: "Print With Smile",
    material: "ABS",
    filamentName: "ABS",
    colorName: "Matte Black",
    hexColor: "#222222",
    status: "IN_STOCK",
    remainingGrams: 630,
    location: null,
  },
  {
    id: "176333",
    vendor: "Prima Select",
    material: "PETG",
    filamentName: "PETG",
    colorName: "Transparent Blue",
    hexColor: "#6FA4F5",
    status: "IN_STOCK",
    remainingGrams: 165,
    location: null,
  },
];

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderList(searchQuery = ""): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue },
      React.createElement(LoanOutCandidateList, {
        disabled: false,
        searchQuery,
        selectedSpoolId: "493767",
        spools,
        onSearchQueryChange: () => {},
        onSelectSpool: () => {},
        renderVendorBadge: (vendor: string) => React.createElement("span", null, vendor),
      }),
    ),
  );
}

test("LoanOutCandidateList renders a permanent named search and selected row state", () => {
  const html = renderList();
  const searchId = html.match(/<label for="([^"]+)"/)?.[1];

  assert.ok(searchId);
  assert.match(html, /Search available rolls<\/label>/);
  assert.match(html, new RegExp(`<input id="${searchId}" type="search"`));
  assert.match(html, /aria-controls="[^"]+"/);
  assert.match(html, />3 rolls<\/span>/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2);
  assert.match(html, /✓ Selected/);
  assert.match(html, /Peach Pink/);
});

test("LoanOutCandidateList filters rows and reports the data-backed result count", () => {
  const html = renderList("peach");

  assert.match(html, />1 of 3 rolls<\/span>/);
  assert.match(html, /Peach Pink/);
  assert.doesNotMatch(html, /Transparent Blue/);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
});

test("LoanOutCandidateList renders a named empty search result", () => {
  const html = renderList("nylon");

  assert.match(html, />0 of 3 rolls<\/span>/);
  assert.match(html, /No available rolls match your search\./);
  assert.equal((html.match(/<button/g) ?? []).length, 0);
});
