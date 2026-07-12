import test from "node:test";
import assert from "node:assert/strict";

import { createInitialCompanionState } from "./session_state.js";
import { renderSettingsShell } from "./settings_shell.js";

function renderShell(overrides = {}) {
  const state = {
    ...createInitialCompanionState(),
    apiReady: true,
    spools: [{ spool: { id: "spool-1" } }],
    printers: [{ printer: { id: "printer-1" } }, { printer: { id: "printer-2" } }],
    activeLoans: [{ loan: { id: "loan-1" } }],
    ...overrides.state,
  };

  return renderSettingsShell({
    state,
    escapeHtml: (value) => String(value ?? ""),
  });
}

test("settings shell renders session metrics and current session actions", () => {
  const html = renderShell();

  assert.match(html, /Settings/);
  assert.match(html, /Appearance/);
  assert.match(html, /data-action="set-theme-mode"/);
  assert.match(html, /Connection/);
  assert.match(html, /Following device · Light/);
  assert.match(html, /Trusted-LAN connected · 1 spool · 2 printers · 1 active loan/);
  assert.match(html, /data-action="set-locale"/);
  assert.match(html, /Norsk \(bokmål\)/);
  assert.match(html, /English/);
  assert.match(html, /Deutsch/);
  assert.match(html, /Français/);
  assert.doesNotMatch(html, /Español/);
  assert.doesNotMatch(html, /Português \(Brasil\)/);
  assert.match(html, /class="segmented-control" data-columns="2" role="group" aria-label="Language"/);
  assert.doesNotMatch(html, /Workflow scope/);
  assert.match(html, /Refresh companion data/);
  assert.doesNotMatch(html, /Forget token/);
  assert.doesNotMatch(html, /Desktop-owned SQLite/);
  assert.doesNotMatch(html, /Loopback API/);
});

test("settings shell exposes AGPL license and source links", () => {
  const html = renderShell();

  assert.match(html, /AGPL-3\.0-or-later/);
  assert.match(html, /Source code/);
  assert.match(html, /View license/);
  assert.match(html, /Notices/);
  assert.match(html, /github\.com\/bliatun-code\/Filament-Manager/);
  assert.match(html, /github\.com\/bliatun-code\/Filament-Manager\/blob\/main\/LICENSE/);
  assert.match(html, /github\.com\/bliatun-code\/Filament-Manager\/blob\/main\/NOTICE\.md/);
});

test("settings shell reflects disconnected session state", () => {
  const html = renderShell({
    state: {
      apiReady: false,
      spools: [],
      printers: [],
      activeLoans: [],
    },
  });

  assert.match(html, /Disconnected · 0 spools · 0 printers · 0 active loans/);
});

test("settings shell localizes visible controls in norwegian", () => {
  const html = renderShell({
    state: {
      locale: "nb",
      themeMode: "light",
      resolvedTheme: "light",
    },
  });

  assert.match(html, /Innstillinger/);
  assert.match(html, /Språk/);
  assert.match(html, /class="segmented-control settings-theme-control"/);
  assert.match(html, /Følg enheten/);
  assert.match(html, /Lyse flater/);
  assert.match(html, /Bedre i svakt lys/);
  assert.match(html, /Lys modus/);
  assert.doesNotMatch(html, /Lys modus · Lys/);
  assert.match(html, /Norsk/);
  assert.match(html, /English/);
  assert.match(html, /1 spole · 2 printere · 1 aktivt utlån/);
  assert.match(html, /Lisens/);
  assert.match(html, /Kildekode/);
  assert.match(html, /Vis lisens/);
  assert.match(html, /Refresh companion data|Oppdater kompanjongdata/);
});
