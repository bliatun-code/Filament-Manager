import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { resolvePrinterModelProfile } from "../lib/printer_profiles";
import { SettingsPrinterEditForm } from "./settings_printer_edit_form";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderEditForm(dirty = false) {
  return renderToStaticMarkup(
    <SettingsPrinterEditForm
      bambuLiveAccessCode="12345678"
      bambuLiveEnabled
      bambuLiveHost="192.168.1.20"
      bambuLivePrinterSerial="00M09"
      busy={false}
      dirty={dirty}
      model="Bambu Lab X1 Carbon"
      modelProfile={resolvePrinterModelProfile("Bambu Lab X1 Carbon")}
      name="Workshop"
      printerId="printer/42"
      settingsClientReadOnly={false}
      slotsPerUnit="4"
      supportsBambuLive
      tauri
      t={(_key, fallback = "") => fallback}
      units="1"
      onBambuLiveAccessCodeChange={() => {}}
      onBambuLiveEnabledChange={() => {}}
      onBambuLiveHostChange={() => {}}
      onBambuLivePrinterSerialChange={() => {}}
      onCancel={() => {}}
      onModelChange={() => {}}
      onNameChange={() => {}}
      onSave={() => {}}
      onSlotsPerUnitChange={() => {}}
      onUnitsChange={() => {}}
    />,
  );
}

test("printer edit fields have permanent labels and matching ids", () => {
  const html = renderEditForm();
  const prefix = "settings-printer-printer_x2f_42";
  const fieldSuffixes = [
    "model",
    "name",
    "units",
    "slots-per-unit",
    "live-enabled",
    "live-host",
    "live-access-code",
    "live-printer-serial",
  ];

  for (const suffix of fieldSuffixes) {
    const id = `${prefix}-${suffix}`;
    assert.match(html, new RegExp(`for="${id}"`));
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, />Printer model<\/span>/);
  assert.match(html, />Printer name<\/span>/);
  assert.match(html, />AMS units<\/span>/);
  assert.match(html, />Slots per AMS<\/span>/);
  assert.match(html, />Printer host \/ IP<\/span>/);
  assert.match(html, />Access code<\/span>/);
  assert.match(html, />Printer serial<\/span>/);
  assert.match(html, /data-desktop-visual-qa-target="settings-printer-editor"/);
  assert.match(html, /min-\[720px\]:grid-cols-2/);
  assert.doesNotMatch(html, /md:grid-cols-2/);
  assert.match(html, /^<form/);
  assert.match(html, /<fieldset/);
});

test("printer edit fields reference existing help text", () => {
  const html = renderEditForm();
  const prefix = "settings-printer-printer_x2f_42";
  const configurationHintId = `${prefix}-configuration-hint`;
  const liveHintId = `${prefix}-live-hint`;
  const liveNoteId = `${prefix}-live-note`;

  assert.match(html, new RegExp(`id="${configurationHintId}"`));
  assert.equal(
    (html.match(new RegExp(`aria-describedby="${configurationHintId}"`, "g")) ?? []).length,
    4,
  );
  assert.match(html, new RegExp(`id="${liveHintId}"`));
  assert.match(html, new RegExp(`id="${liveNoteId}"`));
  assert.equal(
    (html.match(new RegExp(`aria-describedby="${liveHintId}"`, "g")) ?? []).length,
    3,
  );
  assert.match(html, new RegExp(`aria-describedby="${liveHintId} ${liveNoteId}"`));
  assert.match(html, /Choose model, name and multi-material capacity/);
  assert.match(html, /Optional local read-only integration/);
  assert.match(html, /Credentials are stored locally/);
});

test("printer edit uses native required fields and keeps save after live configuration", () => {
  const html = renderEditForm(true);
  const liveFieldsetEnd = html.indexOf("</fieldset>");
  const saveButton = html.indexOf("Save changes</button>");

  assert.ok(liveFieldsetEnd >= 0);
  assert.ok(saveButton > liveFieldsetEnd);
  assert.match(html, /<button type="submit"[^>]*>Save changes<\/button>/);
  assert.match(html, /<input[^>]*required=""[^>]*id="settings-printer-printer_x2f_42-model"|id="settings-printer-printer_x2f_42-model"[^>]*required=""/);
  assert.match(html, /autoComplete="new-password"|autocomplete="new-password"/);
  assert.match(html, />Unsaved changes<\/span>/);
});

test("printer edit disables save until the normalized draft changes", () => {
  const cleanHtml = renderEditForm(false);
  const dirtyHtml = renderEditForm(true);

  assert.match(cleanHtml, /<button type="submit"[^>]*disabled=""[^>]*>Save changes<\/button>/);
  assert.doesNotMatch(
    dirtyHtml,
    /<button type="submit"[^>]*disabled=""[^>]*>Save changes<\/button>/,
  );
  assert.match(cleanHtml, />No changes to save<\/span>/);
  assert.match(
    dirtyHtml,
    /data-desktop-visual-qa-target="settings-printer-editor-actions"/,
  );
});
