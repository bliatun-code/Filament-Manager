import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatMessage } from "../../../src-tauri/companion_browser/message_format.js";
import { AppUpdateContext, type AppUpdateContextValue } from "../lib/app_update_context";
import { latestReleaseUrl } from "../lib/app_metadata";
import type { LibrarySyncHostValidationResult, LibrarySyncSettings } from "../lib/tauri_client";
import { SettingsDeviceVersionPanel } from "./settings_device_version_panel";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const t = (_key: string, fallback: string, params = {}) => formatMessage(fallback, params, "en");
const settings: LibrarySyncSettings = { mode: "CLIENT", target_generation: 4, device_name: "Desk", library_id: "library-a", host_base_url: "http://workshop.local:4278", host_device_name: "Workshop Host", client_auth_paired: true };
const validation: LibrarySyncHostValidationResult = { base_url: settings.host_base_url!, reachable: true, ok: true, matches_library_id: true, pairing_checked: true, pairing_valid: true, target_generation: 4, app_version: "0.32.0", api_version: "v1", library_id: "library-a", device_name: "Workshop Host", sync_mode: "HOST", message: "ok" };
const updates: AppUpdateContextValue = {
  automaticChecksEnabled: false, checkManually: async () => null, dismissAvailableUpdate: () => {}, setAutomaticChecksEnabled: () => {}, showUpdateNotification: false,
  state: { status: "SUCCESS", result: { current_version: "0.32.1", latest_version: "0.32.1", latest_tag: "v0.32.1", release_url: latestReleaseUrl(), status: "UP_TO_DATE", update_channel: "PUBLIC_METADATA" } },
};

function render({ cached = false, unknown = false } = {}) {
  const snapshot = cached ? { captured_at: "2026-10-17T10:00:00Z", app_version: "0.31.0", library_id: "library-a", device_name: "Workshop Host", sync_mode: "HOST" } as NonNullable<LibrarySyncSettings["cached_snapshot"]> : null;
  return renderToStaticMarkup(<AppUpdateContext.Provider value={updates}><SettingsDeviceVersionPanel appVersion="0.32.1" busy={false} onRefreshHost={() => {}} settings={{ ...settings, cached_snapshot: snapshot }} tauri t={t} validation={cached ? null : unknown ? { ...validation, app_version: undefined } : validation} /></AppUpdateContext.Provider>);
}

test("device version panel shows separate device and named Host app versions and targeted update need", () => {
  const html = render();
  assert.match(html, /data-device-version="local"/);
  assert.match(html, /data-device-version="host"/);
  assert.match(html, />This device</);
  assert.match(html, />Workshop Host</);
  assert.match(html, />v0\.32\.1</);
  assert.match(html, />v0\.32\.0</);
  assert.equal((html.match(/>Update available</g) ?? []).length, 1);
  assert.match(html, />From the last host check</);
  assert.match(html, />Refresh host status</);
  assert.match(html, />Check for updates</);
  assert.match(html, />View release</);
  assert.match(html, /Catalog refresh runs on the host/);
  assert.match(html, /Updating this device does not update the host/);
  assert.doesNotMatch(html, /AMD-RYZEN|api_version|workshop\.local/);
});

test("cached and missing Host app versions are clearly distinguished from a current verification", () => {
  const cached = render({ cached: true });
  assert.match(cached, />v0\.31\.0</);
  assert.match(cached, />From the last host snapshot</);
  assert.match(cached, /This saved version may have changed/);
  assert.doesNotMatch(cached, /Update available|From the last host check/);
  const unknown = render({ unknown: true });
  assert.match(unknown, /Version not reported/);
  assert.doesNotMatch(unknown, /v1|From the last host check|unavailable until the configured host is verified/);
});
