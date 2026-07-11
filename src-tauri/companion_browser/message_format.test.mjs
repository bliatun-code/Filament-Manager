import assert from "node:assert/strict";
import test from "node:test";

import { formatMessage, formatMessageWithLiteralTransform } from "./message_format.js";

const pluralMessage =
  "{count, plural, one {# item} few {# items-few} many {# items-many} other {# items}}";

test("ICU-compatible messages interpolate named and nested plural parameters", () => {
  assert.equal(
    formatMessage("{name}: {count, plural, one {# spool} other {# spools}}", {
      name: "Alex",
      count: 2,
    }),
    "Alex: 2 spools",
  );
});

test("plural categories cover English, French, German, Polish, and Czech", () => {
  assert.equal(formatMessage(pluralMessage, { count: 1 }, "en"), "1 item");
  assert.equal(formatMessage(pluralMessage, { count: 2 }, "en"), "2 items");
  assert.equal(formatMessage(pluralMessage, { count: 0 }, "fr"), "0 item");
  assert.equal(formatMessage(pluralMessage, { count: 2 }, "fr"), "2 items");
  assert.equal(formatMessage(pluralMessage, { count: 1 }, "de"), "1 item");
  assert.equal(formatMessage(pluralMessage, { count: 2 }, "de"), "2 items");
  assert.equal(formatMessage(pluralMessage, { count: 2 }, "pl"), "2 items-few");
  assert.equal(formatMessage(pluralMessage, { count: 5 }, "pl"), "5 items-many");
  assert.equal(formatMessage(pluralMessage, { count: 2 }, "cs"), "2 items-few");
  assert.equal(formatMessage(pluralMessage, { count: 5 }, "cs"), "5 items");
});

test("select and exact-number branches follow ICU message semantics", () => {
  assert.equal(
    formatMessage(
      "{tone, select, success {Saved} other {{count, plural, =0 {Empty} other {Pending}}}}",
      { tone: "other", count: 0 },
    ),
    "Empty",
  );
});

test("plural offsets keep exact matches on the source number and format the remainder", () => {
  const message =
    "{count, plural, offset:1 =0 {Nobody joined} =1 {Only the host} one {The host and # guest} other {The host and # guests}}";
  assert.equal(formatMessage(message, { count: 1 }), "Only the host");
  assert.equal(formatMessage(message, { count: 2 }), "The host and 1 guest");
  assert.equal(formatMessage(message, { count: 4 }), "The host and 3 guests");
});

test("literal transforms leave interpolated product data unchanged", () => {
  assert.equal(
    formatMessageWithLiteralTransform(
      "Material {name} has {count, plural, one {# roll} other {# rolls}}.",
      { name: "Bambu Lab PLA Basic", count: 2 },
      "en",
      (value) => value.toUpperCase(),
    ),
    "MATERIAL Bambu Lab PLA Basic HAS 2 ROLLS.",
  );
});
