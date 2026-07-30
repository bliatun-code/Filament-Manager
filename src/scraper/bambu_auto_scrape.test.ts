import assert from "node:assert/strict";
import test from "node:test";

import { hasExactHostname } from "./bambu_auto_scrape.js";

test("hasExactHostname only accepts the exact URL hostname", () => {
  assert.equal(
    hasExactHostname(
      "https://eu.store.bambulab.com/collections/filament",
      "eu.store.bambulab.com",
    ),
    true,
  );
  assert.equal(
    hasExactHostname(
      "https://eu.store.bambulab.com.attacker.example",
      "eu.store.bambulab.com",
    ),
    false,
  );
  assert.equal(
    hasExactHostname(
      "https://eu.store.bambulab.com@attacker.example",
      "eu.store.bambulab.com",
    ),
    false,
  );
  assert.equal(
    hasExactHostname(
      "https://attacker.example/eu.store.bambulab.com",
      "eu.store.bambulab.com",
    ),
    false,
  );
  assert.equal(
    hasExactHostname("not a URL", "eu.store.bambulab.com"),
    false,
  );
});
