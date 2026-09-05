import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  USABILITY_TASKS,
  analyzeUsabilityResults,
} from "./analyze-usability-results.mjs";

function completeStudy({ candidateDuration = 60_000, participantCount = 5 } = {}) {
  const records = [];
  for (let participant = 1; participant <= participantCount; participant += 1) {
    for (const task of USABILITY_TASKS) {
      records.push({
        participant_id: `P${participant}`,
        build: "baseline",
        task,
        duration_ms: 100_000,
        completed: true,
        assisted: false,
        critical_error: false,
      });
      records.push({
        participant_id: `P${participant}`,
        build: "candidate",
        task,
        duration_ms: candidateDuration,
        completed: true,
        assisted: false,
        critical_error: false,
      });
    }
  }
  return records;
}

function studyWithOneMatchedPair() {
  const records = completeStudy();
  for (const record of records) {
    if (record.build === "baseline") record.assisted = true;
  }
  records.find((record) =>
    record.participant_id === "P1" && record.build === "baseline" && record.task === "register",
  ).assisted = false;
  return records;
}

test("usability analyzer passes a complete study above both thresholds", () => {
  const analysis = analyzeUsabilityResults(completeStudy());

  assert.equal(analysis.participantCount, 5);
  assert.equal(analysis.overallSuccessRate, 1);
  assert.equal(analysis.medianImprovementRate, 0.4);
  assert.equal(analysis.matchedPairCount, 25);
  assert.ok(USABILITY_TASKS.every((task) => analysis.timingByTask[task].matchedPairCount === 5));
  assert.equal(analysis.passed, true);
});

test("usability analyzer exposes thin timing coverage without changing acceptance thresholds", () => {
  const analysis = analyzeUsabilityResults(studyWithOneMatchedPair());

  assert.equal(analysis.participantCount, 5);
  assert.equal(analysis.overallSuccessRate, 1);
  assert.equal(analysis.matchedPairCount, 1);
  assert.equal(analysis.timingByTask.register.matchedPairCount, 1);
  for (const task of USABILITY_TASKS.filter((task) => task !== "register")) {
    assert.equal(analysis.timingByTask[task].matchedPairCount, 0);
    assert.equal(analysis.timingByTask[task].improvementRate, null);
  }
  // The existing gate accepts this limited timing basis; reporting it must
  // expose that limitation without silently introducing another threshold.
  assert.equal(analysis.medianImprovementRate, 0.4);
  assert.equal(analysis.passed, true);
});

test("usability CLI prints aggregate timing pair counts without participant identities", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "usability-cli-coverage-"));
  try {
    const records = studyWithOneMatchedPair().map((record) => ({
      ...record,
      participant_id: `PRIVATE_PARTICIPANT_${record.participant_id}`,
    }));
    const inputPath = path.join(directory, "results.json");
    writeFileSync(inputPath, JSON.stringify(records));
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("./analyze-usability-results.mjs", import.meta.url)),
      inputPath,
    ], { encoding: "utf8" });

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Matched timing pairs: 1\n/);
    assert.match(result.stdout, /register: 100\.0% · median improvement 40\.0% · matched timing pairs 1/);
    for (const task of USABILITY_TASKS.filter((task) => task !== "register")) {
      assert.ok(result.stdout.includes(`${task}: 100.0% · median improvement n/a · matched timing pairs 0`));
    }
    assert.match(result.stdout, /Acceptance gate: PASS/);
    for (const { participant_id: participantId } of records) {
      assert.ok(!`${result.stdout}${result.stderr}`.includes(participantId));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("usability analyzer blocks when one task hides failures behind the overall rate", () => {
  const records = completeStudy();
  const failedTaskAttempts = records.filter(
    (record) => record.build === "candidate" && record.task === "load",
  );
  failedTaskAttempts[0].assisted = true;

  const analysis = analyzeUsabilityResults(records);

  assert.equal(analysis.overallSuccessRate, 24 / 25);
  assert.equal(analysis.perTask.load.successRate, 0.8);
  assert.equal(analysis.successGatePassed, false);
  assert.equal(analysis.passed, false);
});

test("usability analyzer requires five participants and 30 percent improvement", () => {
  const analysis = analyzeUsabilityResults(
    completeStudy({ candidateDuration: 75_000, participantCount: 4 }),
  );

  assert.equal(analysis.participantGatePassed, false);
  assert.equal(analysis.timingGatePassed, false);
  assert.equal(analysis.passed, false);
});

test("usability analyzer rejects duplicates and incomplete matched datasets", () => {
  const duplicate = completeStudy();
  duplicate.push({ ...duplicate[0] });
  assert.throws(() => analyzeUsabilityResults(duplicate), /Duplicate result/);

  const incomplete = completeStudy();
  incomplete.pop();
  assert.throws(() => analyzeUsabilityResults(incomplete), /Incomplete matched dataset/);
});
