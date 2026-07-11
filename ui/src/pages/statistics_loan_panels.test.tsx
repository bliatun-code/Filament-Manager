import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { LoanUsageByPersonRow } from "../lib/tauri_client";
import {
  StatisticsInboundLoanUsagePanel,
  StatisticsOutboundLoanUsagePanel,
} from "./statistics_loan_panels";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import type { I18nContextValue } from "../lib/i18n";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const t: I18nContextValue["t"] = (_key, fallback = "", params = {}) =>
  formatMessage(fallback, params, "en");

const outboundRow: LoanUsageByPersonRow = {
  loan_direction: "OUTBOUND",
  borrower_name: "Ada",
  total_consumed_g: 160,
  completed_loans: 2,
  active_loans: 1,
};

test("loan filter chips expose pressed state and announce a count with its unit", () => {
  const html = renderToStaticMarkup(
    <StatisticsOutboundLoanUsagePanel
      filteredLoanUsage={[outboundRow]}
      loading={false}
      loanUsageListFilter="ACTIVE"
      onOpenBorrower={() => {}}
      setLoanUsageListFilter={() => {}}
      t={t}
    />,
  );

  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2);
  assert.match(html, /aria-live="polite"[^>]*aria-atomic="true"[^>]*>1 result</);
  assert.match(html, /id="statistics-outbound-loan-usage"/);
  assert.match(html, /scroll-mt-28/);
});

test("loan and owner rows are valid dialog-opening buttons with visible details affordance", () => {
  const outboundHtml = renderToStaticMarkup(
    <StatisticsOutboundLoanUsagePanel
      filteredLoanUsage={[outboundRow]}
      loading={false}
      loanUsageListFilter="ALL"
      onOpenBorrower={() => {}}
      setLoanUsageListFilter={() => {}}
      t={t}
    />,
  );
  const inboundHtml = renderToStaticMarkup(
    <StatisticsInboundLoanUsagePanel
      inboundLoanUsage={[{ ...outboundRow, loan_direction: "INBOUND" }]}
      loading={false}
      onOpenOwner={() => {}}
      t={t}
    />,
  );

  for (const html of [outboundHtml, inboundHtml]) {
    const rowButton = html.match(
      /<button type="button" aria-haspopup="dialog"[\s\S]*?<\/button>/,
    )?.[0];
    assert.ok(rowButton);
    assert.match(rowButton, />View details<span aria-hidden="true">→/);
    assert.match(rowButton, /focus-visible:ring-2/);
    assert.doesNotMatch(rowButton, /<div|role="button"|tabindex="0"/);
  }
});
