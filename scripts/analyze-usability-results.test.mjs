import assert from "node:assert/strict";
import test from "node:test";

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

test("usability analyzer passes a complete study above both thresholds", () => {
  const analysis = analyzeUsabilityResults(completeStudy());

  assert.equal(analysis.participantCount, 5);
  assert.equal(analysis.overallSuccessRate, 1);
  assert.equal(analysis.medianImprovementRate, 0.4);
  assert.equal(analysis.matchedPairCount, 25);
  assert.equal(analysis.passed, true);
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
