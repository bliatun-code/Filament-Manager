import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desktopCss = readFileSync(new URL("../ui/src/index.css", import.meta.url), "utf8");
const companionThemeCss = readFileSync(
  new URL("../src-tauri/companion_browser/theme.css", import.meta.url),
  "utf8",
);
const companionCss = [
  "../src-tauri/companion_browser/app.css",
  "../src-tauri/companion_browser/workspace.css",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");

for (const [surface, css] of [
  ["desktop", desktopCss],
  ["Companion", companionThemeCss],
]) {
  test(`${surface} font stack includes macOS, Windows, and Linux CJK fallbacks`, () => {
    assert.match(css, /PingFang SC/);
    assert.match(css, /Hiragino Sans GB/);
    assert.match(css, /Microsoft YaHei/);
    assert.match(css, /Noto Sans CJK SC/);
  });
}

test("Companion scroll padding and live status spacing use RTL-safe logical properties", () => {
  assert.match(companionCss, /padding-inline-end: 0\.12rem/);
  assert.match(companionCss, /padding-inline-end: 0\.1rem/);
  assert.match(companionCss, /margin-inline-end: 0\.35rem/);
  assert.match(companionCss, /padding-inline: 1rem 2\.7rem/);
  assert.match(companionCss, /inset-inline-end: 1rem/);
});
