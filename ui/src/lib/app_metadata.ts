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

export function licenseUrlForAppVersion(appVersion: string | null | undefined): string {
  const releaseRef = releaseRefForVersion(appVersion);
  return `${APP_REPOSITORY_URL}/blob/${releaseRef ?? "main"}/LICENSE`;
}

export function noticeUrlForAppVersion(appVersion: string | null | undefined): string {
  const releaseRef = releaseRefForVersion(appVersion);
  return `${APP_REPOSITORY_URL}/blob/${releaseRef ?? "main"}/NOTICE.md`;
}
