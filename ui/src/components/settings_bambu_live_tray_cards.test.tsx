import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SettingsBambuLiveDiagnosticTrayCard } from "../pages/settings_bambu_live_diagnostics_model";
import { settingsBambuLiveTrayTechnicalDetailsId } from "./settings_bambu_live_dom_ids";
import { SettingsBambuLiveTrayCards } from "./settings_bambu_live_tray_cards";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function diagnosticTray(
  overrides: Partial<SettingsBambuLiveDiagnosticTrayCard> = {},
): SettingsBambuLiveDiagnosticTrayCard {
  return {
    amsWeightLabel: "AMS estimate: 620 g / 1000 g · 62%",
    candidateCountText: "2 candidates",
    candidates: [
      {
        key: "candidate-1",
        subtitle: "RFID saved · candidate-1",
        swatchColor: "#16A34A",
        title: "PLA Basic · Green",
      },
    ],
    detailText: "PLA · 62%",
    hasMoreCandidates: true,
    hasReview: true,
    key: "live-tray-ams-0-1",
    matchDescription: "Multiple inventory rolls could match this filament.",
    matchKind: "metadata_multiple",
    matchLabel: "PLA Basic · Green",
    matchNote: "Multiple stored spools could match this live tray.",
    matchSwatchColor: "#16A34A",
    mqttTrayLabel: "MQTT tray 1",
    nozzleRangeLabel: "Nozzle range: 190–230 °C",
    observedRfidLabel: "Observed RFID/AMS identity: RFID-123",
    presetSignalLabel: "Filament settings preset: PLA Basic",
    reviewTitle: "Review tray match",
    showCandidateCards: true,
    slotLabel: "AMS 1 · Slot 2",
    statusText: "Loaded · 62% remaining",
    ...overrides,
  };
}

function renderTrayCards(): string {
  return renderToStaticMarkup(
    <SettingsBambuLiveTrayCards
      moreCandidatesLabel="More matching rolls exist in inventory."
      printerId="printer/42"
      technicalDetailsHint="Raw RFID identity, weight basis, preset, temperature range and match diagnostics."
      technicalDetailsLabel="Technical details"
      trays={[diagnosticTray()]}
    />,
  );
}

test("tray cards keep operational and match context visible before collapsed technical data", () => {
  const html = renderTrayCards();
  const detailsStart = html.indexOf("<details");
  const detailsEnd = html.indexOf("</details>", detailsStart);

  assert.match(html, /sm:grid-cols-2 xl:grid-cols-4/);

  assert.ok(detailsStart > 0);
  assert.ok(detailsEnd > detailsStart);
  for (const visibleText of [
    "AMS 1 · Slot 2",
    "Loaded · 62% remaining",
    "PLA · 62%",
    "PLA Basic · Green",
    "Multiple inventory rolls could match this filament.",
  ]) {
    assert.ok(
      html.indexOf(visibleText) < detailsStart,
      `${visibleText} should stay outside the technical disclosure`,
    );
  }

  for (const technicalText of [
    "Observed RFID/AMS identity: RFID-123",
    "AMS estimate: 620 g / 1000 g · 62%",
    "PLA Basic · Green",
    "RFID saved · candidate-1",
    "Multiple stored spools could match this live tray.",
  ]) {
    const technicalIndex = html.lastIndexOf(technicalText);
    assert.ok(
      technicalIndex > detailsStart && technicalIndex < detailsEnd,
      `${technicalText} should be inside the technical disclosure`,
    );
  }
});

test("tray technical data uses a closed native details element with a stable accessible id", () => {
  const html = renderTrayCards();
  const expectedId = settingsBambuLiveTrayTechnicalDetailsId(
    "printer/42",
    "live-tray-ams-0-1",
  );
  const detailsTag = html.match(/<details[^>]*>/)?.[0] ?? "";

  assert.equal(
    expectedId,
    "settings-printer-printer_x2f_42-live-tray-ams-0-1-technical-details",
  );
  assert.match(detailsTag, new RegExp(`id="${expectedId}"`));
  assert.doesNotMatch(detailsTag, /\sopen(?:=|\s|>)/);
  assert.match(
    html,
    new RegExp(
      `<summary[^>]*aria-label="Technical details: AMS 1 · Slot 2"[^>]*aria-describedby="${expectedId}-hint"[^>]*>[\\s\\S]*Technical details`,
    ),
  );
  assert.match(html, new RegExp(`id="${expectedId}-hint"`));
  assert.equal(renderTrayCards(), html, "the same printer and tray must render the same ids");
  assert.notEqual(
    settingsBambuLiveTrayTechnicalDetailsId("printer/a", "tray"),
    settingsBambuLiveTrayTechnicalDetailsId("printer?a", "tray"),
  );
});
