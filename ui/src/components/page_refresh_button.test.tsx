import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageRefreshButton } from "./page_refresh_button";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("page refresh action uses one accessible disabled state while refreshing", () => {
  const html = renderToStaticMarkup(
    <PageRefreshButton
      label="Refresh"
      onRefresh={() => undefined}
      refreshing
    />,
  );

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /title="Refresh"/);
  assert.match(html, />Refresh<\/button>/);
});
