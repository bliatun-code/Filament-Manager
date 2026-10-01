import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { planRustCacheSave, runRustCacheSavePlan } from "./plan-rust-cache-save.mjs";

const startedAtSeconds = 1_800_000_000;

test("cache maintenance needs ten minutes remaining in either native job", () => {
  for (const jobTimeoutMinutes of [45, 60]) {
    const boundary = (startedAtSeconds + (jobTimeoutMinutes - 10) * 60) * 1000;
    const plan = (nowMs) => planRustCacheSave({ startedAtSeconds, jobTimeoutMinutes, nowMs });
    assert.equal(plan(boundary - 1).canSave, true);
    assert.equal(plan(boundary).canSave, true);
    assert.equal(plan(boundary + 1).canSave, false);
    assert.deepEqual(plan((startedAtSeconds + jobTimeoutMinutes * 60 + 1) * 1000), {
      canSave: false, remainingMinutes: 0,
    });
  }
});

test("invalid, missing and future clocks fail closed", () => {
  const base = { startedAtSeconds, jobTimeoutMinutes: 60, nowMs: startedAtSeconds * 1000 };
  for (const field of ["startedAtSeconds", "jobTimeoutMinutes", "nowMs"]) {
    for (const value of [undefined, NaN, Infinity, 0, -1, 1.5]) {
      assert.throws(() => planRustCacheSave({ ...base, [field]: value }));
    }
  }
  assert.throws(() => planRustCacheSave({ ...base, startedAtSeconds: startedAtSeconds + 1 }));
});

test("GitHub output authorizes only a valid budget and preserves previous outputs", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "rust-cache-budget-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, "output");
  const environment = { CI_JOB_STARTED_AT: String(startedAtSeconds), GITHUB_OUTPUT: output };
  const args = ["--job-timeout-minutes=60", "--github-output"];
  writeFileSync(output, "existing=yes\n");
  for (const [elapsedMinutes, expected] of [[42, true], [51, false]]) {
    runRustCacheSavePlan(args, {
      environment, nowMs: (startedAtSeconds + elapsedMinutes * 60) * 1000, writeOutput() {},
    });
    assert.ok(readFileSync(output, "utf8").endsWith(`can-save=${expected}\n`));
  }
  const before = readFileSync(output, "utf8");
  assert.ok(before.startsWith("existing=yes\n"));
  for (const invalid of ["", "not-a-time", String(startedAtSeconds + 1)]) {
    assert.throws(() => runRustCacheSavePlan(args, {
      environment: { ...environment, CI_JOB_STARTED_AT: invalid },
      nowMs: startedAtSeconds * 1000, writeOutput() {},
    }));
    assert.equal(readFileSync(output, "utf8"), before);
  }
  assert.throws(() => runRustCacheSavePlan(args, { environment: {} }));
});
