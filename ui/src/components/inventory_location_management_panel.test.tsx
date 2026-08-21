import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { I18nContext, type I18nContextValue } from "../lib/i18n";
import type { InventoryLocationRow } from "../lib/tauri_location_client";
import { InventoryLocationDatalist } from "./inventory_location_datalist";
import {
  InventoryLocationManagementPanel,
  InventoryLocationMergeConfirmation,
} from "./inventory_location_management_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "", params = {}) => formatMessage(fallback, params, "en"),
};

function location(overrides: Partial<InventoryLocationRow> = {}): InventoryLocationRow {
  return {
    id: "location-active",
    name: "Dry box",
    location_type: "GENERIC",
    parent_id: null,
    archived_at: null,
    created_at: "2026-08-21 10:00:00",
    updated_at: "2026-08-21 10:00:00",
    ...overrides,
  };
}

const rows = [
  location(),
  location({
    id: "location-archived",
    name: "Old shelf",
    archived_at: "2026-08-21 11:00:00",
  }),
  location({
    id: "Printer:Studio:slot-1",
    name: "Studio AMS 1",
    location_type: "PRINTER_SLOT",
  }),
];

function renderPanel(
  source: "LIVE" | "CACHED" | "LEGACY_HOST" | "OFFLINE",
  mutationsSupported: boolean,
) {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventoryLocationManagementPanel
        busy={false}
        canMutate
        loading={false}
        mutationsSupported={mutationsSupported}
        onArchive={async () => true}
        onCreate={async () => true}
        onMerge={async () => true}
        onRename={async () => true}
        onRestore={async () => true}
        rows={rows}
        source={source}
      />
    </I18nContext.Provider>,
  );
}

test("live location management exposes generic lifecycle actions and protects system rows", () => {
  const html = renderPanel("LIVE", true);

  assert.match(html, /Create location/);
  assert.match(html, /Review merge/);
  assert.match(html, />Archive</);
  assert.match(html, />Restore</);
  assert.match(html, /Studio AMS 1/);
  assert.match(html, /Managed by printer or loan workflow/);
});

test("irreversible merge confirmation names source and target and explains archive impact", () => {
  const html = renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventoryLocationMergeConfirmation
        busy={false}
        onCancel={() => {}}
        onConfirm={() => {}}
        sourceName="Old shelf"
        targetName="Dry box"
      />
    </I18nContext.Provider>,
  );

  assert.match(html, /Merge Old shelf into Dry box\?/);
  assert.match(html, /source is archived/);
  assert.match(html, /cannot be automatically undone/);
  assert.match(html, /Confirm merge &amp; archive/);
  assert.match(html, />Cancel</);
});

test("failed mutations preserve form drafts and reset merge confirmation", () => {
  const source = readFileSync(
    new URL("./inventory_location_management_panel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /onCreate\(normalizedNewName\)\.then\(\(created\) => \{\s*if \(created\) setNewName\(""\)/);
  assert.match(source, /onRename\(renameId, normalizedRename\)\.then\(\(renamed\) => \{\s*if \(renamed\)/);
  assert.match(source, /setMergeConfirmationVisible\(false\);\s*void onMerge\(sourceId, targetId\)\.then\(\(merged\)/);
  assert.match(source, /if \(merged\) \{\s*setSourceId\(""\);\s*setTargetId\(""\)/);
});

test("legacy and cached Host states explain read-only compatibility without enabling mutations", () => {
  const legacyHtml = renderPanel("LEGACY_HOST", false);
  assert.match(legacyHtml, /Host predates location objects/);
  assert.doesNotMatch(legacyHtml, />Archive</);
  assert.doesNotMatch(legacyHtml, />Restore</);

  const cachedHtml = renderPanel("CACHED", false);
  assert.match(cachedHtml, /Reconnect to the Host/);
  assert.doesNotMatch(cachedHtml, /Host predates location objects/);
});

test("autocomplete includes active storage names but excludes archived and system locations", () => {
  const html = renderToStaticMarkup(<InventoryLocationDatalist rows={rows} />);

  assert.match(html, /value="Dry box"/);
  assert.doesNotMatch(html, /Old shelf/);
  assert.doesNotMatch(html, /Studio AMS 1/);
});
