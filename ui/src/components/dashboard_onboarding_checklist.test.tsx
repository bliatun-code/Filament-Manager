import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "../lib/i18n_provider";
import { buildDashboardOnboardingState } from "../lib/dashboard_onboarding";
import { DashboardOnboardingChecklist } from "./dashboard_onboarding_checklist";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("dashboard onboarding renders textual progress, optional states and actions", () => {
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
  assert.match(html, /2 of 4 complete/);
  assert.match(html, /Complete/);
  assert.match(html, /Optional/);
  assert.match(html, /Dismiss checklist/);
  assert.match(html, /Import backup\/data file/);
  assert.match(html, /Open companion settings/);
});
