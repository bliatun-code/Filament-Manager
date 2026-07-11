import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_LICENSE_ID,
  APP_REPOSITORY_URL,
  licenseUrlForAppVersion,
  noticeUrlForAppVersion,
  screenshotTourUrl,
  sourceUrlForAppVersion,
  userGuideUrlForLocale,
} from "./app_metadata";

test("app metadata exposes AGPL licensing and stable main-branch source links", () => {
  assert.equal(APP_LICENSE_ID, "AGPL-3.0-or-later");
  assert.equal(sourceUrlForAppVersion("0.16.0"), `${APP_REPOSITORY_URL}/tree/main`);
  assert.equal(sourceUrlForAppVersion("0.20.1"), `${APP_REPOSITORY_URL}/tree/main`);
  assert.equal(sourceUrlForAppVersion(null), `${APP_REPOSITORY_URL}/tree/main`);
  assert.equal(
    licenseUrlForAppVersion("v0.16.0"),
    `${APP_REPOSITORY_URL}/blob/main/LICENSE`,
  );
  assert.equal(
    noticeUrlForAppVersion("0.16.0"),
    `${APP_REPOSITORY_URL}/blob/main/NOTICE.md`,
  );
  assert.equal(screenshotTourUrl(), `${APP_REPOSITORY_URL}/blob/main/docs/SCREENSHOTS.md`);
  assert.equal(userGuideUrlForLocale("en"), `${APP_REPOSITORY_URL}/blob/main/docs/USER_GUIDE.md`);
  assert.equal(
    userGuideUrlForLocale("nb"),
    `${APP_REPOSITORY_URL}/blob/main/docs/BRUKERVEILEDNING.md`,
  );
  assert.equal(
    userGuideUrlForLocale("de"),
    `${APP_REPOSITORY_URL}/blob/main/docs/USER_GUIDE.md`,
  );
  assert.equal(
    userGuideUrlForLocale("fr"),
    `${APP_REPOSITORY_URL}/blob/main/docs/USER_GUIDE.md`,
  );
});
