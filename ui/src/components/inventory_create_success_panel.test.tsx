import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nContext, type I18nContextValue } from "../lib/i18n";
import { InventoryCreateSuccessPanel } from "./inventory_create_success_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const i18n: I18nContextValue = { locale: "en", setLocale: () => {}, t: (_key, fallback = "") => fallback };

function render(busy: boolean) {
  return renderToStaticMarkup(<I18nContext.Provider value={i18n}>
    <InventoryCreateSuccessPanel busy={busy}
      receipt={{ spoolId: "committed-spool", message: "Added: ASA · Marine Blue" }}
      onOpenRoll={() => {}} onRegisterAnother={() => {}} />
  </I18nContext.Provider>);
}

test("registration success announces the captured receipt with two explicit next actions", () => {
  const html = render(false);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Added: ASA · Marine Blue/);
  assert.match(html, />Open roll<\/button>/);
  assert.match(html, />Register another roll<\/button>/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.doesNotMatch(html, /disabled=""/);
});

test("both next actions wait until registration and its refresh finish", () => {
  assert.equal((render(true).match(/<button[^>]*disabled=""/g) ?? []).length, 2);
});
