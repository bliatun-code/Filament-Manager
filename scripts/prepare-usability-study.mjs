import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, mkdirSync, readFileSync, realpathSync,
  rmSync, writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { MIN_PARTICIPANTS, USABILITY_BUILDS, USABILITY_TASKS } from "./analyze-usability-results.mjs";
import { createVisualQaFixture, VISUAL_QA_SEED_SHA256 } from "./create-visual-qa-fixture.mjs";
import { renderUsabilityTaskCards } from "./usability-study-tasks.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const USAGE = "Usage: npm run qa:usability:prepare -- --baseline=<git-ref> " +
  "--candidate=<git-ref> --output=<new-directory-outside-repo> " +
  "[--participants=6] [--time-limit-seconds=600]";

function git(repositoryRoot, ...args) {
  return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function buildIdentity(ref, repositoryRoot) {
  if (typeof ref !== "string" || !ref.trim()) throw new Error(USAGE);
  const commit = git(repositoryRoot, "rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`);
  const source = git(repositoryRoot, "show", `${commit}:src/backend/database_schema.rs`);
  const schemaVersion = Number(source.match(/CURRENT_SCHEMA_VERSION:\s*i64\s*=\s*(\d+)/)?.[1]);
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 2) {
    throw new Error("Each study build must support the schema-2 synthetic fixture.");
  }
  return { commit, schema_version: schemaVersion, artifact_path: null, artifact_sha256: null, launch_verified: false };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function privateFile(path, contents) {
  writeFileSync(path, contents, { flag: "wx", mode: 0o600 });
}

function prepareFixture(path) {
  createVisualQaFixture({ outputPath: path });
  const db = new Database(path);
  try {
    db.pragma("foreign_keys = ON");
    db.transaction(() => {
      // These edits apply only to the freshly generated, reviewed QA seed.
      // Keep the lending target available and provide a partial-receipt task.
      const freed = db.prepare("UPDATE ams_slots SET spool_id = NULL WHERE id = ? AND spool_id = ?")
        .run("qa_bambu_slot_3", "spool_demo_100004");
      const ordered = db.prepare("UPDATE wishlist_items SET status = 'ON_ORDER', quantity = 2 WHERE id = ?")
        .run("qa_wishlist_white_pla");
      // Both builds create GENERIC storage locations. CONTAINER exists only in
      // the visual QA seed and newer builds reject it as a system location.
      const dryBox = db.prepare("UPDATE inventory_locations SET type = 'GENERIC' WHERE id = ? AND type = 'CONTAINER'")
        .run("QA Dry box");
      if (freed.changes !== 1 || ordered.changes !== 1 || dryBox.changes !== 1) {
        throw new Error("Usability fixture no longer matches the task cards.");
      }
      db.prepare("DELETE FROM settings WHERE key LIKE 'bambu_live_integration:%'").run();
      const setting = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      for (const [key, value] of [
        ["trusted_lan_enabled", "0"], ["library_sync_mode", "STANDALONE"],
        ["app_language", "en"], ["theme_mode", "dark"],
      ]) setting.run(key, value);
    })();
    if (db.pragma("quick_check", { simple: true }) !== "ok" || db.pragma("foreign_key_check").length) {
      throw new Error("Usability fixture failed database integrity checks.");
    }
  } finally {
    db.close();
  }
}

function instructions() {
  return `# Prepared usability study

Status: **not started**. This directory contains synthetic data and unfilled
measurement records. No participant results or app-launch evidence were generated.

1. Complete the artifact paths/checksums and machine/display/input details in
   \`study.json\`. Verify that the artifacts match the recorded commits. Keep the
   same locale, theme, machine and input method for both builds. Select and
   verify English and Dark, and turn off **General > Updates > Check automatically**
   in each app before timing so update prompts do not interrupt the task.
   Separate databases do not reset the app's local UI preferences. Record
   \`preferences_verified\`.
   Follow the native isolation procedure in \`docs/USABILITY_TEST_PROTOCOL.md\`
   before launch. On macOS, build each pinned ref with a distinct compiled
   study-only app identifier and an incognito main webview, or use a VM for
   unchanged official binaries. Renaming the bundle is not sufficient.
   Record any study build overlays alongside artifact checksums.
2. Rehearse both builds with disposable copies of \`fixture.db\`. Confirm the five
   starting states and task outcomes before recruiting or timing participants.
   Record successful rehearsal with \`launch_verified\`; preparation alone does
   not prove installed-build compatibility. Keep rehearsal copies outside
   \`sessions/\` and preserve every unmeasured participant record.
   Check the catalog after startup: each build seeds its own bundled catalog,
   so identical input files may produce different runtime catalogs. Record
   those versions/counts and the comparison scope before collecting timings.
   Confirm fixture identities remain intact, and take task before snapshots
   after startup migrations and catalog seeding have settled.
3. Assign the pseudonymous participant slots to actual people. Follow each
   planned build order and record the actual order. With an odd participant
   count the two groups differ by one; record this protocol choice in advance.
4. Quit the app process before each task. Launch the exact executable in the
   isolated study artifact with \`FILAMENT_MANAGER_DB_PATH\` pointing to that
   task's database from \`study.json\` and \`FILAMENT_MANAGER_VISUAL_QA=1\` to
   avoid saved desktop lifecycle preferences. Do not set a visual-QA scenario
   or packaged-test override. Do not launch by clicking the bundle, which
   omits these environment overrides. Each task/build/participant has a separate
   fresh database. Never launch a study against the app's normal library or the
   read-only \`fixture.db\`. Select English and Dark and turn off automatic update
   checks again after every incognito launch; the QA flag alone does not set them.
5. Establish the starting state from \`task-cards.md\` outside the timer. Read
   only the participant card aloud. Keep the moderator answer key private.
6. Record observed elapsed milliseconds and outcomes in \`results.json\`.
   Nulls mean unmeasured; never replace them with invented values. Stop at
   verified success, an unrecoverable error, participant withdrawal, or the
   predeclared time limit. For unsuccessful attempts record actual elapsed
   time and \`completed: false\`. Any workflow help sets \`assisted: true\`.
7. If a task needs to be repeated, document the deviation before interpreting
   results. Preserve the original attempt; do not silently select a better run.

Run the analyzer from the repository after every required record is complete:

\`\`\`sh
npm run --silent qa:usability:analyze -- /absolute/path/to/study/results.json
\`\`\`

The unfilled template deliberately fails analysis. The manifest is a separate
moderator record: the analyzer cannot verify artifact identity, actual order,
rehearsal or human participation. Review total and per-task matched timing
counts before interpreting a PASS; the current timing gate has no separate
minimum number of comparable pairs. Keep raw records private and share only
reviewed aggregate evidence with build/fixture identities. Keep \`--silent\`
when collecting output for sharing so npm does not echo the private input path.
`;
}

export function prepareUsabilityStudy({ baselineRef, candidateRef, outputPath, participantCount = 6, timeLimitSeconds = 600, repositoryRoot = REPOSITORY_ROOT }) {
  if (!Number.isSafeInteger(participantCount) || participantCount < MIN_PARTICIPANTS || participantCount > 100) {
    throw new Error(`Participants must be an integer from ${MIN_PARTICIPANTS} to 100.`);
  }
  if (!Number.isSafeInteger(timeLimitSeconds) || timeLimitSeconds < 1 || timeLimitSeconds > 3600) {
    throw new Error("The task time limit must be an integer from 1 to 3600 seconds.");
  }
  if (typeof outputPath !== "string" || !outputPath.trim()) throw new Error(USAGE);
  const requested = resolve(outputPath);
  // The parent must already exist. Canonicalize it to catch symlinks into this repo.
  const output = resolve(realpathSync(dirname(requested)), basename(requested));
  const fromRepository = relative(realpathSync(repositoryRoot), output);
  if (!fromRepository || (!fromRepository.startsWith(`..${sep}`) && fromRepository !== ".." && !isAbsolute(fromRepository))) {
    throw new Error("Study output must be outside the repository.");
  }
  const builds = { baseline: buildIdentity(baselineRef, repositoryRoot), candidate: buildIdentity(candidateRef, repositoryRoot) };
  if (builds.baseline.commit === builds.candidate.commit) throw new Error("Baseline and candidate must be different commits.");
  // Never reuse or overwrite a directory that may already contain human results.
  mkdirSync(output, { mode: 0o700 });
  try {
    const fixturePath = resolve(output, "fixture.db");
    prepareFixture(fixturePath);
    const participants = [];
    const results = [];
    for (let index = 0; index < participantCount; index += 1) {
      const id = `P${String(index + 1).padStart(2, "0")}`;
      const order = index % 2 === 0 ? [...USABILITY_BUILDS] : [...USABILITY_BUILDS].reverse();
      const sessions = [];
      for (const build of order) {
        for (const task of USABILITY_TASKS) {
          const database = `sessions/${id}/${build}/${task}.db`;
          const destination = resolve(output, ...database.split("/"));
          mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
          copyFileSync(fixturePath, destination, constants.COPYFILE_EXCL);
          chmodSync(destination, 0o600);
          sessions.push({ build, task, database });
          results.push({ participant_id: id, build, task, duration_ms: null, completed: null, assisted: null, critical_error: null });
        }
      }
      participants.push({ participant_id: id, planned_build_order: order, actual_build_order: null, sessions });
    }
    const manifest = {
      format: "filament-manager-usability-study-v1", status: "not_started",
      builds, tooling_commit: git(repositoryRoot, "rev-parse", "HEAD"),
      fixture: { file: "fixture.db", schema_version: 2, seed_sha256: VISUAL_QA_SEED_SHA256, sha256: sha256(fixturePath), task_setup_version: 2 },
      setup: { machine_class: null, display_size: null, input_method: null, locale: "en", theme: "dark", automatic_update_checks: false, preferences_verified: false, task_time_limit_ms: timeLimitSeconds * 1000 },
      participants, protocol_deviations: [],
    };
    privateFile(resolve(output, "study.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    privateFile(resolve(output, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
    privateFile(resolve(output, "task-cards.md"), renderUsabilityTaskCards());
    privateFile(resolve(output, "README.md"), instructions());
    chmodSync(fixturePath, 0o400);
    return { outputPath: output, participantCount, recordCount: results.length, manifest };
  } catch (error) {
    // Only this invocation's newly created synthetic directory is eligible.
    rmSync(output, { recursive: true, force: true });
    throw error;
  }
}

export function parseUsabilityStudyArgs(args) {
  const names = { baseline: "baselineRef", candidate: "candidateRef", output: "outputPath", participants: "participantCount", "time-limit-seconds": "timeLimitSeconds" };
  const options = {};
  for (const arg of args) {
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    const name = match && Object.hasOwn(names, match[1]) && names[match[1]];
    if (!name || Object.hasOwn(options, name)) throw new Error(USAGE);
    options[name] = ["participantCount", "timeLimitSeconds"].includes(name) ? Number(match[2]) : match[2];
  }
  return options;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = prepareUsabilityStudy(parseUsabilityStudyArgs(process.argv.slice(2)));
    console.log(`Prepared ${result.participantCount} participant slots and ${result.recordCount} unmeasured records: ${result.outputPath}`);
    console.log("Study status: NOT STARTED. Rehearse both builds and collect real participant measurements.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
