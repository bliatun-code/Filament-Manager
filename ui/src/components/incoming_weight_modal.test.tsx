import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nContext, type I18nContextValue } from "../lib/i18n";
import type { IncomingWeightPrompt } from "../lib/printer_slot_model";
import { IncomingWeightModal } from "./incoming_weight_modal";

const prompt: IncomingWeightPrompt = {
  printerId: "printer-1",
  slotId: "slot-1",
  targetSpoolId: "spool-2",
  targetMaterial: "PLA",
  targetFilamentName: "Basic",
  targetColorName: "Blue",
  targetHexColor: "#2563EB",
  requiresOutgoingWeight: true,
  requiresIncomingWeight: true,
  currentMaterial: "ABS",
  currentFilamentName: "Basic",
  currentColorName: "Black",
};

const i18nValue: I18nContextValue = {
  locale: "en",
  setLocale: () => {},
  t: (_key, fallback = "") => fallback,
};

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderModal(busy: boolean): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue },
      React.createElement(IncomingWeightModal, {
        busy,
        prompt,
        incomingWeightValue: "1000",
        outgoingWeightValue: "600",
        onIncomingWeightChange: () => {},
        onOutgoingWeightChange: () => {},
        onCancel: () => {},
        onSave: () => {},
      }),
    ),
  );
}

test("IncomingWeightModal presents explicit secondary cancel and primary save actions", () => {
  const html = renderModal(false);

  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.match(html, />Cancel<\/button>/);
  assert.match(html, />Save<\/button>/);
  assert.ok(html.indexOf(">Cancel</button>") < html.indexOf(">Save</button>"));
  assert.match(html, /grid grid-cols-2 gap-3/);
  assert.match(html, /bg-slate-900[^"]*text-white/);
  assert.doesNotMatch(html, /background-image:/);
});

test("IncomingWeightModal disables both actions while a save is in progress", () => {
  const html = renderModal(true);

  assert.equal((html.match(/<button[^>]*disabled=""/g) ?? []).length, 2);
});
