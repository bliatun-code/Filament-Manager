import assert from "node:assert/strict";
import test from "node:test";
import { latestReleaseUrl } from "./app_metadata";
import { buildDeviceVersionStatus, normalizeReportedAppVersion } from "./device_version_status";
import type { AppUpdateCheckState } from "./app_update_check";
import type { LibrarySyncHostValidationResult, LibrarySyncSettings } from "./tauri_client";

const settings: LibrarySyncSettings = {
  mode: "CLIENT", target_generation: 4, device_name: "Desk", library_id: "library-a", host_base_url: "http://workshop.local:4278",
  host_device_name: "Workshop Host", client_auth_paired: true,
};
const validation: LibrarySyncHostValidationResult = {
  base_url: settings.host_base_url!, reachable: true, ok: true, matches_library_id: true,
  pairing_checked: true, pairing_valid: true, target_generation: 4, api_version: "v1", app_version: "0.32.0",
  library_id: settings.library_id, device_name: "Checked Host", sync_mode: "HOST", message: "ok",
};
const updateState: AppUpdateCheckState = {
  status: "SUCCESS",
  result: { current_version: "0.32.1", latest_version: "0.32.1", latest_tag: "v0.32.1", release_url: latestReleaseUrl(), update_channel: "PUBLIC_METADATA", status: "UP_TO_DATE" },
};
const input = { appVersion: "0.32.1", settings, validation, updateState };

test("device versions identify update needs separately against checked public release metadata", () => {
  const result = buildDeviceVersionStatus(input);
  assert.equal(result.local.version, "0.32.1");
  assert.equal(result.local.relation, "current");
  assert.equal(result.host.name, "Checked Host");
  assert.equal(result.host.version, "0.32.0");
  assert.equal(result.host.relation, "update");
  assert.equal(result.host.source, "checked");
  assert.equal(result.latest, "0.32.1");
});

test("version comparisons are numeric, and newer or unreported app versions are not called outdated", () => {
  assert.equal(buildDeviceVersionStatus({ ...input, appVersion: "0.100.0" }).local.relation, "newer");
  assert.equal(buildDeviceVersionStatus({ ...input, appVersion: "0.9.0" }).local.relation, "update");
  assert.equal(buildDeviceVersionStatus({ ...input, appVersion: null }).local.relation, "unknown");
  for (const raw of ["v1", "0.32", "latest", "0.32.1<script>", "0.032.1", "9007199254740992.0.0"]) {
    assert.equal(normalizeReportedAppVersion(raw), null, raw);
  }
  assert.equal(normalizeReportedAppVersion(" v0.32.1 "), "0.32.1");
});

test("old Hosts without app_version remain unknown even when api_version is present", () => {
  const result = buildDeviceVersionStatus({ ...input, validation: { ...validation, app_version: undefined, api_version: "v0.32.1" } });
  assert.equal(result.host.version, null);
  assert.equal(result.host.relation, "unknown");
  assert.equal(result.host.checked, true);
});

test("wrong Host, wrong library, unverified pairing and failed health never supply a checked app version", () => {
  for (const change of [
    { base_url: "http://other.local:4278" }, { library_id: "library-b" }, { matches_library_id: false },
    { pairing_checked: false }, { pairing_valid: false }, { reachable: false }, { ok: false }, { sync_mode: "STANDALONE" },
  ]) {
    const result = buildDeviceVersionStatus({ ...input, validation: { ...validation, ...change } });
    assert.equal(result.host.version, null);
    assert.equal(result.host.source, "unknown");
    assert.equal(result.host.name, "Workshop Host");
  }
});

test("a successful old A check cannot supply the version after the target changes A to B to A", () => {
  const returnedToA = { ...settings, target_generation: settings.target_generation! + 2 };
  const oldCheck = buildDeviceVersionStatus({ ...input, settings: returnedToA });
  assert.equal(oldCheck.host.version, null);
  assert.equal(oldCheck.host.source, "unknown");
  assert.equal(oldCheck.host.checked, false);
  assert.equal(buildDeviceVersionStatus({ ...input, settings: returnedToA, validation: { ...validation, target_generation: returnedToA.target_generation } }).host.source, "checked");
  for (const target_generation of [undefined, null, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(buildDeviceVersionStatus({ ...input, validation: { ...validation, target_generation } }).host.checked, false);
  }
  for (const generation of [undefined, -1, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(buildDeviceVersionStatus({ ...input, settings: { ...settings, target_generation: generation }, validation: { ...validation, target_generation: generation } }).host.checked, false);
  }
});

test("target-scoped saved versions remain explicitly cached and do not assert a current update need", () => {
  const cachedSnapshot = {
    captured_at: "2026-10-17T10:00:00Z", app_version: "0.31.0", library_id: settings.library_id, device_name: "Saved Host", sync_mode: "HOST",
  } as NonNullable<LibrarySyncSettings["cached_snapshot"]>;
  const result = buildDeviceVersionStatus({ ...input, settings: { ...settings, cached_snapshot: cachedSnapshot }, validation: { ...validation, reachable: false } });
  assert.equal(result.host.version, "0.31.0");
  assert.equal(result.host.source, "cached");
  assert.equal(result.host.relation, "unchecked");
  assert.equal(buildDeviceVersionStatus({ ...input, settings: { ...settings, library_id: "library-b", cached_snapshot: cachedSnapshot }, validation: null }).host.version, null);
  assert.equal(buildDeviceVersionStatus({ ...input, settings: { ...settings, cached_snapshot: cachedSnapshot }, validation: { ...validation, app_version: null } }).host.version, null);
});

test("a published release must be explicitly available before either device is described as current or outdated", () => {
  for (const state of [{ status: "IDLE" }, { status: "CHECKING" }, { status: "ERROR" }] as AppUpdateCheckState[]) {
    const result = buildDeviceVersionStatus({ ...input, updateState: state });
    assert.equal(result.local.relation, "unchecked");
    assert.equal(result.host.relation, "unchecked");
  }
  if (updateState.status !== "SUCCESS") throw new Error("test requires success fixture");
  for (const result of [
    { ...updateState.result, update_channel: "DISABLED" as const },
    { ...updateState.result, status: "RELEASE_INFO_UNAVAILABLE" as const },
    { ...updateState.result, latest_tag: "v9.0.0" },
    { ...updateState.result, release_url: "https://untrusted.example/releases/latest" },
  ]) {
    assert.equal(buildDeviceVersionStatus({ ...input, updateState: { status: "SUCCESS", result } }).latest, null);
  }
});
