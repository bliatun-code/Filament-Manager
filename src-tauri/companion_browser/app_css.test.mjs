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

function relativeLuminance([red, green, blue]) {
  const channels = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function hexToRgb(hex) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

test("loaded printer slot cards keep their swatch surface treatment", () => {
  const css = readCssBundle();

  assert.match(css, /\.swatch-card-surface\.swatch-surface\s*\{/);
  assert.match(css, /rgb\(var\(--swatch-rgb\) \/ calc\(var\(--swatch-surface-top\) \+ 0\.02\)\)/);
  assert.match(css, /\.slot-card\.swatch-card-surface\s*\{[\s\S]*--swatch-card-border-boost: 0\.06;/);
});

test("swatch filament rows keep the bright hover outline", () => {
  const css = readCssBundle();

  assert.match(css, /\.list-row\.swatch-surface:hover,\s*\.swatch-card-surface\.swatch-surface:hover\s*\{/);
  assert.match(css, /0 0 0 1px rgba\(248, 250, 252, 0\.38\)/);
  assert.match(
    css,
    /:root\[data-theme-mode="light"\] \.list-row\.swatch-surface:hover,[\s\S]*\.swatch-card-surface\.swatch-surface:hover[\s\S]*0 0 0 1px rgba\(255, 255, 255, 0\.96\)/,
  );
});

test("light swatches keep neutral edges while dark swatches preserve their existing treatment", () => {
  const css = readCssBundle();

  assert.match(
    css,
    /:root\s*\{[^}]*--swatch-dot-border: var\(--border-strong\);[^}]*--swatch-surface-outline: var\(--border\);/,
  );
  assert.match(
    css,
    /:root\[data-theme-mode="dark"\]\s*\{[^}]*--swatch-dot-border: rgba\(255, 255, 255, 0\.65\);[^}]*--swatch-surface-outline: transparent;/,
  );
  assert.match(
    css,
    /@media \(prefers-color-scheme: dark\)[\s\S]*:root\[data-theme-mode="auto"\]\s*\{[^}]*--swatch-dot-border: rgba\(255, 255, 255, 0\.65\);[^}]*--swatch-surface-outline: transparent;/,
  );
  assert.match(css, /\.swatch-surface\s*\{[\s\S]*outline: 1px solid var\(--swatch-surface-outline\);/);
  assert.match(css, /\.swatch-dot\s*\{[\s\S]*border: 1px solid var\(--swatch-dot-border\);/);
});

test("swatch action buttons reuse the selected filament color", () => {
  const css = readCssBundle();

  assert.match(css, /\.primary-button\.swatch-action-button,\s*\.secondary-button\.swatch-action-button\s*\{/);
  assert.match(css, /var\(--swatch-action-start\) 0%/);
  assert.match(css, /var\(--swatch-action-end\) 100%/);
  assert.match(css, /border-color: var\(--swatch-action-border\);/);
  assert.match(css, /color: var\(--swatch-action-contrast\);/);
  assert.match(css, /0 18px 36px -24px rgb\(var\(--swatch-action-shadow-rgb\) \/ 0\.74\)/);
  assert.match(
    css,
    /\.primary-button\.swatch-action-button:hover,\s*\.secondary-button\.swatch-action-button:hover\s*\{\s*opacity: 1;/,
  );
  assert.match(css, /\.companion-selection-card\s*\{[\s\S]*display: grid;[\s\S]*gap: 0\.72rem;/);
  assert.match(css, /\.companion-selection-card-head\s*\{[\s\S]*display: flex;[\s\S]*justify-content: space-between;/);
  assert.match(css, /\.loan-create-card,\s*\.loan-return-card\s*\{[\s\S]*display: grid;[\s\S]*gap: 0\.72rem;/);
  assert.match(css, /\.compact-loan-metadata \.loan-date-metric\s*\{[\s\S]*grid-column: 1 \/ -1;/);
  assert.doesNotMatch(css, /add-spool-selection-head/);
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
  assert.match(css, /\.filter-chip-button\s*\{[\s\S]*border-radius: 999px;/);
  assert.match(css, /\.filter-chip-button\[data-active="true"\]\s*\{[\s\S]*background: var\(--accent-soft\);/);
  assert.match(css, /\.phone-nav-button\s*\{[\s\S]*border-radius: var\(--segmented-item-radius\);/);
});

test("search fields keep a permanent visible label above the input", () => {
  const css = readCssBundle();

  assert.match(
    css,
    /\.search-field\s*\{[^}]*display: grid;[^}]*gap: 0\.38rem;[^}]*min-width: 0;/,
  );
  assert.match(
    css,
    /\.search-field-label\s*\{[^}]*color: var\(--text-muted\);[^}]*font-size: 0\.78rem;[^}]*font-weight: 700;/,
  );
});

test("light form controls use an opaque three-to-one border without changing dark mode", () => {
  const css = readCssBundle();
  const tokenMatch = css.match(/:root\s*\{[^}]*--form-control-border:\s*(#[0-9a-f]{6});/i);

  assert.ok(tokenMatch, "expected an opaque light form-control border token");
  const border = hexToRgb(tokenMatch[1]);
  const supportedLightSurfaces = [
    [255, 255, 255],
    [219, 233, 248],
  ];
  for (const surface of supportedLightSurfaces) {
    assert.ok(
      contrastRatio(border, surface) >= 3,
      `expected ${tokenMatch[1]} to keep at least 3:1 contrast against rgb(${surface.join(" ")})`,
    );
  }

  assert.match(
    css,
    /\.search-input,\s*\.token-input,\s*\.weight-input,\s*\.text-input,\s*\.detail-textarea\s*\{[^}]*border: 1px solid var\(--form-control-border\);/,
  );
  assert.match(css, /\.swatch-input\s*\{[^}]*border: 1px solid var\(--form-control-border\);/);
  assert.match(
    css,
    /:root\[data-theme-mode="light"\] \.search-input,[\s\S]*:root\[data-theme-mode="light"\] \.swatch-input\s*\{[^}]*border-color: var\(--form-control-border\);/,
  );
  assert.match(
    css,
    /@media \(prefers-color-scheme: light\)[\s\S]*:root\[data-theme-mode="auto"\] \.swatch-input\s*\{[^}]*border-color: var\(--form-control-border\);/,
  );
  assert.match(
    css,
    /:root\[data-theme-mode="light"\] \.root-flow-button,\s*:root\[data-theme-mode="light"\] \.section-tab\s*\{[^}]*border-color: rgba\(78, 98, 122, 0\.34\);/,
  );
  assert.match(
    css,
    /:root\[data-theme-mode="auto"\] \.root-flow-button,\s*:root\[data-theme-mode="auto"\] \.section-tab\s*\{[^}]*border-color: rgba\(78, 98, 122, 0\.34\);/,
  );
  assert.match(
    css,
    /:root\[data-theme-mode="dark"\]\s*\{[^}]*--form-control-border: var\(--border\);/,
  );
  assert.match(
    css,
    /@media \(prefers-color-scheme: dark\)[\s\S]*:root\[data-theme-mode="auto"\]\s*\{[^}]*--form-control-border: var\(--border\);/,
  );
});

test("settings theme descriptions wrap without changing shared segmented metadata", () => {
  const css = readCssBundle();

  assert.match(
    css,
    /\.root-flow-meta,\s*\.segment-meta\s*\{[\s\S]*white-space: nowrap;[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;/,
  );
  assert.match(
    css,
    /\.settings-theme-control \.segment-meta\s*\{\s*white-space: normal;\s*overflow: visible;\s*text-overflow: clip;\s*line-height: 1\.25;\s*\}/,
  );
});

test("settings cards keep their content aligned to the top of shared grid rows", () => {
  const css = readCssBundle();

  assert.match(
    css,
    /\.settings-card\s*\{\s*display: grid;\s*gap: var\(--content-card-gap\);\s*align-content: start;\s*\}/,
  );
});

test("topbar status messages render as compact tonal banners", () => {
  const css = readCssBundle();

  assert.match(css, /\.app-status-line\s*\{[\s\S]*display: inline-flex;[\s\S]*width: fit-content;/);
  assert.match(css, /\.app-status-line\[data-tone="success"\]\s*\{[\s\S]*background: var\(--success-soft\);/);
  assert.match(css, /\.app-status-line\[data-tone="error"\]\s*\{[\s\S]*background: var\(--danger-soft\);/);
  assert.match(css, /\.detail-feedback-success\s*\{[\s\S]*background: var\(--success-soft\);/);
});

test("tablet and desktop compact overlays size to content while wide add-spool and phone stay viewport-bound", () => {
  const css = readCssBundle();

  assert.match(
    css,
    /@media \(min-width: 768px\)\s*\{\s*\.task-sheet-backdrop\[data-layout="tablet"\] \.task-sheet-shell:not\(\.task-sheet-shell-wide\),\s*\.task-sheet-backdrop\[data-layout="desktop"\] \.task-sheet-shell:not\(\.task-sheet-shell-wide\),\s*\.detail-modal-backdrop\[data-layout="tablet"\] \.detail-modal-shell,\s*\.detail-modal-backdrop\[data-layout="desktop"\] \.detail-modal-shell\s*\{[^}]*height: auto;[^}]*max-height: calc\(100dvh - 1\.8rem\);/,
  );
  assert.match(
    css,
    /\.task-sheet-backdrop\[data-layout="tablet"\] \.task-sheet-shell:not\(\.task-sheet-shell-wide\) > \.task-sheet,\s*\.task-sheet-backdrop\[data-layout="desktop"\] \.task-sheet-shell:not\(\.task-sheet-shell-wide\) > \.task-sheet,\s*\.detail-modal-backdrop\[data-layout="tablet"\] \.detail-modal\.detail-panel,\s*\.detail-modal-backdrop\[data-layout="desktop"\] \.detail-modal\.detail-panel\s*\{[^}]*height: auto;[^}]*max-height: calc\(100dvh - 1\.8rem\);/,
  );
  assert.match(
    css,
    /\.task-sheet-shell\s*\{[^}]*height: calc\(100dvh - 1\.8rem\);[^}]*max-height: calc\(100dvh - 1\.8rem\);/,
  );
  assert.match(css, /\.task-sheet-body\s*\{[^}]*overflow: auto;/);
  assert.match(css, /\.detail-modal-body\s*\{[^}]*overflow-y: auto;/);
  assert.match(
    css,
    /@media \(max-width: 767px\)[\s\S]*\.task-sheet-shell\s*\{[^}]*height: calc\(100dvh - max\(1rem, env\(safe-area-inset-top\)\) - max\(1rem, env\(safe-area-inset-bottom\)\)\);/,
  );
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
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.detail-actions > \.companion-link-button,[\s\S]*\.selection-banner-actions > \.companion-link-button\s*\{\s*width: 100%;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.detail-actions > :not\(button\):not\(\.companion-link-button\),[\s\S]*\.selection-banner-actions > :not\(button\):not\(\.companion-link-button\),/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*:root\[data-theme-mode="light"\] \.phone-bottom-nav\s*\{[\s\S]*background: rgba\(248, 251, 255, 0\.98\);/);
  assert.match(css, /@media \(max-width: 767px\) and \(prefers-color-scheme: light\)[\s\S]*:root\[data-theme-mode="auto"\] \.swatch-surface\s*\{[\s\S]*--swatch-surface-top: 0\.24;/);
  assert.match(css, /:root\[data-theme-mode="light"\] \.list-row\.swatch-surface[\s\S]*inset 3px 0 0 rgb\(var\(--swatch-rgb\) \/ 0\.56\)/);
  assert.match(css, /:root\[data-theme-mode="light"\] \.printer-board\.printer-brand-surface[\s\S]*inset 3px 0 0 rgb\(var\(--brand-rgb\) \/ 0\.5\)/);
});
