import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageDataFallbackBanner } from "./page_data_fallback_banner";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("fallback feedback keeps one warning and an in-place retry action", () => {
  const html = renderToStaticMarkup(
    <PageDataFallbackBanner
      message="Host unavailable. Showing cached data."
      onRetry={() => {}}
      retryLabel="Refresh"
      retrying={false}
    />,
  );

  assert.match(html, /role="status"/);
  assert.match(html, /Host unavailable\. Showing cached data\./);
  assert.match(html, /<button[^>]*>Refresh<\/button>/);
  assert.doesNotMatch(html, /role="alert"/);
});

test("fallback retry is disabled while a refresh is running", () => {
  const html = renderToStaticMarkup(
    <PageDataFallbackBanner
      message="Host unavailable."
      onRetry={() => {}}
      retryLabel="Refresh"
      retrying
    />,
  );

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled/);
});
