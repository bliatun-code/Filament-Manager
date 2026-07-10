import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cssSource = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

test("main navigation keeps a visible keyboard focus indicator", () => {
  const focusRule = cssSource.match(/\.app-nav-button:focus-visible\s*\{([^}]+)\}/s)?.[1] ?? "";

  assert.match(focusRule, /outline:\s*2px solid/);
  assert.match(focusRule, /outline-offset:\s*2px/);
  assert.match(focusRule, /box-shadow:/);
  assert.doesNotMatch(focusRule, /outline:\s*none/);
});

test("app shell exposes a skip link and named navigation landmark", () => {
  assert.match(
    appSource,
    /<a className="app-skip-link" href="#app-main-content">/,
  );
  assert.match(appSource, /t\("app\.skipToMainContent", "Skip to main content"\)/);
  assert.match(
    appSource,
    /<nav className="app-nav" aria-label=\{t\("app\.navigation", "Navigation"\)\}>/,
  );
  assert.doesNotMatch(appSource, /className="app-nav-list" aria-label=/);
});

test("main landmark wraps lazy page content and is a reliable skip target", () => {
  const mainIndex = appSource.indexOf('<main id="app-main-content" tabIndex={-1}>');
  const suspenseIndex = appSource.indexOf("<Suspense", mainIndex);
  const mainCloseIndex = appSource.indexOf("</main>", suspenseIndex);

  assert.notEqual(mainIndex, -1);
  assert.ok(mainIndex < suspenseIndex && suspenseIndex < mainCloseIndex);
});

test("reduced-motion preference shortens non-essential motion globally", () => {
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(cssSource, /animation-duration:\s*0\.01ms !important/);
  assert.match(cssSource, /animation-iteration-count:\s*1 !important/);
  assert.match(cssSource, /scroll-behavior:\s*auto !important/);
  assert.match(cssSource, /transition-duration:\s*0\.01ms !important/);
});

test("compact desktop navigation keeps the active destination in view", () => {
  assert.match(appSource, /min-\[900px\]:block/);
  assert.match(appSource, /const activeNavButtonRef = useRef<HTMLButtonElement \| null>\(null\)/);
  assert.match(appSource, /ref=\{activePage === page\.key \? activeNavButtonRef : undefined\}/);
  assert.match(appSource, /activeNavButtonRef\.current\?\.scrollIntoView/);
  assert.match(appSource, /inline: "nearest"/);
});
