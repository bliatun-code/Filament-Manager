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
