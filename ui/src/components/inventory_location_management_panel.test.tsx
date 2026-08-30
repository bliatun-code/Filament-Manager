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
  InventoryLocationArchiveConfirmation,
  InventoryLocationDeleteConfirmation,
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
    can_delete: false,
    created_at: "2026-08-21 10:00:00",
    reference_count: 1,
    updated_at: "2026-08-21 10:00:00",
    ...overrides,
  };
}

const rows = [
  location({ reference_count: 2 }),
  location({
    id: "location-active-2",
    name: "Shelf B",
    location_type: "SHELF",
    can_delete: true,
    reference_count: 0,
  }),
  location({
    id: "location-archived-conflict",
    name: "SHELF B",
    archived_at: "2026-08-21 10:30:00",
  }),
  location({
    id: "location-archived",
    name: "Old shelf",
    archived_at: "2026-08-21 11:00:00",
  }),
  location({
    id: "location-archived-empty",
    name: "Old empty shelf",
    archived_at: "2026-08-21 11:30:00",
    can_delete: true,
    reference_count: 0,
  }),
  location({
    id: "Printer:Studio:slot-1",
    name: "Studio AMS 1",
    location_type: "PRINTER_SLOT",
    can_delete: true,
    reference_count: 0,
  }),
];

function renderPanel(
  source: "LIVE" | "CACHED" | "LEGACY_HOST" | "OFFLINE",
  mutationsSupported: boolean,
  {
    canMutate = true,
    loading = false,
    showOfflineSourceWarning,
  }: {
    canMutate?: boolean;
    loading?: boolean;
    showOfflineSourceWarning?: boolean;
  } = {},
) {
  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventoryLocationManagementPanel
        busy={false}
        canMutate={canMutate}
        loading={loading}
        mutationsSupported={mutationsSupported}
        onArchive={async () => true}
        onCreate={async () => true}
        onDelete={async () => true}
        onOpenLinkedSpools={() => {}}
        onMerge={async () => true}
        onReload={() => {}}
        onRename={async () => true}
        onRestore={async () => true}
        rows={rows}
        showOfflineSourceWarning={showOfflineSourceWarning}
        source={source}
        usageByLocationId={new Map([
          ["location-active", 2],
          ["location-archived", 1],
        ])}
      />
    </I18nContext.Provider>,
  );
}

test("live location management stays compact and omits system-owned rows", () => {
  const html = renderPanel("LIVE", true);

  assert.match(html, /Create location/);
  assert.match(html, /2 active locations/);
  assert.match(html, /2 saved links/);
  assert.match(html, /aria-label="Dry box: 2 connected rolls"/);
  assert.match(html, /aria-label="Dry box: 2 connected rolls"[^>]*><span>2 saved links/);
  assert.match(html, /No saved links/);
  assert.doesNotMatch(html, /aria-label="Shelf B: No connected rolls"/);
  assert.match(html, /Previous locations/);
  assert.match(html, /Advanced: merge locations/);
  assert.match(html, /Manage locations/);
  assert.match(html, /Review merge/);
  assert.match(html, />Archive</);
  assert.match(html, />Restore</);
  assert.match(html, /Rename before restoring: an active location already uses this name/);
  assert.match(html, /aria-label="Rename Dry box"/);
  assert.match(html, /aria-label="Archive Dry box"/);
  assert.match(html, /aria-label="Restore Old shelf"/);
  assert.match(html, /aria-label="Delete Shelf B permanently"/);
  assert.match(html, /aria-label="Delete Old empty shelf permanently"/);
  assert.doesNotMatch(html, /aria-label="Delete Dry box permanently"/);
  assert.match(html, /<h2[^>]*>Manage locations<\/h2>/);
  assert.equal((html.match(/<h3/g) ?? []).length, 4);
  assert.doesNotMatch(html, /Studio AMS 1|Printer:Studio:slot-1|System-owned/);
  assert.doesNotMatch(html, /<table|>Type<|>Status<|<code/);
  for (const detailsTag of html.match(/<details[^>]*>/g) ?? []) {
    assert.doesNotMatch(detailsTag, /\sopen(?:=|\s|>)/);
  }
});

test("delete confirmation makes permanence, eligibility and history retention explicit", () => {
  const html = renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventoryLocationDeleteConfirmation
        busy={false}
        locationName="Empty shelf"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    </I18nContext.Provider>,
  );

  assert.match(html, /Delete Empty shelf permanently\?/);
  assert.match(html, /no linked rolls or child locations/);
  assert.match(html, /cannot be undone/);
  assert.match(html, /History events are retained/);
  assert.match(html, />Delete location permanently</);
  assert.match(html, />Cancel</);
});

test("archive confirmation explains that existing roll links survive", () => {
  const html = renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventoryLocationArchiveConfirmation
        busy={false}
        locationName="Dry box"
        onCancel={() => {}}
        onConfirm={() => {}}
        referenceCount={2}
        visibleRollCount={1}
      />
    </I18nContext.Provider>,
  );

  assert.match(html, /Archive Dry box\?/);
  assert.match(html, /2 saved links continue to point to this location/);
  assert.match(html, /disappears from new choices/);
  assert.match(html, />Archive location</);
  assert.match(html, />Cancel</);
});

test("archive confirmation labels older Host counts as visible rolls only", () => {
  const html = renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventoryLocationArchiveConfirmation
        busy={false}
        locationName="Legacy shelf"
        onCancel={() => {}}
        onConfirm={() => {}}
        referenceCount={null}
        visibleRollCount={2}
      />
    </I18nContext.Provider>,
  );

  assert.match(html, /2 visible rolls remain connected/);
  assert.match(html, /cannot report hidden home or child links/);
  assert.doesNotMatch(html, /2 saved links/);
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
  assert.match(html, /<button class="[^"]*whitespace-normal[^"]*"[^>]*>Confirm merge/);
});

test("failed mutations preserve form drafts and successful actions restore focus", () => {
  const source = readFileSync(
    new URL("./inventory_location_management_panel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /onCreate\(normalizedNewName\)\.then\(\(created\) => \{\s*if \(created\) setNewName\(""\)/);
  assert.match(source, /onRename\(row\.id, normalizedRename\)\.then\(\(renamed\) => \{\s*if \(renamed\)/);
  assert.match(source, /void onMerge\(sourceId, targetId\)\.then\(\(merged\) => \{\s*if \(merged\) \{/);
  assert.match(source, /if \(merged\) \{[\s\S]*setMergeConfirmationVisible\(false\);[\s\S]*setSourceId\(""\);[\s\S]*setTargetId\(""\)/);
  assert.match(source, /focusAfterRender\(renameActionId\)/);
  assert.match(source, /focusAfterRender\(archiveActionId\)/);
  assert.match(source, /focusAfterRender\(deleteActionId\)/);
  assert.match(source, /if \(deleted\)[\s\S]*else \{[\s\S]*deleteActionId/);
  assert.match(source, /focusAfterRender\(activeLocationsHeadingId\)/);
  assert.match(source, /previousLocationsSummaryId/);
  assert.match(source, /focusAfterRender\(mergeReviewButtonId\)/);
});

test("a rejected delete refreshes stale eligibility before another attempt", () => {
  const pageSource = readFileSync(
    new URL("../pages/inventory.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    pageSource,
    /reloadOnFailure = false[\s\S]*if \(reloadOnFailure\) \{\s*await reloadSpools\(\)/,
  );
  assert.match(
    pageSource,
    /deleteLocationForInventory\(locationMutationContext, locationId\)[\s\S]*locationDeleted[\s\S]*true/,
  );
});

test("legacy and cached Host states explain read-only compatibility without enabling mutations", () => {
  const legacyHtml = renderPanel("LEGACY_HOST", false);
  assert.match(legacyHtml, /Host predates location objects/);
  assert.doesNotMatch(legacyHtml, />Archive</);
  assert.doesNotMatch(legacyHtml, />Delete</);
  assert.doesNotMatch(legacyHtml, />Restore</);

  const cachedHtml = renderPanel("CACHED", false);
  assert.match(cachedHtml, /Reconnect to the Host/);
  assert.match(cachedHtml, /<button[^>]*>Refresh<\/button>/);
  assert.doesNotMatch(cachedHtml, /Host predates location objects/);
});

test("location-only fallback retry is disabled while locations reload", () => {
  const html = renderPanel("OFFLINE", false, { loading: true });

  assert.match(html, /Reconnect to the Host/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /<button[^>]*disabled[^>]*>Refresh<\/button>/);
});

test("suppressed offline feedback does not fall through to a misleading pairing notice", () => {
  const html = renderPanel("OFFLINE", false, {
    canMutate: false,
    showOfflineSourceWarning: false,
  });

  assert.doesNotMatch(html, /Reconnect to the Host/);
  assert.doesNotMatch(html, /Pair this client with the Host/);
});

test("large system location sets never inflate the management surface", () => {
  const systemRows = Array.from({ length: 1_000 }, (_, index) =>
    location({
      id: `Printer:Studio:slot-${index}`,
      name: `Studio slot ${index}`,
      location_type: "PRINTER_SLOT",
    }),
  );
  const html = renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventoryLocationManagementPanel
        busy={false}
        canMutate
        loading={false}
        mutationsSupported
        onArchive={async () => true}
        onCreate={async () => true}
        onDelete={async () => true}
        onOpenLinkedSpools={() => {}}
        onMerge={async () => true}
        onReload={() => {}}
        onRename={async () => true}
        onRestore={async () => true}
        rows={[location(), ...systemRows]}
        source="LIVE"
        usageByLocationId={new Map()}
      />
    </I18nContext.Provider>,
  );

  assert.match(html, /1 active location/);
  assert.match(html, /Dry box/);
  assert.doesNotMatch(html, /Studio slot|Printer:Studio/);
});

test("autocomplete includes active storage names but excludes archived and system locations", () => {
  const html = renderToStaticMarkup(<InventoryLocationDatalist rows={rows} />);

  assert.match(html, /value="Dry box"/);
  assert.doesNotMatch(html, /Old shelf/);
  assert.doesNotMatch(html, /Studio AMS 1/);
});
