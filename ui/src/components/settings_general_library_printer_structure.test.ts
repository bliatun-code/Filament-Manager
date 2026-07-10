import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readComponentSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

test("general settings and library role modal share heading typography", () => {
  const generalTab = readComponentSource("settings_general_tab.tsx");
  const libraryRoleModal = readComponentSource("settings_library_role_modal.tsx");

  assert.match(generalTab, /settingsSectionLabelClass/);
  assert.match(libraryRoleModal, /<ModalHeader/);
  assert.match(libraryRoleModal, /eyebrow=\{t\("settings\.libraryRoleLabel", "Library role"\)\}/);
  assert.doesNotMatch(generalTab, /tracking-\[0\.22em\]/);
  assert.doesNotMatch(libraryRoleModal, /tracking-\[0\.22em\]/);
});

test("library role confirmation uses shared filled action buttons", () => {
  const source = readComponentSource("settings_library_role_modal.tsx");

  assert.match(source, /ModalNotice/);
  assert.match(source, /tone="warning"/);
  assert.match(
    source,
    /settingsActionButtonClass\(\s*libraryRoleConfirmArmed \? "warning" : "primary",\s*"comfortable",\s*\)/,
  );
  assert.doesNotMatch(source, /roleNoticeClass/);
  assert.doesNotMatch(source, /FeedbackBanner/);
  assert.doesNotMatch(source, /rounded-xl border border-amber-300\/80 bg-amber-50\/80/);
  assert.doesNotMatch(source, /border border-amber-300 bg-amber-500/);
  assert.doesNotMatch(source, /border border-indigo-300 bg-indigo-500/);
});

test("library role confirmation keeps its actions visible while migration steps scroll", () => {
  const source = readComponentSource("settings_library_role_modal.tsx");

  assert.match(source, /sticky -bottom-5 z-10 -mx-5 -mb-5/);
  assert.match(source, /bg-white\/95[^"]*backdrop-blur-xl[^"]*dark:bg-slate-900\/95/);
  assert.match(source, /disabled=\{!tauri \|\| librarySyncBusy \|\| !roleChangeState\.ready\}/);
});

test("printer edit form uses shared settings form controls", () => {
  const source = readComponentSource("settings_printer_edit_form.tsx");
  const cardSource = readComponentSource("settings_printer_card.tsx");

  assert.match(source, /settingsFormControlClass/);
  assert.match(source, /settingsSectionLabelClass/);
  assert.match(
    source,
    /settingsActionButtonClass\(dirty \? "primary" : "neutral"\)/,
  );
  assert.match(source, /FeedbackBanner/);
  assert.match(source, /tone="warning" compact/);
  assert.match(source, /htmlFor=\{modelInputId\}/);
  assert.match(source, /id=\{modelInputId\}/);
  assert.match(source, /aria-describedby=\{configurationHintId\}/);
  assert.match(source, /htmlFor=\{liveHostInputId\}/);
  assert.match(source, /aria-describedby=\{liveHintId\}/);
  assert.match(source, /aria-describedby=\{`\$\{liveHintId\} \$\{liveNoteId\}`\}/);
  assert.match(source, /id=\{liveHintId\}/);
  assert.match(source, /id=\{liveNoteId\}/);
  assert.match(source, /<form/);
  assert.match(source, /type="submit"/);
  assert.match(source, /disabled=\{disabled \|\| !dirty\}/);
  assert.match(cardSource, /printerId=\{printer\.id\}/);
  assert.doesNotMatch(source, /const textInputClass/);
  assert.doesNotMatch(source, /rounded-lg border border-amber-200 bg-amber-50/);
  assert.doesNotMatch(source, /rounded-lg border border-slate-200 bg-white px-3 py-2/);
  assert.doesNotMatch(source, /rounded-lg bg-slate-900 px-4 py-2/);
});
