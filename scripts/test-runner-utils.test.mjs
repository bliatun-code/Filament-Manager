import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeNodeTestArgs,
  toNodeImportSpecifier,
} from "./test-runner-utils.mjs";

test("normalizeNodeTestArgs forwards native Node test arguments", () => {
  assert.deepEqual(normalizeNodeTestArgs(["--test-skip-pattern", "slow"]), [
    "--test-skip-pattern",
    "slow",
  ]);
});

test("normalizeNodeTestArgs maps grep aliases to Node test name patterns", () => {
  assert.deepEqual(normalizeNodeTestArgs(["--grep", "printer profile"]), [
    "--test-name-pattern",
    "printer profile",
  ]);
  assert.deepEqual(normalizeNodeTestArgs(["-g", "Bambu"]), [
    "--test-name-pattern",
    "Bambu",
  ]);
  assert.deepEqual(normalizeNodeTestArgs(["--grep=RFID"]), ["--test-name-pattern=RFID"]);
});

test("normalizeNodeTestArgs rejects grep aliases without a pattern", () => {
  assert.throws(() => normalizeNodeTestArgs(["--grep"]), /requires a test name pattern/);
  assert.throws(() => normalizeNodeTestArgs(["-g"]), /requires a test name pattern/);
});

test("Node import preload paths are portable file URL specifiers", () => {
  const preloadPath = resolve("scripts", "preload-companion-locales.mjs");
  const importSpecifier = toNodeImportSpecifier(preloadPath);

  assert.equal(new URL(importSpecifier).protocol, "file:");
  assert.equal(fileURLToPath(importSpecifier), preloadPath);
});
