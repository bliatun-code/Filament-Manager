import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "../lib/i18n_provider";
import { buildDashboardOnboardingState } from "../lib/dashboard_onboarding";
import { DashboardOnboardingChecklist } from "./dashboard_onboarding_checklist";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("dashboard onboarding separates pending required and optional work", () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <DashboardOnboardingChecklist
        onAddSpool={() => {}}
        onDismiss={() => {}}
        onOpenBackup={() => {}}
        onOpenCompanion={() => {}}
        onOpenImport={() => {}}
        onOpenPrinters={() => {}}
        state={buildDashboardOnboardingState({
          backupComplete: false,
          companionComplete: true,
          inventoryComplete: true,
          printerComplete: false,
        })}
      />
    </I18nProvider>,
  );

  assert.match(html, /Finish setup/);
  assert.match(html, /1 of 2 complete/);
  assert.match(html, /data-onboarding-group="required"/);
  assert.match(html, /data-onboarding-group="optional"/);
  assert.match(html, /data-onboarding-task="BACKUP"/);
  assert.match(html, /data-onboarding-task="PRINTER"/);
  assert.doesNotMatch(html, /data-onboarding-task="INVENTORY"/);
  assert.doesNotMatch(html, /data-onboarding-task="COMPANION"/);
  assert.match(html, /Complete/);
  assert.match(html, /Optional/);
  assert.match(html, /Dismiss checklist/);
  assert.match(html, />Printers</);
  assert.doesNotMatch(html, /Import backup\/data file/);
  assert.doesNotMatch(html, /Open companion settings/);
});

test("dashboard onboarding collapses completed steps without action controls", () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <DashboardOnboardingChecklist
        onAddSpool={() => {}}
        onDismiss={() => {}}
        onOpenBackup={() => {}}
        onOpenCompanion={() => {}}
        onOpenImport={() => {}}
        onOpenPrinters={() => {}}
        state={buildDashboardOnboardingState({
          backupComplete: true,
          companionComplete: true,
          inventoryComplete: true,
          printerComplete: true,
        })}
      />
    </I18nProvider>,
  );

  assert.match(html, /2 of 2 complete/);
  assert.match(html, /<details[^>]*data-onboarding-group="completed"/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|>)/);
  assert.doesNotMatch(html, /data-onboarding-group="required"/);
  assert.doesNotMatch(html, /data-onboarding-group="optional"/);
  assert.doesNotMatch(html, /data-onboarding-task=/);
  assert.doesNotMatch(html, /Import backup\/data file/);
  assert.doesNotMatch(html, /Open companion settings/);
});
