import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TrustedLanCompanionModel } from "../pages/settings_companion_model";
import { SettingsTrustedLanServerPanel } from "./settings_trusted_lan_server_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const companionModel: TrustedLanCompanionModel = {
  authHint: "Paired browsers only",
  authLabel: "Per-browser pairing",
  configActionDisabled: false,
  enabled: true,
  interfaceHint: "Private interface",
  interfaceValue: "en0",
  directAddressHint: "Current IP for diagnostics",
  directAddressValue: "http://192.168.1.20:4279",
  localNameWarning: null,
  pairActionDisabled: false,
  portHint: "Stable port",
  portValue: "4279",
  reachable: true,
  stableAddressHint: "Trusted network URL",
  stableAddressValue: "http://filament-manager-a1b2.local:4279/companion",
  statusHint: "Running",
  statusLabel: "Running",
  statusPillLabel: "Live",
  statusTone: "live",
};

function renderPanel(showNetworkEditor: boolean): string {
  return renderToStaticMarkup(
    <SettingsTrustedLanServerPanel
      actionBusy={false}
      companionModel={companionModel}
      interfaceAddressDraft="192.168.1.20"
      interfaces={[{ address: "192.168.1.20", label: "en0 · 192.168.1.20", name: "en0" }]}
      networkDirty
      portDraft="4279"
      showNetworkEditor={showNetworkEditor}
      showNetworkSummary
      tauri
      t={(_key, fallback) => fallback}
      onInterfaceAddressChange={() => {}}
      onPortChange={() => {}}
      onSaveNetwork={() => {}}
      onToggleNetworkEditor={() => {}}
      onToggleNetworkSummary={() => {}}
    />,
  );
}

test("network summary uses consistent field names and a plain port value", () => {
  const html = renderPanel(false);

  assert.match(
    html,
    /Stable local address[\s\S]*http:\/\/filament-manager-a1b2\.local:4279\/companion/,
  );
  assert.match(
    html,
    /Current direct address[\s\S]*http:\/\/192\.168\.1\.20:4279/,
  );
  assert.match(html, /Selected interface[\s\S]*en0/);
  assert.match(html, /Web app port[\s\S]*>4279</);
  assert.doesNotMatch(html, />:4279</);
  assert.doesNotMatch(html, /<form/);
});

test("network editor replaces summary cards and keeps save as the only accent action", () => {
  const html = renderPanel(true);

  assert.match(html, /<form id="trusted-lan-network-editor"/);
  assert.match(html, /Network interface \(IP\)[\s\S]*<select/);
  assert.match(html, /Web app port[\s\S]*type="number"/);
  assert.match(html, /type="submit"/);
  assert.equal((html.match(/app-accent-action/g) ?? []).length, 1);
  assert.doesNotMatch(html, /app-selected-control/);
  assert.doesNotMatch(html, /Stable local address/);
  assert.doesNotMatch(html, /Current direct address/);
});

test("local-name failure remains visible when network details are collapsed", () => {
  const html = renderToStaticMarkup(
    <SettingsTrustedLanServerPanel
      actionBusy={false}
      companionModel={{
        ...companionModel,
        localNameWarning: "The stable local name could not be advertised.",
        pairActionDisabled: true,
        reachable: false,
        statusTone: "warn",
      }}
      interfaceAddressDraft="192.168.1.20"
      interfaces={[]}
      networkDirty={false}
      portDraft="4279"
      showNetworkEditor={false}
      showNetworkSummary={false}
      tauri
      t={(_key, fallback) => fallback}
      onInterfaceAddressChange={() => {}}
      onPortChange={() => {}}
      onSaveNetwork={() => {}}
      onToggleNetworkEditor={() => {}}
      onToggleNetworkSummary={() => {}}
    />,
  );

  assert.match(html, /role="status"/);
  assert.match(html, /Stable local address unavailable/);
  assert.match(html, /The stable local name could not be advertised\./);
});
