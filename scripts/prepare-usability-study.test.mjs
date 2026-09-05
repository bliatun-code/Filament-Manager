import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { analyzeUsabilityResults, USABILITY_TASKS } from "./analyze-usability-results.mjs";
import { parseUsabilityStudyArgs, prepareUsabilityStudy } from "./prepare-usability-study.mjs";

function temporaryRepository(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "usability-preparation-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repositoryRoot = path.join(directory, "repository");
  mkdirSync(path.join(repositoryRoot, "src", "backend"), { recursive: true });
  const git = (...args) => execFileSync("git", args, {
    cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Usability Fixture Test");
  git("config", "user.email", "usability-fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", path.join(directory, "unused-hooks"));
  const commit = (version) => {
    writeFileSync(path.join(repositoryRoot, "src", "backend", "database_schema.rs"),
      `pub const CURRENT_SCHEMA_VERSION: i64 = ${version};\n`);
    git("add", "src/backend/database_schema.rs");
    git("commit", "--quiet", "-m", `Synthetic schema ${version}`);
    return git("rev-parse", "HEAD");
  };
  const baselineRef = commit(2);
  const candidateRef = commit(6);
  return {
    directory, repositoryRoot,
    options: { baselineRef, candidateRef, repositoryRoot, outputPath: path.join(directory, "study") },
  };
}

function json(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function databaseAt(file, work, readonly = true) {
  const db = new Database(file, { fileMustExist: true, readonly });
  try { return work(db); } finally { db.close(); }
}

function assertPrivateMode(file, mode) {
  if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, mode, file);
}

test("study preparation creates balanced slots, unmeasured records and isolated schema-2 task databases", (t) => {
  const { options } = temporaryRepository(t);
  const prepared = prepareUsabilityStudy(options);
  const output = prepared.outputPath;
  const manifest = json(path.join(output, "study.json"));
  const records = json(path.join(output, "results.json"));
  assert.equal(output, realpathSync(options.outputPath));
  assert.equal(prepared.participantCount, 6);
  assert.equal(prepared.recordCount, 60);
  assert.deepEqual(manifest, prepared.manifest);
  assert.equal(manifest.status, "not_started");
  assert.equal(manifest.builds.baseline.commit, options.baselineRef);
  assert.equal(manifest.builds.candidate.commit, options.candidateRef);
  assert.equal(manifest.builds.baseline.schema_version, 2);
  assert.equal(manifest.builds.candidate.schema_version, 6);
  for (const build of Object.values(manifest.builds)) {
    assert.equal(build.artifact_path, null);
    assert.equal(build.artifact_sha256, null);
    assert.equal(build.launch_verified, false);
  }
  assert.equal(manifest.setup.task_time_limit_ms, 600_000);
  assert.equal(manifest.setup.machine_class, null);
  assert.equal(manifest.setup.display_size, null);
  assert.equal(manifest.setup.input_method, null);
  assert.equal(manifest.setup.preferences_verified, false);
  assert.equal(manifest.participants.length, 6);
  assert.equal(manifest.participants.filter((entry) => entry.planned_build_order[0] === "baseline").length, 3);
  assert.equal(manifest.participants.filter((entry) => entry.planned_build_order[0] === "candidate").length, 3);
  const sessionPaths = [];
  for (const participant of manifest.participants) {
    assert.equal(participant.actual_build_order, null);
    assert.deepEqual([...participant.planned_build_order].sort(), ["baseline", "candidate"]);
    assert.equal(participant.sessions.length, 10);
    for (const build of ["baseline", "candidate"]) {
      assert.deepEqual(participant.sessions.filter((session) => session.build === build).map((session) => session.task), USABILITY_TASKS);
    }
    for (const session of participant.sessions) {
      const file = path.join(output, ...session.database.split("/"));
      assert.ok(file.startsWith(`${output}${path.sep}`));
      sessionPaths.push(file);
      assertPrivateMode(file, 0o600);
      assertPrivateMode(path.dirname(file), 0o700);
      assertPrivateMode(path.dirname(path.dirname(file)), 0o700);
    }
  }
  assert.equal(new Set(sessionPaths).size, 60);
  assert.equal(records.length, 60);
  assert.equal(new Set(records.map((record) => `${record.participant_id}/${record.build}/${record.task}`)).size, 60);
  for (const record of records) {
    assert.deepEqual(Object.keys(record).sort(), [
      "assisted", "build", "completed", "critical_error", "duration_ms", "participant_id", "task",
    ]);
    assert.match(record.participant_id, /^P0[1-6]$/);
    for (const field of ["duration_ms", "completed", "assisted", "critical_error"]) assert.equal(record[field], null);
  }
  assert.throws(() => analyzeUsabilityResults(records), /invalid duration_ms/);

  const fixture = path.join(output, "fixture.db");
  const pristine = readFileSync(fixture);
  assert.equal(manifest.fixture.schema_version, 2);
  assert.equal(manifest.fixture.sha256, createHash("sha256").update(pristine).digest("hex"));
  for (const session of sessionPaths) assert.equal(Buffer.compare(readFileSync(session), pristine), 0, session);
  databaseAt(fixture, (db) => {
    assert.equal(db.pragma("user_version", { simple: true }), 2);
    assert.equal(db.pragma("quick_check", { simple: true }), "ok");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    assert.ok(db.prepare("SELECT COUNT(*) AS count FROM printers").get().count >= 2);
    assert.deepEqual(db.prepare("SELECT status, quantity FROM wishlist_items WHERE id = ?").get("qa_wishlist_white_pla"), { status: "ON_ORDER", quantity: 2 });
    assert.equal(db.prepare("SELECT spool_id FROM ams_slots WHERE id = ?").get("qa_bambu_slot_4").spool_id, null);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ams_slots WHERE spool_id = ?").get("spool_demo_100004").count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM spool_loans WHERE spool_id = ? AND loan_status = 'ACTIVE'").get("spool_demo_100004").count, 0);
    assert.ok(db.prepare("SELECT COUNT(*) AS count FROM spool_loans WHERE loan_direction = 'OUTBOUND' AND loan_status = 'ACTIVE'").get().count >= 1);
    assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'trusted_lan_enabled'").get().value, "0");
    assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'library_sync_mode'").get().value, "STANDALONE");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM settings WHERE key LIKE 'bambu_live_integration:%'").get().count, 0);
  });
  databaseAt(sessionPaths[0], (db) => {
    assert.equal(db.prepare("UPDATE filament_spools SET current_weight_g = 321, remaining_g = 321 WHERE id = ?").run("spool_demo_100004").changes, 1);
  }, false);
  databaseAt(sessionPaths[0], (db) => {
    assert.equal(db.prepare("SELECT remaining_g FROM filament_spools WHERE id = ?").get("spool_demo_100004").remaining_g, 321);
  });
  assert.notEqual(Buffer.compare(readFileSync(sessionPaths[0]), pristine), 0);
  assert.equal(Buffer.compare(readFileSync(fixture), pristine), 0);
  for (const session of sessionPaths.slice(1)) assert.equal(Buffer.compare(readFileSync(session), pristine), 0, session);

  assertPrivateMode(output, 0o700);
  assertPrivateMode(path.join(output, "sessions"), 0o700);
  assertPrivateMode(fixture, 0o400);
  for (const file of ["study.json", "results.json", "task-cards.md", "README.md"]) assertPrivateMode(path.join(output, file), 0o600);
  const [cards, answers] = readFileSync(path.join(output, "task-cards.md"), "utf8").split("# Moderator answer key");
  assert.ok(answers);
  for (const [index, task] of USABILITY_TASKS.entries()) {
    assert.ok(cards.includes(`## Card ${index + 1}: ${task}`));
    assert.ok(answers.includes(`## Answer ${index + 1}: ${task}`));
  }
  assert.doesNotMatch(cards, /spool_demo_|qa_bambu_slot_|qa_wishlist_|qa_master_/);
  assert.match(answers, /spool_demo_100003/);
  assert.match(answers, /spool_demo_100004/);
  assert.match(answers, /qa_wishlist_white_pla/);
});

test("study preparation preserves existing output and rejects repository paths including symlink parents", (t) => {
  const { directory, repositoryRoot, options } = temporaryRepository(t);
  mkdirSync(options.outputPath);
  const sentinel = path.join(options.outputPath, "results.json");
  const existingResults = Buffer.from("Existing private observations must remain unchanged.\n");
  writeFileSync(sentinel, existingResults);
  assert.throws(() => prepareUsabilityStudy(options), /EEXIST/);
  assert.deepEqual(readFileSync(sentinel), existingResults);
  assert.equal(existsSync(path.join(options.outputPath, "study.json")), false);

  for (const outputPath of [repositoryRoot, path.join(repositoryRoot, "study")]) {
    assert.throws(() => prepareUsabilityStudy({ ...options, outputPath }), /outside the repository/);
  }
  const linkedParent = path.join(directory, "linked-repository");
  symlinkSync(repositoryRoot, linkedParent, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => prepareUsabilityStudy({ ...options, outputPath: path.join(linkedParent, "study") }), /outside the repository/);
  assert.equal(existsSync(path.join(repositoryRoot, "study")), false);
  assert.deepEqual(readFileSync(sentinel), existingResults);
});

test("study preparation rejects invalid counts, time limits and build identities before creating output", (t) => {
  const { options } = temporaryRepository(t);
  for (const participantCount of [0, 4, 5.5, 101, NaN, Infinity, "6"]) {
    assert.throws(() => prepareUsabilityStudy({ ...options, participantCount }), /Participants must be an integer/);
    assert.equal(existsSync(options.outputPath), false);
  }
  for (const timeLimitSeconds of [0, -1, 1.5, 3601, NaN, Infinity]) {
    assert.throws(() => prepareUsabilityStudy({ ...options, timeLimitSeconds }), /time limit must be an integer/);
    assert.equal(existsSync(options.outputPath), false);
  }
  assert.throws(() => prepareUsabilityStudy({ ...options, baselineRef: options.candidateRef }), /different commits/);
  for (const field of ["baselineRef", "candidateRef"]) {
    assert.throws(() => prepareUsabilityStudy({ ...options, [field]: "nonexistent-study-ref" }));
    assert.throws(() => prepareUsabilityStudy({ ...options, [field]: "" }), /Usage/);
  }
  assert.equal(existsSync(options.outputPath), false);
});

test("study CLI parses explicit options and rejects duplicate, unknown and malformed flags", () => {
  assert.deepEqual(parseUsabilityStudyArgs([
    "--baseline=baseline-ref", "--candidate=candidate-ref", "--output=/private/study",
    "--participants=6", "--time-limit-seconds=300",
  ]), {
    baselineRef: "baseline-ref", candidateRef: "candidate-ref", outputPath: "/private/study",
    participantCount: 6, timeLimitSeconds: 300,
  });
  for (const args of [
    ["--baseline=a", "--baseline=b"], ["--participants=6", "--participants=8"],
    ["--unknown=value"], ["--constructor=value"], ["--toString=value"], ["--__proto__=value"],
    ["--baseline", "main"], ["--baseline="], ["main"],
  ]) assert.throws(() => parseUsabilityStudyArgs(args), /Usage/, args.join(" "));
});
