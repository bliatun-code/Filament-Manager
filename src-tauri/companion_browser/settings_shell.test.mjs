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
  assert.match(html, /Norwegian/);
  assert.match(html, /English/);
  assert.doesNotMatch(html, /Workflow scope/);
  assert.match(html, /Refresh companion data/);
  assert.doesNotMatch(html, /Forget token/);
  assert.doesNotMatch(html, /Desktop-owned SQLite/);
  assert.doesNotMatch(html, /Loopback API/);
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
  assert.match(html, /Norsk/);
  assert.match(html, /Engelsk/);
  assert.match(html, /Refresh companion data|Oppdater kompanjongdata/);
});
