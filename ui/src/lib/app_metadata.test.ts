import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_LICENSE_ID,
  APP_REPOSITORY_URL,
  licenseUrlForAppVersion,
  noticeUrlForAppVersion,
  sourceUrlForAppVersion,
} from "./app_metadata";

test("app metadata exposes AGPL licensing and source links", () => {
  assert.equal(APP_LICENSE_ID, "AGPL-3.0-or-later");
  assert.equal(
    sourceUrlForAppVersion("0.16.0"),
    `${APP_REPOSITORY_URL}/tree/v0.16.0`,
  );
  assert.equal(
    licenseUrlForAppVersion("v0.16.0"),
    `${APP_REPOSITORY_URL}/blob/main/LICENSE`,
  );
  assert.equal(
    noticeUrlForAppVersion("0.16.0"),
    `${APP_REPOSITORY_URL}/blob/main/NOTICE.md`,
  );
});
