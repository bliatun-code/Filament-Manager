import { guidePathForLocale } from "../../../src-tauri/companion_browser/supported_locales.js";
import type { Locale } from "./i18n_types";

export const APP_LICENSE_ID = "AGPL-3.0-or-later";
export const APP_LICENSE_NAME = "GNU Affero General Public License v3.0 or later";
export const APP_REPOSITORY_URL = "https://github.com/bliatun-code/Filament-Manager";

type AppVersionUrlBuilder = (appVersion: string | null | undefined) => string;

function releasedAppTag(appVersion: string | null | undefined): string | null {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(
    appVersion?.trim() ?? "",
  );
  if (!match || !match.slice(1).every((part) => Number.isSafeInteger(Number(part)))) {
    return null;
  }
  // A development/unknown version must not silently open newer main-branch help.
  if (match.slice(1).every((part) => part === "0")) return null;
  return `v${match.slice(1).join(".")}`;
}

export function sourceUrlForAppVersion(appVersion: string | null | undefined): string | null {
  const tag = releasedAppTag(appVersion);
  return tag ? `${APP_REPOSITORY_URL}/tree/${tag}` : null;
}

export const licenseUrlForAppVersion: AppVersionUrlBuilder = () => {
  // Legal documents were added after earlier release tags, so keep these links stable.
  return `${APP_REPOSITORY_URL}/blob/main/LICENSE`;
};

export const noticeUrlForAppVersion: AppVersionUrlBuilder = () => {
  // Legal documents were added after earlier release tags, so keep these links stable.
  return `${APP_REPOSITORY_URL}/blob/main/NOTICE.md`;
};

export function screenshotTourUrl(appVersion: string | null | undefined): string | null {
  const tag = releasedAppTag(appVersion);
  return tag ? `${APP_REPOSITORY_URL}/blob/${tag}/docs/SCREENSHOTS.md` : null;
}

export function latestReleaseUrl(): string {
  return `${APP_REPOSITORY_URL}/releases/latest`;
}

export function userGuideUrlForLocale(
  locale: Locale,
  appVersion: string | null | undefined,
): string | null {
  const tag = releasedAppTag(appVersion);
  return tag ? `${APP_REPOSITORY_URL}/blob/${tag}/${guidePathForLocale(locale)}` : null;
}
