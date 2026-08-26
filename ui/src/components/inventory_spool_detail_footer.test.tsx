import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { inventorySpoolDetailFooterFocusTarget } from "../lib/inventory_spool_detail_footer_focus";
import { InventorySpoolDetailFooter } from "./inventory_spool_detail_footer";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "") => fallback,
};

function renderFooter(discardConfirmationOpen: boolean, manageBusy = false): string {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventorySpoolDetailFooter
        discardConfirmationOpen={discardConfirmationOpen}
        hasCommonChanges
        hasUnsavedChanges
        manageBusy={manageBusy}
        onCancel={() => {}}
        onCancelDiscardConfirmation={() => {}}
        onConfirmDiscard={() => {}}
        onSaveCommonDetails={() => {}}
        runtimeAvailable
      />
    </I18nContext.Provider>,
  );
}

function renderedButtons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>/g)].map((match) => match[0]);
}

function hasDisabledAttribute(button: string): boolean {
  return /\sdisabled(?:=""|(?=[\s>]))/.test(button);
}

test("dirty detail uses an in-app discard confirmation instead of the normal footer", () => {
  const html = renderFooter(true);

  assert.match(html, /data-testid="inventory-spool-discard-confirmation"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Discard unsaved roll changes\? Your edits will be lost\./);
  assert.match(html, />Keep editing<\/button>/);
  assert.match(html, />Discard changes<\/button>/);
  assert.doesNotMatch(html, /Save roll changes/);
  assert.ok(renderedButtons(html).every((button) => !hasDisabledAttribute(button)));
});

test("discard actions stay disabled only while a write is still in flight", () => {
  const html = renderFooter(true, true);
  assert.equal(renderedButtons(html).filter(hasDisabledAttribute).length, 2);
});

test("normal detail footer remains available when discard confirmation is closed", () => {
  const html = renderFooter(false);
  assert.match(html, /You have unsaved changes\./);
  assert.match(html, />Cancel<\/button>/);
  assert.match(html, />Save roll changes<\/button>/);
  assert.doesNotMatch(html, /inventory-spool-discard-confirmation/);
});

test("footer focus follows the confirmation swap and returns to cancel", () => {
  assert.equal(
    inventorySpoolDetailFooterFocusTarget({
      discardConfirmationOpen: false,
      manageBusy: false,
      wasDiscardConfirmationOpen: false,
    }),
    null,
  );
  assert.equal(
    inventorySpoolDetailFooterFocusTarget({
      discardConfirmationOpen: true,
      manageBusy: false,
      wasDiscardConfirmationOpen: false,
    }),
    "keep-editing",
  );
  assert.equal(
    inventorySpoolDetailFooterFocusTarget({
      discardConfirmationOpen: false,
      manageBusy: false,
      wasDiscardConfirmationOpen: true,
    }),
    "cancel",
  );
  assert.equal(
    inventorySpoolDetailFooterFocusTarget({
      discardConfirmationOpen: true,
      manageBusy: true,
      wasDiscardConfirmationOpen: false,
    }),
    null,
  );
});
