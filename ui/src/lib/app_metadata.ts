export const APP_LICENSE_ID = "AGPL-3.0-or-later";
export const APP_LICENSE_NAME = "GNU Affero General Public License v3.0 or later";
export const APP_REPOSITORY_URL = "https://github.com/bliatun-code/Filament-Manager";

type AppVersionUrlBuilder = (appVersion: string | null | undefined) => string;

export const sourceUrlForAppVersion: AppVersionUrlBuilder = () =>
  `${APP_REPOSITORY_URL}/tree/main`;

export const licenseUrlForAppVersion: AppVersionUrlBuilder = () => {
  // Legal documents were added after earlier release tags, so keep these links stable.
  return `${APP_REPOSITORY_URL}/blob/main/LICENSE`;
};

export const noticeUrlForAppVersion: AppVersionUrlBuilder = () => {
  // Legal documents were added after earlier release tags, so keep these links stable.
  return `${APP_REPOSITORY_URL}/blob/main/NOTICE.md`;
};

export function screenshotTourUrl(): string {
  return `${APP_REPOSITORY_URL}/blob/main/docs/SCREENSHOTS.md`;
}

export function userGuideUrlForLocale(locale: "en" | "nb"): string {
  const fileName = locale === "nb" ? "BRUKERVEILEDNING.md" : "USER_GUIDE.md";
  return `${APP_REPOSITORY_URL}/blob/main/docs/${fileName}`;
}
