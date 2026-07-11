import assert from "node:assert/strict";
import test from "node:test";

import { pseudoLocalizeLiteral, pseudoLocalizeMessage } from "./pseudo_locale.js";

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
