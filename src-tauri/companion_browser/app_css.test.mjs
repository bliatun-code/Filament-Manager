import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("loaded printer slot cards keep their swatch surface treatment", () => {
  const css = fs.readFileSync(new URL("./app.css", import.meta.url), "utf8");

  assert.match(css, /\.slot-card\.swatch-surface\s*\{/);
  assert.match(css, /rgb\(var\(--swatch-rgb\) \/ calc\(var\(--swatch-surface-top\) \+ 0\.02\)\)/);
});

test("phone CSS keeps root headers secondary, task sheets scrollable, and modal close chrome quiet", () => {
  const css = fs.readFileSync(new URL("./app.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.workflow-header\s*\{\s*display: none;/);
  assert.match(css, /\.add-spool-catalog-list,\s*\.add-spool-wishlist-list\s*\{[\s\S]*overflow: auto;/);
  assert.match(css, /\.add-spool-section \.segmented-control\s*\{\s*width: 100%;/);
  assert.match(css, /\.task-sheet-body\s*\{[\s\S]*overflow: auto;/);
  assert.match(css, /\.task-sheet\s*\{[\s\S]*height: 100%;/);
  assert.match(css, /\.printer-picker-sheet\s*\{[\s\S]*grid-template-rows: auto auto minmax\(0, 1fr\);[\s\S]*height: 100%;/);
  assert.match(css, /\.printer-spool-picker-list\s*\{[\s\S]*height: 100%;[\s\S]*max-height: none;/);
  assert.match(css, /\.printer-picker-row\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*align-items: end;/);
  assert.match(css, /\.printer-picker-row \.dense-list-side\s*\{[\s\S]*justify-items: end;[\s\S]*text-align: right;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.storage-shell \.dense-list-row\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*align-items: start;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.storage-shell \.dense-list-side\s*\{[\s\S]*justify-items: end;[\s\S]*text-align: right;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.task-sheet-shell\s*\{[\s\S]*height: calc\(100dvh - max\(1rem, env\(safe-area-inset-top\)\) - max\(1rem, env\(safe-area-inset-bottom\)\)\);/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.task-sheet-backdrop\s*\{[\s\S]*align-items: start;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.printer-roster\s*\{[\s\S]*overflow: hidden;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.printer-roster > \.stack\s*\{[\s\S]*display: grid;[\s\S]*grid-template-columns: 1fr;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.task-sheet-header\s*\{[\s\S]*position: sticky;[\s\S]*border-bottom: 1px solid/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.printer-picker-sheet \.search-input\s*\{[\s\S]*min-height: 2\.72rem;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.task-sheet \.search-input:focus-visible\s*\{[\s\S]*outline: none;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.detail-modal-backdrop\s*\{[\s\S]*align-items: start;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.detail-modal-shell\s*\{[\s\S]*height: calc\(100dvh - max\(1rem, env\(safe-area-inset-top\)\) - max\(1rem, env\(safe-area-inset-bottom\)\)\);/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.detail-modal-actions > \.compact-back-button\s*\{\s*width: auto;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*:root\[data-theme-mode="light"\] \.phone-bottom-nav\s*\{[\s\S]*background: rgba\(248, 251, 255, 0\.98\);/);
  assert.match(css, /@media \(max-width: 767px\) and \(prefers-color-scheme: light\)[\s\S]*:root\[data-theme-mode="auto"\] \.swatch-surface\s*\{[\s\S]*--swatch-surface-top: 0\.085;/);
});
