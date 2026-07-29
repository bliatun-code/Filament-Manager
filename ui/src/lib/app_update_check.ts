import { latestReleaseUrl } from "./app_metadata";
import type { AppUpdateCheckResult } from "./tauri_maintenance_client";
import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";

export type AppUpdateCheckState =
  | { status: "IDLE" }
  | { status: "CHECKING" }
  | { result: AppUpdateCheckResult; status: "SUCCESS" }
  | { status: "ERROR" };

type TranslateFn = (key: string, fallback: string, params?: MessageParams) => string;

export function appUpdateCheckMessage(
  state: AppUpdateCheckState,
  t: TranslateFn,
): string | null {
  if (state.status === "ERROR") {
    return t(
      "settings.updateCheckFailed",
      "Could not check for updates. Try again later.",
    );
  }
  if (state.status !== "SUCCESS") {
    return null;
  }
  const { status } = state.result;
  if (status === "UPDATE_CHANNEL_DISABLED") {
    return t(
      "settings.updateChannelDisabled",
      "This build has no public update channel. Check the source where you downloaded the app for newer releases.",
    );
  }
  if (status === "RELEASE_INFO_UNAVAILABLE") {
    return t(
      "settings.updateInfoUnavailable",
      "Release information is not available right now. Try again later.",
    );
  }
  const version = state.result.latest_version ?? state.result.current_version;
  if (status === "UPDATE_AVAILABLE") {
    return t("settings.updateAvailable", "Version {version} is available.", {
      version,
    });
  }
  if (status === "DEVELOPMENT_BUILD") {
    return t(
      "settings.updateDevelopmentBuild",
      "This build is newer than the latest published release ({version}).",
      { version },
    );
  }
  return t(
    "settings.updateUpToDate",
    "Version {version} is the latest published release.",
    { version },
  );
}

export function trustedReleaseUrl(result: AppUpdateCheckResult): string {
  const expected = latestReleaseUrl();
  return result.release_url === expected ? result.release_url : expected;
}

export function shouldShowReleaseAction(state: AppUpdateCheckState): boolean {
  return state.status === "SUCCESS" && state.result.status === "UPDATE_AVAILABLE";
}
