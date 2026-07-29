import assert from "node:assert/strict";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_CLEANUP_POLICY,
  applyLocalArtifactCleanup,
  cleanupHelp,
  formatCleanupReport,
  parseCleanupArguments,
  planLocalArtifactCleanup,
} from "./cleanup-local-artifacts.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

function fixtureRepository() {
  const repoRoot = mkdtempSync(join(tmpdir(), "filament-cleanup-"));
  writeFileSync(
    join(repoRoot, "package.json"),
    JSON.stringify({ name: "bambu-filament-manager", private: true }),
  );
  return repoRoot;
}

function directoryAt(repoRoot, relativePath, nowMs, ageDays, marker = false) {
  const path = join(repoRoot, relativePath);
  mkdirSync(path, { recursive: true });
  const payloadPath = join(path, "payload.bin");
  writeFileSync(payloadPath, relativePath);
  const retainedPaths = [payloadPath];
  if (marker) {
    const markerPath = join(path, ".cleanup-keep");
    writeFileSync(markerPath, "retain");
    retainedPaths.push(markerPath);
  }
  const modified = new Date(nowMs - ageDays * DAY_MS);
  for (const retainedPath of retainedPaths) {
    utimesSync(retainedPath, modified, modified);
  }
  utimesSync(path, modified, modified);
  return path;
}

function testPolicy(overrides = {}) {
  return {
    ...DEFAULT_CLEANUP_POLICY,
    ...overrides,
  };
}

test("cleanup arguments default to a conservative dry run", () => {
  const parsed = parseCleanupArguments([]);
  assert.equal(parsed.apply, false);
  assert.equal(parsed.verbose, false);
  assert.deepEqual(parsed.policy, DEFAULT_CLEANUP_POLICY);

  const explicit = parseCleanupArguments([
    "--apply",
    "--scope",
    "artifacts",
    "--qa-days",
    "0",
    "--release-days",
    "30",
    "--keep-qa",
    "2",
    "--keep-releases",
    "1",
  ]);
  assert.equal(explicit.apply, true);
  assert.deepEqual(explicit.policy, {
    buildDays: 14,
    keepQaArtifacts: 2,
    keepReleaseArtifacts: 1,
    qaDays: 0,
    releaseDays: 30,
    scope: "artifacts",
  });
  assert.throws(
    () => parseCleanupArguments(["--build-days=-1"]),
    /non-negative integer/,
  );
  assert.throws(
    () => parseCleanupArguments(["--scope", "everything"]),
    /scope must be one of/,
  );
});

test("cleanup planning applies age, newest-count and marker retention", () => {
  const repoRoot = fixtureRepository();
  const nowMs = Date.UTC(2026, 0, 31);
  try {
    directoryAt(repoRoot, "target/debug", nowMs, 20);
    directoryAt(repoRoot, "target/release", nowMs, 1);
    directoryAt(repoRoot, "release-artifacts/qa-newest", nowMs, 1);
    directoryAt(repoRoot, "release-artifacts/qa-second", nowMs, 2);
    directoryAt(repoRoot, "release-artifacts/qa-old", nowMs, 20);
    directoryAt(repoRoot, "release-artifacts/qa-retained", nowMs, 40, true);
    directoryAt(repoRoot, "release-artifacts/v2.0.0", nowMs, 70);
    directoryAt(repoRoot, "release-artifacts/v1.1.0", nowMs, 80);
    directoryAt(repoRoot, "release-artifacts/v1.0.0", nowMs, 90);

    const plan = planLocalArtifactCleanup({
      now: nowMs,
      policy: testPolicy({
        buildDays: 7,
        keepQaArtifacts: 2,
        keepReleaseArtifacts: 1,
        qaDays: 10,
        releaseDays: 60,
      }),
      repoRoot,
    });
    const byPath = new Map(
      plan.decisions.map((decision) => [
        decision.relativePath.replaceAll("\\", "/"),
        decision,
      ]),
    );

    assert.equal(byPath.get("debug").action, "remove");
    assert.equal(byPath.get("release").action, "keep");
    assert.equal(byPath.get("qa-newest").action, "keep");
    assert.equal(byPath.get("qa-second").action, "keep");
    assert.equal(byPath.get("qa-old").action, "remove");
    assert.equal(byPath.get("qa-retained").action, "keep");
    assert.equal(byPath.get("qa-retained").reason, ".cleanup-keep");
    assert.equal(byPath.get("v2.0.0").action, "keep");
    assert.equal(byPath.get("v1.1.0").action, "remove");
    assert.equal(byPath.get("v1.0.0").action, "remove");
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("cleanup applies QA retention to runs inside visual-qa", () => {
  const repoRoot = fixtureRepository();
  const nowMs = Date.UTC(2026, 0, 31);
  try {
    directoryAt(repoRoot, "release-artifacts/visual-qa/run-newest", nowMs, 1);
    directoryAt(repoRoot, "release-artifacts/visual-qa/run-second", nowMs, 2);
    directoryAt(repoRoot, "release-artifacts/visual-qa/run-old", nowMs, 20);
    directoryAt(
      repoRoot,
      "release-artifacts/visual-qa/run-retained",
      nowMs,
      40,
      true,
    );

    const plan = planLocalArtifactCleanup({
      now: nowMs,
      policy: testPolicy({
        keepQaArtifacts: 2,
        qaDays: 10,
        scope: "artifacts",
      }),
      repoRoot,
    });
    const byPath = new Map(
      plan.decisions.map((decision) => [
        decision.relativePath.replaceAll("\\", "/"),
        decision,
      ]),
    );

    assert.equal(byPath.has("visual-qa"), false);
    assert.equal(byPath.get("visual-qa/run-newest").action, "keep");
    assert.equal(byPath.get("visual-qa/run-second").action, "keep");
    assert.equal(byPath.get("visual-qa/run-old").action, "remove");
    assert.equal(byPath.get("visual-qa/run-retained").action, "keep");
    assert.equal(
      byPath.get("visual-qa/run-retained").reason,
      ".cleanup-keep",
    );
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("cleanup inherits a retention marker from visual-qa", () => {
  const repoRoot = fixtureRepository();
  const nowMs = Date.UTC(2026, 0, 31);
  try {
    const aggregate = directoryAt(
      repoRoot,
      "release-artifacts/visual-qa",
      nowMs,
      40,
      true,
    );
    directoryAt(repoRoot, "release-artifacts/visual-qa/run-old", nowMs, 40);
    const modified = new Date(nowMs - 40 * DAY_MS);
    utimesSync(aggregate, modified, modified);

    const plan = planLocalArtifactCleanup({
      now: nowMs,
      policy: testPolicy({
        keepQaArtifacts: 0,
        qaDays: 10,
        scope: "artifacts",
      }),
      repoRoot,
    });

    assert.equal(plan.decisions.length, 1);
    assert.equal(plan.decisions[0].relativePath, join("visual-qa", "run-old"));
    assert.equal(plan.decisions[0].action, "keep");
    assert.equal(plan.decisions[0].reason, ".cleanup-keep");
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("cleanup uses the newest recursive Cargo profile modification", () => {
  const repoRoot = fixtureRepository();
  const nowMs = Date.UTC(2026, 0, 31);
  try {
    const profile = directoryAt(repoRoot, "target/debug", nowMs, 20);
    const deps = join(profile, "deps");
    mkdirSync(deps);
    const activeFile = join(deps, "active.bin");
    writeFileSync(activeFile, "active");
    const recent = new Date(nowMs - DAY_MS);
    const old = new Date(nowMs - 20 * DAY_MS);
    utimesSync(activeFile, recent, recent);
    utimesSync(deps, recent, recent);
    utimesSync(profile, old, old);

    const plan = planLocalArtifactCleanup({
      now: nowMs,
      policy: testPolicy({
        buildDays: 7,
        scope: "build",
      }),
      repoRoot,
    });

    assert.equal(plan.decisions.length, 1);
    assert.equal(plan.decisions[0].action, "keep");
    assert.equal(plan.decisions[0].ageDays, 1);
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("cleanup rechecks recursive Cargo activity before removal", () => {
  const repoRoot = fixtureRepository();
  const nowMs = Date.UTC(2026, 0, 31);
  try {
    const profile = directoryAt(repoRoot, "target/debug", nowMs, 20);
    const plan = planLocalArtifactCleanup({
      now: nowMs,
      policy: testPolicy({
        buildDays: 7,
        scope: "build",
      }),
      repoRoot,
    });
    assert.equal(plan.decisions[0].action, "remove");

    const recent = new Date(nowMs - DAY_MS);
    utimesSync(join(profile, "payload.bin"), recent, recent);
    const applied = applyLocalArtifactCleanup(plan, { apply: true });

    assert.equal(applied[0].outcome, "retained");
    assert.equal(applied[0].reason, "changed after cleanup planning");
    assert.ok(lstatDirectory(profile).isDirectory());
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("cleanup stays non-destructive until apply is explicit", () => {
  const repoRoot = fixtureRepository();
  const nowMs = Date.UTC(2026, 0, 31);
  try {
    const oldQa = directoryAt(
      repoRoot,
      "release-artifacts/qa-old",
      nowMs,
      20,
    );
    const plan = planLocalArtifactCleanup({
      now: nowMs,
      policy: testPolicy({
        keepQaArtifacts: 0,
        qaDays: 10,
        scope: "artifacts",
      }),
      repoRoot,
    });

    const dryRun = applyLocalArtifactCleanup(plan);
    assert.equal(dryRun[0].outcome, "would-remove");
    assert.equal(
      dryRun.some((result) => result.path === oldQa),
      true,
    );
    assert.equal(
      plan.decisions.some((decision) => decision.path === oldQa),
      true,
    );

    const applied = applyLocalArtifactCleanup(plan, { apply: true });
    assert.equal(applied[0].outcome, "removed");
    assert.throws(() => lstatDirectory(oldQa), /missing/);
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

function lstatDirectory(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory()) {
      throw new Error("not a directory");
    }
    return stat;
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("missing");
    }
    throw error;
  }
}

test("cleanup rechecks marker and modification time before removal", () => {
  const repoRoot = fixtureRepository();
  const nowMs = Date.UTC(2026, 0, 31);
  try {
    const changed = directoryAt(
      repoRoot,
      "release-artifacts/qa-changed",
      nowMs,
      20,
    );
    const marked = directoryAt(
      repoRoot,
      "release-artifacts/qa-marked-late",
      nowMs,
      20,
    );
    const plan = planLocalArtifactCleanup({
      now: nowMs,
      policy: testPolicy({
        keepQaArtifacts: 0,
        qaDays: 10,
        scope: "artifacts",
      }),
      repoRoot,
    });

    const changedTime = new Date(nowMs - DAY_MS);
    utimesSync(changed, changedTime, changedTime);
    writeFileSync(join(marked, ".cleanup-keep"), "retain");
    const applied = applyLocalArtifactCleanup(plan, { apply: true });
    const byName = new Map(
      applied.map((result) => [result.relativePath, result]),
    );
    assert.equal(byName.get("qa-changed").outcome, "retained");
    assert.equal(
      byName.get("qa-changed").reason,
      "changed after cleanup planning",
    );
    assert.equal(byName.get("qa-marked-late").outcome, "retained");
    assert.equal(byName.get("qa-marked-late").reason, ".cleanup-keep");
    assert.ok(lstatDirectory(changed).isDirectory());
    assert.ok(lstatDirectory(marked).isDirectory());
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("cleanup rechecks an aggregate ancestor marker before removal", () => {
  const repoRoot = fixtureRepository();
  const nowMs = Date.UTC(2026, 0, 31);
  try {
    const aggregate = join(repoRoot, "release-artifacts", "visual-qa");
    const run = directoryAt(
      repoRoot,
      "release-artifacts/visual-qa/run-old",
      nowMs,
      20,
    );
    const plan = planLocalArtifactCleanup({
      now: nowMs,
      policy: testPolicy({
        keepQaArtifacts: 0,
        qaDays: 10,
        scope: "artifacts",
      }),
      repoRoot,
    });
    assert.equal(plan.decisions[0].action, "remove");

    writeFileSync(join(aggregate, ".cleanup-keep"), "retain");
    const applied = applyLocalArtifactCleanup(plan, { apply: true });

    assert.equal(applied[0].outcome, "retained");
    assert.equal(applied[0].reason, ".cleanup-keep");
    assert.ok(lstatDirectory(run).isDirectory());
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test(
  "cleanup ignores symlinked artifact directories",
  { skip: process.platform === "win32" },
  () => {
    const repoRoot = fixtureRepository();
    const outside = mkdtempSync(join(tmpdir(), "filament-cleanup-outside-"));
    try {
      mkdirSync(join(repoRoot, "release-artifacts"), { recursive: true });
      symlinkSync(
        outside,
        join(repoRoot, "release-artifacts", "qa-symlink"),
        "dir",
      );
      const plan = planLocalArtifactCleanup({
        now: Date.UTC(2026, 0, 31),
        policy: testPolicy({
          keepQaArtifacts: 0,
          qaDays: 0,
          scope: "artifacts",
        }),
        repoRoot,
      });
      assert.equal(plan.decisions.length, 0);
    } finally {
      rmSync(repoRoot, { force: true, recursive: true });
      rmSync(outside, { force: true, recursive: true });
    }
  },
);

test(
  "cleanup refuses symlinked cleanup roots",
  { skip: process.platform === "win32" },
  () => {
    for (const [directoryName, scope] of [
      ["target", "build"],
      ["release-artifacts", "artifacts"],
    ]) {
      const repoRoot = fixtureRepository();
      const outside = mkdtempSync(join(tmpdir(), "filament-cleanup-outside-"));
      try {
        symlinkSync(outside, join(repoRoot, directoryName), "dir");
        assert.throws(
          () =>
            planLocalArtifactCleanup({
              now: Date.UTC(2026, 0, 31),
              policy: testPolicy({ scope }),
              repoRoot,
            }),
          /cleanup root .* must not be a symbolic link/,
        );
        assert.ok(lstatDirectory(outside).isDirectory());
      } finally {
        rmSync(repoRoot, { force: true, recursive: true });
        rmSync(outside, { force: true, recursive: true });
      }
    }
  },
);

test(
  "cleanup refuses a symlinked candidate ancestor introduced after planning",
  { skip: process.platform === "win32" },
  () => {
    const repoRoot = fixtureRepository();
    const outside = mkdtempSync(join(tmpdir(), "filament-cleanup-outside-"));
    const nowMs = Date.UTC(2026, 0, 31);
    try {
      directoryAt(
        repoRoot,
        "release-artifacts/visual-qa/run-old",
        nowMs,
        20,
      );
      const plan = planLocalArtifactCleanup({
        now: nowMs,
        policy: testPolicy({
          keepQaArtifacts: 0,
          qaDays: 10,
          scope: "artifacts",
        }),
        repoRoot,
      });
      assert.equal(plan.decisions.length, 1);
      assert.equal(plan.decisions[0].action, "remove");

      const aggregate = join(repoRoot, "release-artifacts", "visual-qa");
      renameSync(aggregate, `${aggregate}-original`);
      const outsideRun = directoryAt(outside, "run-old", nowMs, 20);
      symlinkSync(outside, aggregate, "dir");

      assert.throws(
        () => applyLocalArtifactCleanup(plan, { apply: true }),
        /Refusing cleanup through symbolic link/,
      );
      assert.ok(lstatDirectory(outsideRun).isDirectory());
    } finally {
      rmSync(repoRoot, { force: true, recursive: true });
      rmSync(outside, { force: true, recursive: true });
    }
  },
);

test(
  "cleanup refuses a symlinked cleanup root introduced after planning",
  { skip: process.platform === "win32" },
  () => {
    const repoRoot = fixtureRepository();
    const outside = mkdtempSync(join(tmpdir(), "filament-cleanup-outside-"));
    const nowMs = Date.UTC(2026, 0, 31);
    try {
      directoryAt(repoRoot, "release-artifacts/qa-old", nowMs, 20);
      const plan = planLocalArtifactCleanup({
        now: nowMs,
        policy: testPolicy({
          keepQaArtifacts: 0,
          qaDays: 10,
          scope: "artifacts",
        }),
        repoRoot,
      });
      assert.equal(plan.decisions.length, 1);
      assert.equal(plan.decisions[0].action, "remove");

      const artifactRoot = join(repoRoot, "release-artifacts");
      renameSync(artifactRoot, `${artifactRoot}-original`);
      const outsideQa = directoryAt(outside, "qa-old", nowMs, 20);
      symlinkSync(outside, artifactRoot, "dir");

      assert.throws(
        () => applyLocalArtifactCleanup(plan, { apply: true }),
        /cleanup root release-artifacts\/ must not be a symbolic link/,
      );
      assert.ok(lstatDirectory(outsideQa).isDirectory());
    } finally {
      rmSync(repoRoot, { force: true, recursive: true });
      rmSync(outside, { force: true, recursive: true });
    }
  },
);

test(
  "recursive Cargo activity scan does not follow directory symlinks",
  { skip: process.platform === "win32" },
  () => {
    const repoRoot = fixtureRepository();
    const outside = mkdtempSync(join(tmpdir(), "filament-cleanup-outside-"));
    const nowMs = Date.UTC(2026, 0, 31);
    try {
      const profile = directoryAt(repoRoot, "target/debug", nowMs, 20);
      directoryAt(outside, "recent-build", nowMs, 1);
      symlinkSync(join(outside, "recent-build"), join(profile, "linked"), "dir");
      const old = new Date(nowMs - 20 * DAY_MS);
      utimesSync(profile, old, old);

      const plan = planLocalArtifactCleanup({
        now: nowMs,
        policy: testPolicy({
          buildDays: 7,
          scope: "build",
        }),
        repoRoot,
      });

      assert.equal(plan.decisions.length, 1);
      assert.equal(plan.decisions[0].action, "remove");
    } finally {
      rmSync(repoRoot, { force: true, recursive: true });
      rmSync(outside, { force: true, recursive: true });
    }
  },
);

test("cleanup refuses an unexpected repository root", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "filament-cleanup-wrong-root-"));
  try {
    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "another-project" }),
    );
    assert.throws(
      () =>
        planLocalArtifactCleanup({
          policy: DEFAULT_CLEANUP_POLICY,
          repoRoot,
        }),
      /not the Filament Manager repository/,
    );
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("cleanup refuses a tampered plan outside repository artifact roots", () => {
  const repoRoot = fixtureRepository();
  const outside = mkdtempSync(join(tmpdir(), "filament-cleanup-tampered-"));
  try {
    const modified = new Date(Date.UTC(2026, 0, 1));
    utimesSync(outside, modified, modified);
    const plan = {
      decisions: [
        {
          action: "remove",
          ageDays: 30,
          category: "qa",
          mtimeMs: modified.getTime(),
          path: outside,
          reason: "tampered",
          relativePath: "outside",
          root: tmpdir(),
        },
      ],
      policy: DEFAULT_CLEANUP_POLICY,
      repoRoot,
    };
    assert.throws(
      () => applyLocalArtifactCleanup(plan, { apply: true }),
      /outside repository artifact roots/,
    );
    assert.ok(lstatDirectory(outside).isDirectory());
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
    rmSync(outside, { force: true, recursive: true });
  }
});

test("cleanup report makes dry-run and apply behavior explicit", () => {
  const repoRoot = fixtureRepository();
  const nowMs = Date.UTC(2026, 0, 31);
  try {
    directoryAt(repoRoot, "release-artifacts/qa-old", nowMs, 20);
    const plan = planLocalArtifactCleanup({
      now: nowMs,
      policy: testPolicy({
        keepQaArtifacts: 0,
        qaDays: 10,
        scope: "artifacts",
      }),
      repoRoot,
    });
    const results = applyLocalArtifactCleanup(plan);
    const report = formatCleanupReport({
      apply: false,
      plan,
      results,
    });
    assert.match(report, /dry run/);
    assert.match(report, /Would remove:/);
    assert.match(report, /--apply/);
    assert.match(report, /\.cleanup-keep/);
    assert.match(cleanupHelp(), /dry run unless --apply/);
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});
