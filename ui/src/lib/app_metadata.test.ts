import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_LICENSE_ID,
  APP_REPOSITORY_URL,
  licenseUrlForAppVersion,
  noticeUrlForAppVersion,
  screenshotTourUrl,
  sourceUrlForAppVersion,
  latestReleaseUrl,
  userGuideUrlForLocale,
} from "./app_metadata";

test("app metadata pins source and help links to the installed stable app version", () => {
  assert.equal(APP_LICENSE_ID, "AGPL-3.0-or-later");
  for (const version of ["0.31.0", "0.32.0", "0.32.1"]) {
    assert.equal(sourceUrlForAppVersion(version), `${APP_REPOSITORY_URL}/tree/v${version}`);
    assert.equal(screenshotTourUrl(version), `${APP_REPOSITORY_URL}/blob/v${version}/docs/SCREENSHOTS.md`);
    assert.equal(userGuideUrlForLocale("en", version), `${APP_REPOSITORY_URL}/blob/v${version}/docs/USER_GUIDE.md`);
    assert.equal(userGuideUrlForLocale("nb", version), `${APP_REPOSITORY_URL}/blob/v${version}/docs/BRUKERVEILEDNING.md`);
  }
  assert.equal(sourceUrlForAppVersion(" v0.32.1 "), `${APP_REPOSITORY_URL}/tree/v0.32.1`);
  assert.equal(screenshotTourUrl("v0.32.1"), `${APP_REPOSITORY_URL}/blob/v0.32.1/docs/SCREENSHOTS.md`);
  assert.equal(userGuideUrlForLocale("nb", "v0.32.1"), `${APP_REPOSITORY_URL}/blob/v0.32.1/docs/BRUKERVEILEDNING.md`);
});

test("unidentified, malformed and development versions never drift to main-branch help", () => {
  for (const version of [
    null,
    undefined,
    "",
    " ",
    "0.0.0",
    "v0.0.0",
    "0.32.1-dev",
    "0.32.1-rc.1",
    "0.32.1+local",
    "v0.32.1-beta.1",
    "main",
    "0.32",
    "00.32.1",
    "0.032.1",
    "0.32.01",
    "0.32.1/../../main",
    "0.32.1?ref=main",
    "https://example.invalid/0.32.1",
    "0.32.9007199254740992",
  ]) {
    assert.equal(sourceUrlForAppVersion(version), null, String(version));
    assert.equal(screenshotTourUrl(version), null, String(version));
    assert.equal(userGuideUrlForLocale("nb", version), null, String(version));
  }
});

test("legal documents intentionally retain main compatibility for historic releases", () => {
  assert.equal(
    licenseUrlForAppVersion("v0.16.0"),
    `${APP_REPOSITORY_URL}/blob/main/LICENSE`,
  );
  assert.equal(
    noticeUrlForAppVersion("0.16.0"),
    `${APP_REPOSITORY_URL}/blob/main/NOTICE.md`,
  );
});

test("locales without a translated guide retain the version-pinned English manual", () => {
  for (const locale of ["de", "fr", "es", "fi-FI"]) {
    assert.equal(userGuideUrlForLocale(locale, "0.32.1"), `${APP_REPOSITORY_URL}/blob/v0.32.1/docs/USER_GUIDE.md`);
  }
});

test("latest release link stays on the repository", () => {
  assert.equal(latestReleaseUrl(), `${APP_REPOSITORY_URL}/releases/latest`);
});
