import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  I18nContext,
  lookup,
  type I18nContextValue,
} from "../lib/i18n";
import { enDictionary } from "../lib/i18n_locales/locales/en";
import type { SpoolHistoryEventRow } from "../lib/tauri_client";
import { InventoryRollHistoryPanel } from "./inventory_roll_history_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (key, fallback = "") => lookup(enDictionary, key) ?? fallback,
};

function historyEvent(index: number): SpoolHistoryEventRow {
  return {
    id: `history-${index}`,
    spool_id: "spool-1",
    event_type: `EVENT_${index}`,
    payload_json: {},
    created_at: `2026-07-${String(index).padStart(2, "0")}T10:00:00Z`,
  };
}

function renderPanel(options: {
  historyLoading?: boolean;
  rows?: SpoolHistoryEventRow[];
  showRollHistory?: boolean;
} = {}): string {
  const rows = options.rows ?? [];

  return renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <InventoryRollHistoryPanel
        formatHistoryEventDetails={(event) => `Details for ${event.id}`}
        formatHistoryEventType={(eventType) => `Type ${eventType}`}
        hasHiddenHistoryRows={false}
        historyLoading={options.historyLoading ?? false}
        onToggle={() => {}}
        resolvedTheme="light"
        showRollHistory={options.showRollHistory ?? true}
        spoolHexColor="#64748B"
        visibleHistoryRows={rows}
      />
    </I18nContext.Provider>,
  );
}

test("InventoryRollHistoryPanel connects its disclosure and renders a semantic timeline", () => {
  const row = historyEvent(1);
  const html = renderPanel({ rows: [row] });

  assert.match(html, /id="inventory-roll-history-panel"/);
  assert.match(
    html,
    /id="inventory-roll-history-toggle"[^>]*aria-controls="inventory-roll-history-events"[^>]*aria-expanded="true"/,
  );
  assert.match(
    html,
    /id="inventory-roll-history-events"[^>]*aria-busy="false"/,
  );
  assert.doesNotMatch(html, /id="inventory-roll-history-events"[^>]*hidden/);
  assert.match(html, />1 event</);
  assert.equal((html.match(/<ol/g) ?? []).length, 1);
  assert.equal((html.match(/<li/g) ?? []).length, 1);
  assert.match(html, /<time[^>]*dateTime="2026-07-01T10:00:00Z"/);
  assert.match(html, />Type EVENT_1</);
  assert.match(html, />Details for history-1</);
});

test("InventoryRollHistoryPanel shows the normal six-event history without pagination", () => {
  const html = renderPanel({ rows: Array.from({ length: 6 }, (_, index) => historyEvent(index + 1)) });

  assert.match(html, />6 events</);
  assert.equal((html.match(/<li/g) ?? []).length, 6);
  assert.doesNotMatch(html, />Show more</);
  assert.doesNotMatch(html, />Show fewer</);
});

test("InventoryRollHistoryPanel initially limits long histories to eight rows", () => {
  const html = renderPanel({
    rows: Array.from({ length: 10 }, (_, index) => historyEvent(index + 1)),
  });

  assert.match(html, />10 events</);
  assert.equal((html.match(/<li/g) ?? []).length, 8);
  assert.match(html, />Details for history-8</);
  assert.doesNotMatch(html, />Details for history-9</);
  assert.match(
    html,
    /<button[^>]*aria-controls="inventory-roll-history-list"[^>]*aria-expanded="false"[^>]*>Show more<\/button>/,
  );
});

test("InventoryRollHistoryPanel reports the collapsed disclosure state", () => {
  const html = renderPanel({ rows: [historyEvent(1)], showRollHistory: false });

  assert.match(
    html,
    /id="inventory-roll-history-toggle"[^>]*aria-controls="inventory-roll-history-events"[^>]*aria-expanded="false"/,
  );
  assert.match(html, /id="inventory-roll-history-events"[^>]*hidden=""/);
});
