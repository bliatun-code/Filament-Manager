import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppUpdateBanner } from "./app_update_banner";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("update banner announces the available version without installing it", () => {
  const html = renderToStaticMarkup(
    React.createElement(AppUpdateBanner, {
      onDismiss: () => {},
      onViewRelease: () => {},
      result: {
        current_version: "0.22.1",
        latest_tag: "v0.22.2",
        latest_version: "0.22.2",
        release_url:
          "https://github.com/bliatun-code/Filament-Manager/releases/latest",
        status: "UPDATE_AVAILABLE",
        update_channel: "PUBLIC_METADATA",
      },
      t: (_key, fallback, params) =>
        fallback.replace("{version}", String(params?.version ?? "")),
    }),
  );

  assert.match(html, /aria-label="Updates"/);
  assert.match(html, /role="status"/);
  assert.match(html, /Version 0\.22\.2 is available\./);
  assert.match(html, />View release</);
  assert.match(html, />Later</);
  assert.doesNotMatch(html, /Install|Download/);
});
