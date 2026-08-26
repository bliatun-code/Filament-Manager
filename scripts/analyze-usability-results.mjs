import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const USABILITY_TASKS = ["register", "find", "load", "lend", "receive"];
export const USABILITY_BUILDS = ["baseline", "candidate"];
export const MIN_UNASSISTED_SUCCESS_RATE = 0.9;
export const MIN_MEDIAN_IMPROVEMENT_RATE = 0.3;
export const MIN_PARTICIPANTS = 5;

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function assertRecord(record, index) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`Record ${index + 1} must be an object.`);
  }
  if (typeof record.participant_id !== "string" || !record.participant_id.trim()) {
    throw new Error(`Record ${index + 1} has an invalid participant_id.`);
  }
  if (!USABILITY_BUILDS.includes(record.build)) {
    throw new Error(`Record ${index + 1} has an invalid build.`);
  }
  if (!USABILITY_TASKS.includes(record.task)) {
    throw new Error(`Record ${index + 1} has an invalid task.`);
  }
  if (!Number.isSafeInteger(record.duration_ms) || record.duration_ms <= 0) {
    throw new Error(`Record ${index + 1} has an invalid duration_ms.`);
  }
  for (const field of ["completed", "assisted", "critical_error"]) {
    if (typeof record[field] !== "boolean") {
      throw new Error(`Record ${index + 1} has an invalid ${field}.`);
    }
  }
}

function successfulWithoutHelp(record) {
  return record.completed && !record.assisted && !record.critical_error;
}

function resultKey(record) {
  return `${record.participant_id.trim()}\u0000${record.build}\u0000${record.task}`;
}

function rate(successes, attempts) {
  return attempts === 0 ? 0 : successes / attempts;
}

export function analyzeUsabilityResults(records) {
  if (!Array.isArray(records)) {
    throw new Error("The usability result file must contain a JSON array.");
  }
  records.forEach(assertRecord);

  const byKey = new Map();
  const participantIds = new Set();
  for (const record of records) {
    const normalized = { ...record, participant_id: record.participant_id.trim() };
    const key = resultKey(normalized);
    if (byKey.has(key)) {
      throw new Error(
        `Duplicate result for ${normalized.participant_id}/${normalized.build}/${normalized.task}.`,
      );
    }
    byKey.set(key, normalized);
    participantIds.add(normalized.participant_id);
  }

  const missing = [];
  for (const participantId of participantIds) {
    for (const build of USABILITY_BUILDS) {
      for (const task of USABILITY_TASKS) {
        const key = `${participantId}\u0000${build}\u0000${task}`;
        if (!byKey.has(key)) {
          missing.push(`${participantId}/${build}/${task}`);
        }
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`Incomplete matched dataset: ${missing.join(", ")}.`);
  }

  const candidateRecords = records.filter((record) => record.build === "candidate");
  const candidateSuccesses = candidateRecords.filter(successfulWithoutHelp).length;
  const overallSuccessRate = rate(candidateSuccesses, candidateRecords.length);
  const perTask = Object.fromEntries(
    USABILITY_TASKS.map((task) => {
      const attempts = candidateRecords.filter((record) => record.task === task);
      return [
        task,
        {
          attempts: attempts.length,
          successRate: rate(attempts.filter(successfulWithoutHelp).length, attempts.length),
        },
      ];
    }),
  );

  const matchedPairs = [];
  const taskDurations = Object.fromEntries(
    USABILITY_TASKS.map((task) => [task, { baseline: [], candidate: [] }]),
  );
  for (const participantId of participantIds) {
    for (const task of USABILITY_TASKS) {
      const baseline = byKey.get(`${participantId}\u0000baseline\u0000${task}`);
      const candidate = byKey.get(`${participantId}\u0000candidate\u0000${task}`);
      if (!successfulWithoutHelp(baseline) || !successfulWithoutHelp(candidate)) {
        continue;
      }
      matchedPairs.push({ baseline: baseline.duration_ms, candidate: candidate.duration_ms });
      taskDurations[task].baseline.push(baseline.duration_ms);
      taskDurations[task].candidate.push(candidate.duration_ms);
    }
  }

  const baselineMedianMs = median(matchedPairs.map((pair) => pair.baseline));
  const candidateMedianMs = median(matchedPairs.map((pair) => pair.candidate));
  const medianImprovementRate =
    baselineMedianMs && candidateMedianMs != null
      ? (baselineMedianMs - candidateMedianMs) / baselineMedianMs
      : null;
  const timingByTask = Object.fromEntries(
    USABILITY_TASKS.map((task) => {
      const baseline = median(taskDurations[task].baseline);
      const candidate = median(taskDurations[task].candidate);
      return [
        task,
        {
          baselineMedianMs: baseline,
          candidateMedianMs: candidate,
          improvementRate:
            baseline && candidate != null ? (baseline - candidate) / baseline : null,
        },
      ];
    }),
  );

  const participantCount = participantIds.size;
  const participantGatePassed = participantCount >= MIN_PARTICIPANTS;
  const successGatePassed =
    overallSuccessRate >= MIN_UNASSISTED_SUCCESS_RATE &&
    USABILITY_TASKS.every(
      (task) => perTask[task].successRate >= MIN_UNASSISTED_SUCCESS_RATE,
    );
  const timingGatePassed =
    medianImprovementRate != null &&
    medianImprovementRate >= MIN_MEDIAN_IMPROVEMENT_RATE;

  return {
    baselineMedianMs,
    candidateMedianMs,
    matchedPairCount: matchedPairs.length,
    medianImprovementRate,
    overallSuccessRate,
    participantCount,
    participantGatePassed,
    passed: participantGatePassed && successGatePassed && timingGatePassed,
    perTask,
    successGatePassed,
    timingByTask,
    timingGatePassed,
  };
}

function percentage(value) {
  return value == null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function printAnalysis(analysis) {
  console.log(`Participants: ${analysis.participantCount} (minimum ${MIN_PARTICIPANTS})`);
  console.log(`Candidate unassisted completion: ${percentage(analysis.overallSuccessRate)}`);
  for (const task of USABILITY_TASKS) {
    console.log(
      `  ${task}: ${percentage(analysis.perTask[task].successRate)} · ` +
        `median improvement ${percentage(analysis.timingByTask[task].improvementRate)}`,
    );
  }
  console.log(
    `Matched median: ${analysis.baselineMedianMs ?? "n/a"} ms → ` +
      `${analysis.candidateMedianMs ?? "n/a"} ms ` +
      `(${percentage(analysis.medianImprovementRate)} shorter)`,
  );
  console.log(`Acceptance gate: ${analysis.passed ? "PASS" : "FAIL"}`);
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: node scripts/analyze-usability-results.mjs <results.json>");
  }
  const records = JSON.parse(await readFile(inputPath, "utf8"));
  const analysis = analyzeUsabilityResults(records);
  printAnalysis(analysis);
  if (!analysis.passed) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
