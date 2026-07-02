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

test("printer edit form uses shared settings form controls", () => {
  const source = readComponentSource("settings_printer_edit_form.tsx");

  assert.match(source, /settingsFormControlClass/);
  assert.match(source, /settingsActionButtonClass\("primary"\)/);
  assert.match(source, /FeedbackBanner/);
  assert.match(source, /tone="warning" compact/);
  assert.doesNotMatch(source, /const textInputClass/);
  assert.doesNotMatch(source, /rounded-lg border border-amber-200 bg-amber-50/);
  assert.doesNotMatch(source, /rounded-lg border border-slate-200 bg-white px-3 py-2/);
  assert.doesNotMatch(source, /rounded-lg bg-slate-900 px-4 py-2/);
});
