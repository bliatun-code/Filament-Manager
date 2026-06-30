import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function readCssBundle(fileName = "./app.css", seen = new Set()) {
  const fileUrl = new URL(fileName, import.meta.url);
  const filePath = fileUrl.pathname;
  if (seen.has(filePath)) {
    return "";
  }
  seen.add(filePath);

  const css = fs.readFileSync(fileUrl, "utf8");
  return css.replace(/@import url\("\/companion\/([^"]+)"\);/g, (_match, importedFile) => {
    return readCssBundle(`./${importedFile}`, seen);
  });
}

test("loaded printer slot cards keep their swatch surface treatment", () => {
  const css = readCssBundle();

  assert.match(css, /\.slot-card\.swatch-surface\s*\{/);
  assert.match(css, /rgb\(var\(--swatch-rgb\) \/ calc\(var\(--swatch-surface-top\) \+ 0\.02\)\)/);
});

test("companion shell defines reusable status and panel surface tokens", () => {
  const css = readCssBundle();

  assert.match(css, /--surface-panel: rgba\(255, 255, 255, 0\.96\);/);
  assert.match(css, /--surface-panel: rgba\(17, 28, 45, 0\.9\);/);
  assert.match(css, /--muted: #33485f;/);
  assert.match(css, /--muted: #b4c1cf;/);
  assert.match(css, /--warning: #9b681d;/);
  assert.match(css, /--info: #9cc8f2;/);
  assert.match(css, /--focus-ring: rgba\(23, 50, 77, 0\.72\);/);
  assert.match(css, /--focus-ring: rgba\(156, 200, 242, 0\.84\);/);
  assert.match(css, /--control-radius: 8px;/);
  assert.match(css, /--segmented-item-radius: 6px;/);
  assert.match(css, /--success-soft: rgba\(47, 111, 79, 0\.11\);/);
  assert.match(css, /--danger-soft: rgba\(155, 62, 62, 0\.1\);/);
  assert.match(css, /\.inline-signal\[data-tone="warning"\]\s*\{[\s\S]*color: var\(--warning\);/);
  assert.match(css, /\.printer-live-strip\s*\{[\s\S]*color: var\(--muted\);/);
  assert.match(css, /\.task-sheet\.add-filament-sheet \.task-sheet-header\s*\{[\s\S]*var\(--surface-panel\)/);
});

test("companion controls use shared focus and radius primitives", () => {
  const css = readCssBundle();

  assert.match(css, /a:focus-visible,\s*button:focus-visible,\s*input:focus-visible,\s*select:focus-visible,\s*textarea:focus-visible\s*\{[\s\S]*outline: 2px solid var\(--focus-ring\);[\s\S]*box-shadow: 0 0 0 4px var\(--focus-ring-shadow\);/);
  assert.match(css, /\.primary-button,\s*\.secondary-button,\s*\.ghost-button\s*\{[\s\S]*border-radius: var\(--control-radius\);/);
  assert.match(css, /\.search-input,\s*\.token-input,\s*\.weight-input,\s*\.text-input,\s*\.detail-textarea\s*\{[\s\S]*border-radius: var\(--control-radius\);/);
  assert.match(css, /\.root-flow-button,\s*\.segment-button\s*\{[\s\S]*border-radius: var\(--segmented-item-radius\);/);
  assert.match(css, /\.phone-nav-button\s*\{[\s\S]*border-radius: var\(--segmented-item-radius\);/);
});

test("topbar status messages render as compact tonal banners", () => {
  const css = readCssBundle();

  assert.match(css, /\.app-status-line\s*\{[\s\S]*display: inline-flex;[\s\S]*width: fit-content;/);
  assert.match(css, /\.app-status-line\[data-tone="success"\]\s*\{[\s\S]*background: var\(--success-soft\);/);
  assert.match(css, /\.app-status-line\[data-tone="error"\]\s*\{[\s\S]*background: var\(--danger-soft\);/);
  assert.match(css, /\.detail-feedback-success\s*\{[\s\S]*background: var\(--success-soft\);/);
});

test("phone CSS keeps root headers secondary, task sheets scrollable, and modal close chrome quiet", () => {
  const css = readCssBundle();

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
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.task-sheet \.search-input:focus-visible\s*\{[\s\S]*outline: 2px solid var\(--focus-ring\);[\s\S]*box-shadow:[\s\S]*var\(--focus-ring-shadow\)/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.detail-modal-backdrop\s*\{[\s\S]*align-items: start;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.detail-modal-shell\s*\{[\s\S]*height: calc\(100dvh - max\(1rem, env\(safe-area-inset-top\)\) - max\(1rem, env\(safe-area-inset-bottom\)\)\);/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.detail-modal-actions > \.compact-back-button\s*\{\s*width: auto;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*:root\[data-theme-mode="light"\] \.phone-bottom-nav\s*\{[\s\S]*background: rgba\(248, 251, 255, 0\.98\);/);
  assert.match(css, /@media \(max-width: 767px\) and \(prefers-color-scheme: light\)[\s\S]*:root\[data-theme-mode="auto"\] \.swatch-surface\s*\{[\s\S]*--swatch-surface-top: 0\.24;/);
  assert.match(css, /:root\[data-theme-mode="light"\] \.list-row\.swatch-surface[\s\S]*inset 3px 0 0 rgb\(var\(--swatch-rgb\) \/ 0\.56\)/);
  assert.match(css, /:root\[data-theme-mode="light"\] \.printer-board\.printer-brand-surface[\s\S]*inset 3px 0 0 rgb\(var\(--brand-rgb\) \/ 0\.5\)/);
});
