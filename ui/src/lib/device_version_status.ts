import type { AppUpdateCheckState } from "./app_update_check";
import { latestReleaseUrl } from "./app_metadata";
import { resolveClientHostTarget } from "./host_write_target";
import type { LibrarySyncHostValidationResult, LibrarySyncSettings } from "./tauri_client";

export type DeviceVersionRelation = "unknown" | "unchecked" | "update" | "current" | "newer";

export function normalizeReportedAppVersion(raw: string | null | undefined): string | null {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(raw?.trim() ?? "");
  return match && match.slice(1).every((part) => Number.isSafeInteger(Number(part)))
    ? match.slice(1).join(".")
    : null;
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function publishedVersion(state: AppUpdateCheckState | null): string | null {
  if (state?.status !== "SUCCESS") return null;
  const { result } = state;
  const version = normalizeReportedAppVersion(result.latest_version);
  return version &&
    result.update_channel === "PUBLIC_METADATA" &&
    ["UPDATE_AVAILABLE", "UP_TO_DATE", "DEVELOPMENT_BUILD"].includes(result.status) &&
    result.latest_tag === `v${version}` && result.release_url === latestReleaseUrl()
    ? version
    : null;
}

function relation(version: string | null, latest: string | null): DeviceVersionRelation {
  if (!version) return "unknown";
  if (!latest) return "unchecked";
  const difference = compareVersions(version, latest);
  return difference < 0 ? "update" : difference > 0 ? "newer" : "current";
}

/** Present only metadata bound to the configured Host, never the health API version. */
export function buildDeviceVersionStatus({
  appVersion,
  settings,
  validation,
  updateState,
}: {
  appVersion: string | null;
  settings: LibrarySyncSettings | null;
  validation: LibrarySyncHostValidationResult | null;
  updateState: AppUpdateCheckState | null;
}) {
  const latest = publishedVersion(updateState);
  const localVersion = normalizeReportedAppVersion(appVersion);
  const target = settings?.mode === "CLIENT"
    ? resolveClientHostTarget({ clientHostBaseUrl: settings.host_base_url, clientLibraryId: settings.library_id })
    : null;
  const validationTarget = validation
    ? resolveClientHostTarget({ clientHostBaseUrl: validation.base_url, clientLibraryId: validation.library_id })
    : null;
  const generation = settings?.target_generation;
  const checked = Boolean(target && validationTarget &&
    target.baseUrl === validationTarget.baseUrl && target.libraryId === validationTarget.libraryId &&
    typeof generation === "number" && Number.isSafeInteger(generation) && generation >= 0 &&
    validation?.target_generation === generation &&
    settings?.client_auth_paired && validation?.reachable && validation.ok && validation.matches_library_id &&
    validation.pairing_checked && validation.pairing_valid && validation.sync_mode === "HOST");
  // The persisted snapshot is target-scoped by the native generation guard and
  // cleared when that target changes. Avoid unrelated transient page snapshots.
  const cached = target && settings?.cached_snapshot?.library_id === target.libraryId &&
    settings.cached_snapshot.sync_mode === "HOST" ? settings.cached_snapshot : null;
  const hostVersion = checked
    ? normalizeReportedAppVersion(validation?.app_version)
    : normalizeReportedAppVersion(cached?.app_version);
  const hostSource = checked && hostVersion ? "checked" : !checked && hostVersion ? "cached" : "unknown";
  return {
    latest,
    local: { version: localVersion, relation: relation(localVersion, latest) },
    host: {
      name: (checked ? validation?.device_name?.trim() : null) || settings?.host_device_name?.trim() || cached?.device_name?.trim() || null,
      version: hostVersion,
      checked,
      source: hostSource,
      // A saved older version is evidence about that snapshot, not an assertion
      // that the Host still needs an update right now.
      relation: relation(hostVersion, hostSource === "checked" ? latest : null),
    },
  };
}
