import assert from "node:assert/strict";
import test from "node:test";

import { loadTrustedLanSettingsData } from "./trusted_lan_data_source";
import type {
  TrustedLanCompanionStatus,
  TrustedLanInterfaceOption,
  TrustedLanPairedBrowser,
} from "./tauri_client";

function trustedLanStatus(
  overrides: Partial<TrustedLanCompanionStatus> = {},
): TrustedLanCompanionStatus {
  return {
    enabled: true,
    selected_interface_name: "en0",
    selected_interface_address: "192.168.1.20",
    bind_address: "192.168.1.20",
    advertised_hostname: "filament-manager-a1b2.local",
    direct_base_url: "http://192.168.1.20:4278",
    base_url: "http://filament-manager-a1b2.local:4278",
    shell_url: "http://filament-manager-a1b2.local:4278/companion",
    listen_port: 4278,
    shell_reachable: true,
    health_error: null,
    running: true,
    last_error: null,
    local_name_running: true,
    local_name_error: null,
    api_version: "1",
    auth_mode: "pairing",
    ...overrides,
  };
}

const interfaces: TrustedLanInterfaceOption[] = [
  {
    name: "en0",
    address: "192.168.1.20",
    label: "Wi-Fi",
  },
];

const pairedBrowsers: TrustedLanPairedBrowser[] = [
  {
    id: "browser-1",
    display_name: "MacBook",
    paired_at: "2026-04-01 10:00:00",
    last_seen_at: "2026-04-01 10:01:00",
    last_origin: "http://192.168.1.30",
    revoked_at: null,
  },
];

test("loadTrustedLanSettingsData returns companion status, interfaces, and browsers", async () => {
  const status = trustedLanStatus();
  const result = await loadTrustedLanSettingsData({
    loadStatus: async () => status,
    loadInterfaces: async () => interfaces,
    loadPairedBrowsers: async () => pairedBrowsers,
  });

  assert.equal(result.status, status);
  assert.equal(result.interfaces, interfaces);
  assert.equal(result.pairedBrowsers, pairedBrowsers);
  assert.equal(result.statusError, null);
  assert.equal(result.interfacesError, null);
  assert.equal(result.pairedBrowsersError, null);
});

test("loadTrustedLanSettingsData falls back independently when companion parts fail", async () => {
  const statusError = new Error("status unavailable");
  const browsersError = new Error("browsers unavailable");

  const result = await loadTrustedLanSettingsData({
    loadStatus: async () => {
      throw statusError;
    },
    loadInterfaces: async () => interfaces,
    loadPairedBrowsers: async () => {
      throw browsersError;
    },
  });

  assert.equal(result.status, null);
  assert.equal(result.interfaces, interfaces);
  assert.deepEqual(result.pairedBrowsers, []);
  assert.equal(result.statusError, statusError);
  assert.equal(result.interfacesError, null);
  assert.equal(result.pairedBrowsersError, browsersError);
});
