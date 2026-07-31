import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TrustedLanCompanionStatus } from "../lib/tauri_client";
import { SettingsLibraryWebappControl } from "./settings_library_webapp_control";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function status(
  overrides: Partial<TrustedLanCompanionStatus> = {},
): TrustedLanCompanionStatus {
  return {
    enabled: true,
    advertised_hostname: "filament-manager-a1b2.local",
    direct_base_url: "http://192.168.1.20:4278",
    base_url: "http://filament-manager-a1b2.local:4278",
    shell_url: "http://filament-manager-a1b2.local:4278/companion",
    listen_port: 4278,
    shell_reachable: true,
    running: true,
    local_name_running: true,
    api_version: "1",
    auth_mode: "pairing-session",
    ...overrides,
  };
}

function renderControl(trustedLanStatus: TrustedLanCompanionStatus): string {
  return renderToStaticMarkup(
    <SettingsLibraryWebappControl
      librarySyncModeDraft="HOST"
      tauri
      trustedLanActionBusy={false}
      trustedLanEnabledDraft
      trustedLanHasPrivateInterfaces
      trustedLanStatus={trustedLanStatus}
      t={(_key, fallback) => fallback}
      onToggleTrustedLanEnabled={() => {}}
    />,
  );
}

test("host web app reports running when both direct health and the stable name are ready", () => {
  assert.match(renderControl(status()), />Running</);
});

test("host web app requests attention while the stable local name is unavailable", () => {
  const html = renderControl(
    status({
      base_url: null,
      shell_url: null,
      local_name_running: false,
      local_name_error: "local name unavailable",
    }),
  );

  assert.match(html, />Check</);
  assert.doesNotMatch(html, />Running</);
});
