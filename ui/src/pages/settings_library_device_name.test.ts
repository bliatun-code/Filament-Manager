import assert from "node:assert/strict";
import test from "node:test";

import type { LibrarySyncSettings } from "../lib/tauri_client";
import {
  isLibrarySyncDeviceNameDirty,
  persistLibrarySyncDeviceName,
} from "./settings_library_device_name";

function clientSettings(): LibrarySyncSettings {
  return {
    mode: "CLIENT",
    device_name: "Workshop Mac",
    library_id: "library-1",
    host_base_url: "http://host.local",
    host_device_name: "Main host",
    client_auth_paired: true,
    client_auth_paired_at: "2026-07-01T12:00:00Z",
    client_auth_expires_at: "2026-08-01T12:00:00Z",
  };
}

test("device-name save writes once without changing the saved library role", async () => {
  const writes: LibrarySyncSettings[] = [];
  const current = clientSettings();

  const saved = await persistLibrarySyncDeviceName({
    current,
    deviceName: "Workshop iMac",
    writeSettings: async (settings) => {
      writes.push(settings);
      return settings;
    },
  });

  assert.equal(writes.length, 1);
  assert.equal(saved.mode, "CLIENT");
  assert.equal(saved.device_name, "Workshop iMac");
  assert.equal(saved.host_base_url, current.host_base_url);
  assert.equal(saved.client_auth_paired, true);
  assert.equal(saved.client_auth_paired_at, current.client_auth_paired_at);
  assert.equal(saved.client_auth_expires_at, current.client_auth_expires_at);
});

test("device-name dirty state compares the draft with persisted settings", () => {
  const current = clientSettings();

  assert.equal(isLibrarySyncDeviceNameDirty(null, "Workshop Mac"), false);
  assert.equal(isLibrarySyncDeviceNameDirty(current, "Workshop Mac"), false);
  assert.equal(isLibrarySyncDeviceNameDirty(current, "Workshop iMac"), true);
});

test("device-name save refuses to normalize an unknown role as a side effect", async () => {
  let writeCalled = false;

  await assert.rejects(
    persistLibrarySyncDeviceName({
      current: { ...clientSettings(), mode: "LEGACY_CLIENT" },
      deviceName: "Workshop iMac",
      writeSettings: async (settings) => {
        writeCalled = true;
        return settings;
      },
    }),
    /persisted library role is unknown/,
  );
  assert.equal(writeCalled, false);
});
