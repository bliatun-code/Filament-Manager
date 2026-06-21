export const APP_LICENSE_ID = "AGPL-3.0-or-later";
export const APP_LICENSE_NAME = "GNU Affero General Public License v3.0 or later";
export const APP_REPOSITORY_URL = "https://github.com/bliatun-code/Filament-Manager";

function releaseRefForVersion(appVersion: string | null | undefined): string | null {
  const normalized = String(appVersion ?? "").trim().replace(/^v/i, "");
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized) ? `v${normalized}` : null;
}

export function sourceUrlForAppVersion(appVersion: string | null | undefined): string {
  const releaseRef = releaseRefForVersion(appVersion);
  return releaseRef ? `${APP_REPOSITORY_URL}/tree/${releaseRef}` : APP_REPOSITORY_URL;
}

type AppVersionUrlBuilder = (appVersion: string | null | undefined) => string;

export const licenseUrlForAppVersion: AppVersionUrlBuilder = () => {
  // Legal documents were added after earlier release tags, so keep these links stable.
  return `${APP_REPOSITORY_URL}/blob/main/LICENSE`;
};

export const noticeUrlForAppVersion: AppVersionUrlBuilder = () => {
  // Legal documents were added after earlier release tags, so keep these links stable.
  return `${APP_REPOSITORY_URL}/blob/main/NOTICE.md`;
};
