import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, lookup, type I18nContextValue } from "../lib/i18n";
import { enDictionary } from "../lib/i18n_locales/locales/en";
import type { PrinterAmsSlotRow } from "../lib/tauri_client";
import { PrinterSlotSummaryStrip } from "./printer_slot_summary_strip";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (key, fallback = "") => lookup(enDictionary, key) ?? fallback,
};

test("collapsed printer summary shows manually assigned filament without live data", () => {
  const slots: PrinterAmsSlotRow[] = [
    {
      slot_id: "mmu-slot-2",
      ams_id: "printer_mmu_1",
      slot_index: 2,
      spool_id: "spool-petg",
      spool_material: "PETG",
      spool_filament_name: "PETG HF",
      spool_color_name: "Signal Orange",
      spool_hex_color: "#F97316",
    },
    {
      slot_id: "mmu-slot-3",
      ams_id: "printer_mmu_1",
      slot_index: 3,
      spool_id: null,
    },
  ];

  const html = renderToStaticMarkup(
    <I18nContext.Provider value={i18nValue}>
      <PrinterSlotSummaryStrip
        model="Prusa MK4S with MMU3"
        slots={slots}
        findSpoolById={() => null}
      />
    </I18nContext.Provider>,
  );

  assert.match(html, /aria-label="Loaded slots"/);
  assert.match(html, /MMU3 · Channel 2/);
  assert.match(html, />PETG</);
  assert.match(html, /title="MMU3 · Channel 2 · PETG HF · Signal Orange"/);
  assert.match(html, /background:#F97316/);
  assert.doesNotMatch(html, /Channel 3/);
  assert.doesNotMatch(html, /live/i);
});
