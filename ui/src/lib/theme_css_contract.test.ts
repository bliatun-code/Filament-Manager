import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

function cssBlock(selector: string): string {
  const selectorIndex = css.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `expected selector ${selector}`);
  const openingBrace = css.indexOf("{", selectorIndex);
  let depth = 0;
  for (let index = openingBrace; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(openingBrace + 1, index);
      }
    }
  }
  assert.fail(`unterminated selector ${selector}`);
}

function cssRuleDeclarations(selector: string): string {
  const matches: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = rulePattern.exec(css)) !== null) {
    const selectors = match[1]
      .split(",")
      .map((candidate) => candidate.trim());
    if (selectors.includes(selector)) {
      matches.push(match[2]);
    }
  }

  assert.ok(matches.length > 0, `expected generic CSS selector ${selector}`);
  return matches.join("\n");
}

function assertRuleUsesVariables(selector: string, variables: readonly string[]): void {
  const declarations = cssRuleDeclarations(selector);
  for (const variable of variables) {
    assert.match(
      declarations,
      new RegExp(`var\\(--${variable}\\)`),
      `${selector} must use --${variable}`,
    );
  }
}

type Rgb = readonly [number, number, number];

function cssRgbVariable(block: string, variable: string): Rgb {
  const match = block.match(
    new RegExp(`--${variable}:\\s*rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\);`),
  );
  assert.ok(match, `expected RGB variable --${variable}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function relativeLuminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

test("desktop brand themes use the verified Bambu and Prusa accents", () => {
  assert.match(
    cssBlock('html[data-theme="bambu"]'),
    /--app-theme-accent:\s*rgb\(0, 174, 66\);/,
  );
  assert.match(
    cssBlock('html[data-theme="prusa"]'),
    /--app-theme-accent:\s*rgb\(253, 80, 0\);/,
  );
});

test("desktop brand themes only style app chrome and leave data colors alone", () => {
  for (const theme of ["bambu", "prusa"]) {
    const block = cssBlock(`html[data-theme="${theme}"]`);
    assert.doesNotMatch(block, /--swatch-/);
    assert.doesNotMatch(block, /--filament-/);
    assert.doesNotMatch(block, /--material-/);
    assert.doesNotMatch(block, /--status-/);
  }

  assert.match(css, /background-color:\s*var\(--app-theme-surface-background\);/);
  assert.match(css, /background-image:\s*var\(--app-theme-page-background\);/);
});

test("light theme filled controls use accessible navy semantic tokens", () => {
  const root = cssBlock(":root");
  const white: Rgb = [255, 255, 255];
  const primary = cssRgbVariable(root, "app-theme-primary-action-background");
  const primaryHover = cssRgbVariable(
    root,
    "app-theme-primary-action-hover-background",
  );
  const selected = cssRgbVariable(root, "app-theme-selected-control-background");
  const selectedHover = cssRgbVariable(
    root,
    "app-theme-selected-control-hover-background",
  );

  assert.deepEqual(primary, [35, 70, 99]);
  assert.deepEqual(selected, [41, 79, 112]);
  for (const background of [primary, primaryHover, selected, selectedHover]) {
    assert.ok(
      contrastRatio(background, white) >= 7,
      `expected AAA white-text contrast for ${background.join(", ")}`,
    );
  }
});

test("every desktop theme defines shared control, action, selection, and data-surface tokens", () => {
  const selectors = [
    ":root",
    "html.dark",
    'html[data-theme="bambu"]',
    'html[data-theme="prusa"]',
  ];
  const variables = [
    "app-theme-control-border",
    "app-theme-control-background",
    "app-theme-control-hover-background",
    "app-theme-control-text",
    "app-theme-control-placeholder",
    "app-theme-control-shadow",
    "app-theme-primary-action-border",
    "app-theme-primary-action-background",
    "app-theme-primary-action-hover-background",
    "app-theme-primary-action-text",
    "app-theme-primary-action-shadow",
    "app-theme-selected-control-border",
    "app-theme-selected-control-background",
    "app-theme-selected-control-hover-background",
    "app-theme-selected-control-text",
    "app-theme-selected-control-shadow",
    "app-theme-modal-inset-soft-background",
    "app-theme-data-card-base",
    "app-theme-data-panel-base",
    "app-theme-data-inset-base",
    "app-theme-data-ambient-shadow",
    "app-theme-data-inset-highlight",
    "app-theme-data-neutral-border",
  ];

  for (const selector of selectors) {
    const block = cssBlock(selector);
    for (const variable of variables) {
      assert.match(
        block,
        new RegExp(`--${variable}:`),
        `${selector} is missing --${variable}`,
      );
    }
  }
});

test("generic control selectors consume the shared theme tokens", () => {
  assertRuleUsesVariables(".app-primary-action", [
    "app-theme-primary-action-border",
    "app-theme-primary-action-background",
    "app-theme-primary-action-text",
    "app-theme-primary-action-shadow",
  ]);
  assertRuleUsesVariables(".app-primary-action:hover:not(:disabled)", [
    "app-theme-primary-action-hover-background",
  ]);
  assertRuleUsesVariables(".app-accent-action", [
    "app-theme-modal-action-border",
    "app-theme-modal-action-background",
    "app-theme-modal-action-text",
  ]);
  assertRuleUsesVariables(".app-accent-action:hover:not(:disabled)", [
    "app-theme-modal-action-hover-background",
  ]);
  assertRuleUsesVariables(".app-accent-control", ["app-theme-accent"]);
  assertRuleUsesVariables(".app-selected-control", [
    "app-theme-selected-control-border",
    "app-theme-selected-control-background",
    "app-theme-selected-control-text",
    "app-theme-selected-control-shadow",
  ]);
  assertRuleUsesVariables(".app-selected-control:hover:not(:disabled)", [
    "app-theme-selected-control-hover-background",
  ]);
  assertRuleUsesVariables(".app-form-control", [
    "app-theme-control-border",
    "app-theme-control-background",
    "app-theme-control-text",
    "app-theme-control-shadow",
  ]);
  assertRuleUsesVariables(".app-form-control::placeholder", [
    "app-theme-control-placeholder",
  ]);
  assertRuleUsesVariables(".app-soft-control", [
    "app-theme-control-border",
    "app-theme-control-background",
    "app-theme-control-text",
    "app-theme-control-shadow",
  ]);
  assertRuleUsesVariables(".app-soft-control:hover:not(:disabled)", [
    "app-theme-control-hover-background",
  ]);
  assertRuleUsesVariables(".app-control-group", [
    "app-theme-control-border",
    "app-theme-control-background",
    "app-theme-control-shadow",
  ]);
});

test("brand theme action and selected-control tokens keep readable text contrast", () => {
  for (const theme of ["bambu", "prusa"]) {
    const block = cssBlock(`html[data-theme="${theme}"]`);
    for (const kind of ["primary-action", "selected-control"]) {
      const text = cssRgbVariable(block, `app-theme-${kind}-text`);
      for (const state of ["background", "hover-background"]) {
        const background = cssRgbVariable(block, `app-theme-${kind}-${state}`);
        assert.ok(
          contrastRatio(background, text) >= 4.5,
          `${theme} ${kind} ${state} contrast must be at least 4.5:1`,
        );
      }
    }
  }
});

test("every desktop theme defines semantic modal chrome and actions", () => {
  const selectors = [
    ":root",
    "html.dark",
    'html[data-theme="bambu"]',
    'html[data-theme="prusa"]',
  ];
  const modalVariables = [
    "app-theme-modal-overlay-background",
    "app-theme-modal-panel-border",
    "app-theme-modal-panel-background",
    "app-theme-modal-header-background",
    "app-theme-modal-toolbar-background",
    "app-theme-modal-footer-background",
    "app-theme-modal-divider",
    "app-theme-modal-inset-border",
    "app-theme-modal-inset-background",
    "app-theme-modal-inset-soft-background",
    "app-theme-modal-control-border",
    "app-theme-modal-control-background",
    "app-theme-modal-action-border",
    "app-theme-modal-action-background",
    "app-theme-modal-action-hover-background",
    "app-theme-modal-action-text",
    "app-theme-modal-selection-border",
    "app-theme-modal-selection-background",
    "app-theme-modal-selection-hover-background",
    "app-theme-modal-selection-text",
  ];

  for (const selector of selectors) {
    const block = cssBlock(selector);
    for (const variable of modalVariables) {
      assert.match(block, new RegExp(`--${variable}:`), `${selector} is missing --${variable}`);
    }
    const action = cssRgbVariable(block, "app-theme-modal-action-background");
    const actionHover = cssRgbVariable(
      block,
      "app-theme-modal-action-hover-background",
    );
    const actionText = cssRgbVariable(block, "app-theme-modal-action-text");
    assert.ok(contrastRatio(action, actionText) >= 4.5, `${selector} modal action contrast`);
    assert.ok(
      contrastRatio(actionHover, actionText) >= 4.5,
      `${selector} modal action hover contrast`,
    );
  }

  assert.match(
    cssBlock('html[data-theme="bambu"]'),
    /--app-theme-modal-panel-background:\s*rgba\(7, 26, 25, 0\.98\);/,
  );
  assert.match(
    cssBlock('html[data-theme="prusa"]'),
    /--app-theme-modal-panel-background:\s*rgba\(32, 24, 22, 0\.98\);/,
  );
  assert.match(css, /\.app-modal-panel \{[\s\S]*var\(--app-theme-modal-panel-background\)/);
  assert.match(css, /\.app-modal-inset \{[\s\S]*var\(--app-theme-modal-inset-background\)/);
  assert.match(css, /\.app-modal-primary-action \{[\s\S]*var\(--app-theme-modal-action-background\)/);
  assert.match(css, /\.app-modal-selected-control \{[\s\S]*var\(--app-theme-modal-selection-background\)/);
});
