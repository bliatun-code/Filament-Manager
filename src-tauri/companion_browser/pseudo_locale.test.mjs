import assert from "node:assert/strict";
import test from "node:test";

import {
  pseudoLocalizeLiteral,
  pseudoLocalizeMessage,
  pseudoLocalizeMessageForLocale,
} from "./pseudo_locale.js";

test("pseudo locale accents and expands visible message literals", () => {
  const source = "Settings and maintenance";
  const localized = pseudoLocalizeLiteral(source);
  assert.match(localized, /Şéţ/);
  assert.ok(localized.length >= source.length * 1.25);
});

test("pseudo messages preserve interpolated data and ICU branches", () => {
  const localized = pseudoLocalizeMessage(
    "{name}: {count, plural, one {# spool} other {# spools}} in {path}",
    {
      name: "Bambu Lab PLA Basic Tangerine Yellow (40402)",
      count: 2,
      path: "C:\\Users\\Alex\\Downloads",
    },
  );

  assert.ok(localized.startsWith("⟦"));
  assert.ok(localized.endsWith("⟧"));
  assert.ok(localized.includes("Bambu Lab PLA Basic Tangerine Yellow (40402)"));
  assert.ok(localized.includes("C:\\Users\\Alex\\Downloads"));
  assert.match(localized, /2 şþö/);
});

test("RTL pseudo messages isolate mixed-direction product data and use Arabic numbers", () => {
  const localized = pseudoLocalizeMessageForLocale(
    "{name}: {count, plural, one {# spool} other {# spools}}",
    { name: "Bambu Lab PLA Basic 40402", count: 2 },
    "ar-XB",
  );

  assert.ok(localized.startsWith("⟦\u2067"));
  assert.ok(localized.endsWith("\u2069⟧"));
  assert.ok(localized.includes("Bambu Lab PLA Basic 40402"));
  assert.match(localized, /٢/);
});

test("CJK pseudo messages exercise Han glyphs without changing product data", () => {
  const localized = pseudoLocalizeMessageForLocale(
    "Printer {name} has {count} slots",
    { name: "Bambu Lab P1S", count: 4 },
    "zh-XB",
  );

  assert.ok(localized.startsWith("【"));
  assert.ok(localized.endsWith("】"));
  assert.match(localized, /[品入設態]/);
  assert.ok(localized.includes("Bambu Lab P1S"));
});
