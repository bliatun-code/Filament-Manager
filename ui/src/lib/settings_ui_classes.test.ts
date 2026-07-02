import assert from "node:assert/strict";
import test from "node:test";

import {
  settingsActionButtonClass,
  settingsCompactFormControlClass,
  settingsCompactSelectClass,
  settingsFormControlClass,
  settingsGroupLabelClass,
  settingsSectionLabelClass,
  settingsTextInputClass,
  settingsTinyLabelClass,
} from "./settings_ui_classes";

test("settings action buttons expose compact and destructive variants", () => {
  const compactNeutral = settingsActionButtonClass("neutral", "compact");
  const defaultNeutral = settingsActionButtonClass();
  const comfortablePrimary = settingsActionButtonClass("primary", "comfortable");
  const warning = settingsActionButtonClass("warning", "comfortable");
  const warningQuiet = settingsActionButtonClass("warningQuiet", "compact");
  const danger = settingsActionButtonClass("danger", "compact");
  const dangerQuiet = settingsActionButtonClass("dangerQuiet", "compact");

  assert.match(compactNeutral, /px-2 py-1 text-xs/);
  assert.match(defaultNeutral, /px-3 py-2 text-sm/);
  assert.match(comfortablePrimary, /px-4 py-3 text-sm/);
  assert.match(compactNeutral, /focus-visible:border-sky-300\/70/);
  assert.match(comfortablePrimary, /bg-indigo-500/);
  assert.match(warning, /bg-amber-500/);
  assert.match(warningQuiet, /border-amber-300/);
  assert.match(warningQuiet, /bg-transparent/);
  assert.match(danger, /bg-rose-600/);
  assert.match(dangerQuiet, /bg-transparent/);
  assert.match(dangerQuiet, /text-rose-700/);
});

test("settings compact selects share focus and disabled treatment", () => {
  assert.match(settingsCompactSelectClass, /rounded-lg border border-slate-300/);
  assert.match(settingsCompactSelectClass, /text-xs text-slate-700/);
  assert.match(settingsCompactSelectClass, /focus-visible:border-sky-300\/70/);
  assert.match(settingsCompactSelectClass, /disabled:opacity-50/);
});

test("settings compact form controls share focus and disabled treatment", () => {
  assert.match(settingsCompactFormControlClass, /rounded-xl border border-slate-200/);
  assert.match(settingsCompactFormControlClass, /text-xs text-slate-900/);
  assert.match(settingsCompactFormControlClass, /focus-visible:border-sky-300\/70/);
  assert.match(settingsCompactFormControlClass, /focus-visible:ring-2/);
  assert.match(settingsCompactFormControlClass, /disabled:opacity-50/);
});

test("settings text inputs use the shared form control chrome", () => {
  assert.equal(settingsTextInputClass, settingsFormControlClass);
  assert.match(settingsFormControlClass, /w-full rounded-xl border border-slate-200/);
  assert.match(settingsFormControlClass, /focus:ring-2 focus:ring-indigo-200/);
  assert.match(settingsFormControlClass, /dark:bg-slate-950\/70/);
});

test("settings section labels keep compact uppercase typography", () => {
  assert.match(settingsSectionLabelClass, /text-\[11px\] font-semibold uppercase/);
  assert.match(settingsSectionLabelClass, /tracking-\[0\.18em\]/);
  assert.match(settingsSectionLabelClass, /text-slate-500/);
});

test("settings group labels keep wide uppercase typography", () => {
  assert.match(settingsGroupLabelClass, /text-xs font-semibold uppercase/);
  assert.match(settingsGroupLabelClass, /tracking-\[0\.28em\]/);
  assert.match(settingsGroupLabelClass, /text-slate-500/);
});

test("settings tiny labels keep diagnostic metadata typography", () => {
  assert.match(settingsTinyLabelClass, /text-\[10px\] font-semibold uppercase/);
  assert.match(settingsTinyLabelClass, /tracking-\[0\.16em\]/);
  assert.match(settingsTinyLabelClass, /text-slate-500/);
});
