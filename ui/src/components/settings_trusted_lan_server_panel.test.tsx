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
  interfaceValue: "en0 (192.168.1.20)",
  pairActionDisabled: false,
  portHint: "Stable port",
  portValue: "4279",
  reachable: true,
  shellUrlHint: "Trusted network URL",
  shellUrlValue: "http://192.168.1.20:4279/companion",
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

  assert.match(html, /Network interface \(IP\)[\s\S]*en0 \(192\.168\.1\.20\)/);
  assert.match(html, /Web app port[\s\S]*>4279</);
  assert.match(html, /LAN URL[\s\S]*http:\/\/192\.168\.1\.20:4279\/companion/);
  assert.doesNotMatch(html, />:4279</);
  assert.doesNotMatch(html, /<form/);
});

test("network editor replaces summary cards and keeps save as the only accent action", () => {
  const html = renderPanel(true);

  assert.match(html, /<form id="trusted-lan-network-editor"/);
  assert.match(html, /Network interface \(IP\)[\s\S]*<select/);
  assert.match(html, /Web app port[\s\S]*type="number"/);
  assert.match(html, /type="submit"/);
  assert.equal((html.match(/border-indigo-200/g) ?? []).length, 1);
  assert.doesNotMatch(html, /LAN URL/);
});
