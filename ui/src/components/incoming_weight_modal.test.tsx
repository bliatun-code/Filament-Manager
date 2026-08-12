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

function renderModal(
  busy: boolean,
  promptOverride: IncomingWeightPrompt = prompt,
  amsEstimateAvailable = true,
): string {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: i18nValue },
      React.createElement(IncomingWeightModal, {
        amsEstimateAvailable,
        busy,
        prompt: promptOverride,
        incomingWeightValue: "1000",
        outgoingWeightValue: "600",
        onIncomingWeightChange: () => {},
        onOutgoingWeightChange: () => {},
        onCancel: () => {},
        onAcceptAmsEstimate: () => {},
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

test("IncomingWeightModal presents a dedicated exact-match AMS estimate action", () => {
  const amsPrompt: IncomingWeightPrompt = {
    ...prompt,
    requiresOutgoingWeight: false,
    updatesCurrentRollWeight: true,
    amsWeightEstimate: {
      spoolId: "spool-2",
      remainingGrams: 280,
      remainingPercent: 28,
      trayWeightG: 1000,
      tareWeightG: 250,
      calculatedTotalWeightG: 530,
      weightSeenAt: "2026-08-12T08:00:00Z",
      expectedCurrentGrams: 1000,
    },
  };
  const html = renderModal(false, amsPrompt);

  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.match(html, /AMS estimate/);
  assert.match(html, /28%/);
  assert.match(html, /280 g/);
  assert.match(html, /250 g/);
  assert.match(html, /530 g/);
  assert.match(html, /data-testid="printer-ams-weight-estimate"/);
  assert.match(html, /aria-label="Update weight"/);
  assert.match(html, />Use AMS estimate<\/button>/);
  assert.match(html, /bg-sky-800[^"]*text-white/);
  assert.doesNotMatch(html, /bg-sky-600/);
  assert.ok(html.indexOf(">Use AMS estimate</button>") < html.indexOf(">Save</button>"));

  const unavailableHtml = renderModal(false, amsPrompt, false);
  assert.doesNotMatch(unavailableHtml, /AMS estimate/);
  assert.doesNotMatch(unavailableHtml, />Use AMS estimate<\/button>/);
});
