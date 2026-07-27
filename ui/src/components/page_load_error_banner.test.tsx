import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageLoadErrorBanner } from "./page_load_error_banner";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("page load recovery only renders as an accessible error action", () => {
  const html = renderToStaticMarkup(
    <PageLoadErrorBanner
      message="Failed to load data."
      onRetry={() => undefined}
      retryLabel="Refresh"
      retrying
    />,
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /Failed to load data\./);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /title="Refresh"/);
  assert.match(html, />Refresh<\/button>/);
});
