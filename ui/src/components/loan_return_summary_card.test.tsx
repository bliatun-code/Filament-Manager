import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  I18nContext,
  lookup,
  type DictionaryNode,
  type I18nContextValue,
  type Locale,
} from "../lib/i18n";
import { enDictionary } from "../lib/i18n_locales/locales/en";
import { nbDictionary } from "../lib/i18n_locales/locales/nb";
import { normalizeLoanDetailsRow } from "../lib/loan_row_normalization";
import { LoanReturnSummaryCard } from "./loan_return_summary_card";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const loan = normalizeLoanDetailsRow({
  spool_status: "LOANED_OUT",
  spool_tare_weight_g: 250,
  material: "PLA",
  filament_name: "PLA Matte",
  color_name: "Matte Ash Gray (11102)",
  vendor: "Bambu",
  hex_color: "#A0A0A0",
  loan: {
    id: "loan-1",
    spool_id: "spool-812496",
    borrower_name: "Erik",
    counterparty_name: "Erik",
    loan_direction: "OUTBOUND",
    loan_status: "ACTIVE",
    grams_out: 1_000,
    lent_at: "2026-07-01 10:00:00",
  },
});

function renderSummary(locale: Locale, grams: string): string {
  const dictionary: DictionaryNode = locale === "nb" ? nbDictionary : enDictionary;
  const i18nValue: I18nContextValue = {
    locale,
    setLocale: () => {},
    t: (key, fallback = "") => lookup(dictionary, key) ?? fallback,
  };

  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <LoanReturnSummaryCard grams={grams} loan={loan} />
    </I18nContext.Provider>,
  );
}

test("LoanReturnSummaryCard renders a live data-derived summary in English", () => {
  const html = renderSummary("en", "950");

  assert.match(
    html,
    /role="status"[^>]*aria-atomic="true"[^>]*aria-label="Return summary"[^>]*aria-live="polite"/,
  );
  assert.match(html, />Loaned<\/div><div[^>]*>1,000 g<\/div>/);
  assert.match(html, />Returned<\/div><div[^>]*>700 g<\/div>/);
  assert.match(html, />Estimated used<\/div><div[^>]*>300 g<\/div>/);
});

test("LoanReturnSummaryCard renders the localized Norwegian summary", () => {
  const html = renderSummary("nb", "950");

  assert.match(html, /aria-label="Returoppsummering"/);
  assert.match(html, />Utlånt<\/div><div[^>]*>1\u00a0000 g<\/div>/);
  assert.match(html, />Returnert<\/div><div[^>]*>700 g<\/div>/);
  assert.match(html, />Beregnet brukt<\/div><div[^>]*>300 g<\/div>/);
});
