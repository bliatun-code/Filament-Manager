import assert from "node:assert/strict";
import test from "node:test";
import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";

import { latestReleaseUrl } from "./app_metadata";
import {
  appUpdateCheckMessage,
  shouldShowReleaseAction,
  trustedReleaseUrl,
  type AppUpdateCheckState,
} from "./app_update_check";
import type { AppUpdateCheckResult } from "./tauri_maintenance_client";

function result(
  status: AppUpdateCheckResult["status"],
  releaseUrl = latestReleaseUrl(),
): AppUpdateCheckResult {
  return {
    current_version: "0.21.2",
    latest_tag: "v0.22.0",
    latest_version: "0.22.0",
    release_url: releaseUrl,
    status,
    update_channel: status === "UPDATE_CHANNEL_DISABLED" ? "DISABLED" : "PUBLIC_METADATA",
  };
}

test("release action is shown only for a newer published version", () => {
  assert.equal(
    shouldShowReleaseAction({ status: "SUCCESS", result: result("UPDATE_AVAILABLE") }),
    true,
  );
  assert.equal(
    shouldShowReleaseAction({ status: "SUCCESS", result: result("UP_TO_DATE") }),
    false,
  );
  assert.equal(
    shouldShowReleaseAction({
      status: "SUCCESS",
      result: {
        ...result("RELEASE_INFO_UNAVAILABLE"),
        latest_tag: null,
        latest_version: null,
      },
    }),
    false,
  );
  assert.equal(
    shouldShowReleaseAction({
      status: "SUCCESS",
      result: {
        ...result("UPDATE_CHANNEL_DISABLED"),
        latest_tag: null,
        latest_version: null,
      },
    }),
    false,
  );
  assert.equal(shouldShowReleaseAction({ status: "IDLE" }), false);
});

test("release action is pinned to the repository release page", () => {
  const untrusted = result("UPDATE_AVAILABLE", "https://example.invalid/release");
  assert.equal(trustedReleaseUrl(untrusted), latestReleaseUrl());
});

test("all update-check states remain explicit", () => {
  const states: AppUpdateCheckState[] = [
    { status: "IDLE" },
    { status: "CHECKING" },
    { status: "SUCCESS", result: result("DEVELOPMENT_BUILD") },
    { status: "ERROR" },
  ];
  assert.deepEqual(states.map((state) => state.status), [
    "IDLE",
    "CHECKING",
    "SUCCESS",
    "ERROR",
  ]);
});

test("update-check messages cover errors and every successful result", () => {
  const t = (
    _key: string,
    fallback: string,
    params?: MessageParams,
  ) => fallback.replace("{version}", String(params?.version ?? ""));

  assert.equal(appUpdateCheckMessage({ status: "IDLE" }, t), null);
  assert.equal(appUpdateCheckMessage({ status: "CHECKING" }, t), null);
  assert.equal(
    appUpdateCheckMessage({ status: "ERROR" }, t),
    "Could not check for updates. Try again later.",
  );
  assert.equal(
    appUpdateCheckMessage(
      {
        status: "SUCCESS",
        result: {
          ...result("RELEASE_INFO_UNAVAILABLE"),
          latest_tag: null,
          latest_version: null,
        },
      },
      t,
    ),
    "Release information is not available right now. Try again later.",
  );
  assert.equal(
    appUpdateCheckMessage(
      {
        status: "SUCCESS",
        result: {
          ...result("UPDATE_CHANNEL_DISABLED"),
          latest_tag: null,
          latest_version: null,
        },
      },
      t,
    ),
    "This build has no public update channel. Check the source where you downloaded the app for newer releases.",
  );
  assert.equal(
    appUpdateCheckMessage({ status: "SUCCESS", result: result("UPDATE_AVAILABLE") }, t),
    "Version 0.22.0 is available.",
  );
  assert.equal(
    appUpdateCheckMessage({ status: "SUCCESS", result: result("UP_TO_DATE") }, t),
    "Version 0.22.0 is the latest published release.",
  );
  assert.equal(
    appUpdateCheckMessage({ status: "SUCCESS", result: result("DEVELOPMENT_BUILD") }, t),
    "This build is newer than the latest published release (0.22.0).",
  );
});
