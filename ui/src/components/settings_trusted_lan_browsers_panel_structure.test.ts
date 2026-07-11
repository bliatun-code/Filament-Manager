import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TrustedLanPairedBrowserRowModel } from "../pages/settings_companion_model";
import { SettingsTrustedLanBrowsersPanel } from "./settings_trusted_lan_browsers_panel";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const source = readFileSync(
  new URL("./settings_trusted_lan_browsers_panel.tsx", import.meta.url),
  "utf8",
);

const activeBrowser: TrustedLanPairedBrowserRowModel = {
  id: "browser-1",
  displayName: "Studio iPad",
  initials: "SI",
  statusLabel: "Authorized",
  statusTone: "idle",
  activityLabel: "Last seen just now",
  activityDateTime: "2026-07-09T12:34:00.000Z",
  pairedLabel: "Paired Jul 9, 12:00",
  pairedDateTime: "2026-07-09T12:00:00.000Z",
  originLabel: "192.168.1.20",
  revoked: false,
};

function renderPanel() {
  return renderToStaticMarkup(
    React.createElement(SettingsTrustedLanBrowsersPanel, {
      activeBrowsers: [activeBrowser],
      actionBusy: false,
      revokedBrowsers: [],
      showRevokedBrowsers: false,
      t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
      totalBrowserCount: 1,
      onRevokeAllBrowsers: () => {},
      onRevokeBrowser: () => {},
      onToggleRevokedBrowsers: () => {},
    }),
  );
}

test("trusted-LAN revoke requests start as clearly destructive, named actions", () => {
  const html = renderPanel();

  assert.match(html, /id="trusted-lan-browsers-panel"/);
  assert.match(html, /scroll-mt-24/);
  assert.match(html, /aria-label="Revoke browser access for Studio iPad"/);
  assert.match(html, /aria-label="Revoke access for all 1 authorized browsers"/);
  assert.equal((html.match(/border-rose-200/g) ?? []).length, 2);
  assert.doesNotMatch(html, /border-emerald-200/);
  assert.doesNotMatch(html, /Confirm revoke/);
});

test("paired-browser and revoked-history regions expose list and disclosure semantics", () => {
  const html = renderPanel();

  assert.match(html, /<section id="trusted-lan-browsers-panel"/);
  assert.match(html, /<h3 id="trusted-lan-browsers-title"/);
  assert.match(html, /<ul class="grid list-none gap-3 p-0"><li/);
  assert.match(html, /<time dateTime="2026-07-09T12:34:00.000Z"/);
  assert.match(source, /aria-controls="trusted-lan-revoked-browser-list"/);
  assert.match(source, /aria-expanded=\{showRevokedBrowsers\}/);
  assert.match(source, /id="trusted-lan-revoked-browser-list"/);
});

test("single-browser revoke calls the existing handler only from inline confirmation", () => {
  assert.match(source, /type TrustedLanRevokeConfirmation =/);
  assert.match(source, /onClick=\{onRequestRevoke\}/);
  assert.match(
    source,
    /onConfirmRevoke=\{\(\) => \{\s*onRevokeBrowser\(browser\.id\);\s*setRevokeConfirmation\(null\);/,
  );
  assert.doesNotMatch(source, /onClick=\{\(\) => onRevokeBrowser\(browser\.id\)\}/);
  assert.match(source, /settings\.trustedLanConfirmRevokeBrowserAria/);
  assert.match(source, /settings\.trustedLanCancelRevokeBrowserAria/);
});

test("single and all-browser confirmations use inline danger notices with cancel", () => {
  assert.equal((source.match(/role="alert"/g) ?? []).length, 2);
  assert.equal((source.match(/<SettingsNotice tone="danger">/g) ?? []).length, 2);
  assert.equal(
    (source.match(/settingsActionButtonClass\("dangerQuiet"\)/g) ?? []).length,
    2,
  );
  assert.equal(
    (source.match(/settingsActionButtonClass\("danger", "compact"\)/g) ?? []).length,
    2,
  );
  assert.equal(
    (source.match(/settingsActionButtonClass\("neutral", "compact"\)/g) ?? []).length,
    2,
  );
  assert.match(
    source,
    /const confirmRevokeAll = \(\) => \{\s*onRevokeAllBrowsers\(\);\s*setRevokeConfirmation\(null\);/,
  );
  assert.match(source, /settings\.trustedLanConfirmRevokeAllAria/);
  assert.match(source, /settings\.trustedLanCancelRevokeAllAria/);
});
