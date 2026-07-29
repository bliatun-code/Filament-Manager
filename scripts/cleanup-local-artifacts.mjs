import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MARKER = ".cleanup-keep";
const RELEASE_DIRECTORY_PATTERN =
  /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z][0-9A-Za-z.-]*)?$/;
const AGGREGATE_QA_DIRECTORIES = new Set(["visual-qa"]);
const VALID_SCOPES = new Set(["all", "artifacts", "build"]);

export const DEFAULT_CLEANUP_POLICY = Object.freeze({
  buildDays: 14,
  keepQaArtifacts: 5,
  keepReleaseArtifacts: 3,
  qaDays: 14,
  releaseDays: 90,
  scope: "all",
});

function nonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
}

export function parseCleanupArguments(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      apply: { type: "boolean", default: false },
      "build-days": {
        type: "string",
        default: String(DEFAULT_CLEANUP_POLICY.buildDays),
      },
      help: { type: "boolean", default: false },
      "keep-qa": {
        type: "string",
        default: String(DEFAULT_CLEANUP_POLICY.keepQaArtifacts),
      },
      "keep-releases": {
        type: "string",
        default: String(DEFAULT_CLEANUP_POLICY.keepReleaseArtifacts),
      },
      "qa-days": {
        type: "string",
        default: String(DEFAULT_CLEANUP_POLICY.qaDays),
      },
      "release-days": {
        type: "string",
        default: String(DEFAULT_CLEANUP_POLICY.releaseDays),
      },
      scope: { type: "string", default: DEFAULT_CLEANUP_POLICY.scope },
      verbose: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (!VALID_SCOPES.has(values.scope)) {
    throw new Error(
      `scope must be one of: ${Array.from(VALID_SCOPES).join(", ")}.`,
    );
  }

  return {
    apply: values.apply,
    help: values.help,
    policy: {
      buildDays: nonNegativeInteger(values["build-days"], "build-days"),
      keepQaArtifacts: nonNegativeInteger(values["keep-qa"], "keep-qa"),
      keepReleaseArtifacts: nonNegativeInteger(
        values["keep-releases"],
        "keep-releases",
      ),
      qaDays: nonNegativeInteger(values["qa-days"], "qa-days"),
      releaseDays: nonNegativeInteger(
        values["release-days"],
        "release-days",
      ),
      scope: values.scope,
    },
    verbose: values.verbose,
  };
}

function assertRepositoryRoot(repoRoot) {
  const packagePath = join(repoRoot, "package.json");
  if (!existsSync(packagePath)) {
    throw new Error(`Refusing cleanup: package.json is missing from ${repoRoot}.`);
  }
  const packageManifest = JSON.parse(readFileSync(packagePath, "utf8"));
  if (packageManifest.name !== "bambu-filament-manager") {
    throw new Error(
      `Refusing cleanup: ${repoRoot} is not the Filament Manager repository.`,
    );
  }
}

function isWithin(parent, candidate) {
  const relativePath = relative(parent, candidate);
  return (
    relativePath.length > 0 &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return null;
    }
    throw error;
  }
}

function validateCleanupRoot(repoRoot, directoryName) {
  const path = resolve(repoRoot, directoryName);
  const stat = lstatIfPresent(path);
  if (!stat) {
    return { exists: false, path, realPath: null };
  }
  if (stat.isSymbolicLink()) {
    throw new Error(
      `Refusing cleanup: repository cleanup root ${directoryName}/ must not be a symbolic link.`,
    );
  }
  if (!stat.isDirectory()) {
    throw new Error(
      `Refusing cleanup: repository cleanup root ${directoryName}/ is not a directory.`,
    );
  }

  const realRepoRoot = realpathSync(repoRoot);
  const realPath = realpathSync(path);
  if (!isWithin(realRepoRoot, realPath)) {
    throw new Error(
      `Refusing cleanup: repository cleanup root ${directoryName}/ resolves outside the repository.`,
    );
  }
  return { exists: true, path, realPath };
}

function newestTreeMtimeMs(path, initialStat) {
  let newestMtimeMs = initialStat.mtimeMs;
  const conservativeMtimeMs = Date.now();
  const pending = [path];

  while (pending.length > 0) {
    const directory = pending.pop();
    const directoryStat = lstatIfPresent(directory);
    if (!directoryStat) {
      return Math.max(newestMtimeMs, conservativeMtimeMs);
    }
    if (directoryStat.isSymbolicLink()) {
      continue;
    }
    if (!directoryStat.isDirectory()) {
      return Math.max(newestMtimeMs, conservativeMtimeMs);
    }
    newestMtimeMs = Math.max(newestMtimeMs, directoryStat.mtimeMs);

    const entries = readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const childPath = join(directory, entry.name);
      const childStat = lstatIfPresent(childPath);
      if (!childStat) {
        return Math.max(newestMtimeMs, conservativeMtimeMs);
      }
      if (childStat.isSymbolicLink()) {
        continue;
      }
      newestMtimeMs = Math.max(newestMtimeMs, childStat.mtimeMs);
      if (childStat.isDirectory()) {
        pending.push(childPath);
      }
    }

    const finalDirectoryStat = lstatIfPresent(directory);
    if (!finalDirectoryStat || !finalDirectoryStat.isDirectory()) {
      return Math.max(newestMtimeMs, conservativeMtimeMs);
    }
    newestMtimeMs = Math.max(newestMtimeMs, finalDirectoryStat.mtimeMs);
  }

  return newestMtimeMs;
}

function safeDirectoryInfo(
  path,
  { recursiveMtime = false, retainedByAncestor = false } = {},
) {
  const stat = lstatIfPresent(path);
  if (!stat) {
    return null;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return null;
  }
  return {
    directoryMtimeMs: stat.mtimeMs,
    mtimeMs: recursiveMtime ? newestTreeMtimeMs(path, stat) : stat.mtimeMs,
    path,
    retainedByMarker:
      retainedByAncestor || existsSync(join(path, RETENTION_MARKER)),
  };
}

function ageInDays(mtimeMs, nowMs) {
  return Math.max(0, (nowMs - mtimeMs) / DAY_MS);
}

function cleanupDecision({
  ageDays,
  category,
  info,
  keep,
  reason,
  root,
}) {
  return {
    action: keep ? "keep" : "remove",
    ageDays,
    category,
    mtimeMs: info.mtimeMs,
    path: info.path,
    reason,
    relativePath: relative(root, info.path),
    root,
  };
}

function buildProfileDirectories(repoRoot) {
  const target = validateCleanupRoot(repoRoot, "target");
  const targetRoot = target.path;
  const profiles = [];

  if (!target.exists) {
    return { profiles, targetRoot };
  }

  for (const profile of ["debug", "release"]) {
    const info = safeDirectoryInfo(join(targetRoot, profile), {
      recursiveMtime: true,
    });
    if (info) {
      profiles.push(info);
    }
  }

  for (const entry of readdirSync(targetRoot, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      entry.name === "debug" ||
      entry.name === "release"
    ) {
      continue;
    }
    for (const profile of ["debug", "release"]) {
      const info = safeDirectoryInfo(join(targetRoot, entry.name, profile), {
        recursiveMtime: true,
      });
      if (info) {
        profiles.push(info);
      }
    }
  }
  return { profiles, targetRoot };
}

function buildDecisions(repoRoot, nowMs, policy) {
  const { profiles, targetRoot } = buildProfileDirectories(repoRoot);
  return profiles.map((info) => {
    const ageDays = ageInDays(info.mtimeMs, nowMs);
    if (info.retainedByMarker) {
      return cleanupDecision({
        ageDays,
        category: "build",
        info,
        keep: true,
        reason: RETENTION_MARKER,
        root: targetRoot,
      });
    }
    const keep = ageDays < policy.buildDays;
    return cleanupDecision({
      ageDays,
      category: "build",
      info,
      keep,
      reason: keep
        ? `newer than ${policy.buildDays} days`
        : `at least ${policy.buildDays} days old`,
      root: targetRoot,
    });
  });
}

function artifactCategory(name) {
  return RELEASE_DIRECTORY_PATTERN.test(name) ? "release" : "qa";
}

function aggregateQaCandidates(artifactRoot, aggregateName) {
  const aggregatePath = join(artifactRoot, aggregateName);
  const aggregateInfo = safeDirectoryInfo(aggregatePath);
  if (!aggregateInfo) {
    return [];
  }

  return readdirSync(aggregatePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) =>
      safeDirectoryInfo(join(aggregatePath, entry.name), {
        retainedByAncestor: aggregateInfo.retainedByMarker,
      }),
    )
    .filter(Boolean)
    .map((info) => ({ ...info, category: "qa" }));
}

function artifactDecisions(repoRoot, nowMs, policy) {
  const artifacts = validateCleanupRoot(repoRoot, "release-artifacts");
  const artifactRoot = artifacts.path;
  if (!artifacts.exists) {
    return [];
  }

  const candidates = [];
  for (const entry of readdirSync(artifactRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      continue;
    }
    if (AGGREGATE_QA_DIRECTORIES.has(entry.name)) {
      candidates.push(...aggregateQaCandidates(artifactRoot, entry.name));
      continue;
    }
    const info = safeDirectoryInfo(join(artifactRoot, entry.name));
    if (info) {
      candidates.push({
        ...info,
        category: artifactCategory(entry.name),
      });
    }
  }

  const decisions = [];
  for (const category of ["qa", "release"]) {
    const ordered = candidates
      .filter((candidate) => candidate.category === category)
      .sort((left, right) => right.mtimeMs - left.mtimeMs);
    const keepCount =
      category === "release"
        ? policy.keepReleaseArtifacts
        : policy.keepQaArtifacts;
    const maxAge =
      category === "release" ? policy.releaseDays : policy.qaDays;
    const newest = new Set(
      ordered
        .filter((candidate) => !candidate.retainedByMarker)
        .slice(0, keepCount)
        .map((candidate) => candidate.path),
    );

    for (const info of ordered) {
      const ageDays = ageInDays(info.mtimeMs, nowMs);
      if (info.retainedByMarker) {
        decisions.push(
          cleanupDecision({
            ageDays,
            category,
            info,
            keep: true,
            reason: RETENTION_MARKER,
            root: artifactRoot,
          }),
        );
      } else if (newest.has(info.path)) {
        decisions.push(
          cleanupDecision({
            ageDays,
            category,
            info,
            keep: true,
            reason: `one of the newest ${keepCount}`,
            root: artifactRoot,
          }),
        );
      } else {
        const keep = ageDays < maxAge;
        decisions.push(
          cleanupDecision({
            ageDays,
            category,
            info,
            keep,
            reason: keep
              ? `newer than ${maxAge} days`
              : `at least ${maxAge} days old`,
            root: artifactRoot,
          }),
        );
      }
    }
  }
  return decisions;
}

export function planLocalArtifactCleanup({
  now = new Date(),
  policy = DEFAULT_CLEANUP_POLICY,
  repoRoot,
}) {
  const resolvedRoot = resolve(repoRoot);
  assertRepositoryRoot(resolvedRoot);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) {
    throw new Error("Cleanup time must be a valid Date or millisecond timestamp.");
  }

  const decisions = [];
  if (policy.scope === "all" || policy.scope === "build") {
    decisions.push(...buildDecisions(resolvedRoot, nowMs, policy));
  }
  if (policy.scope === "all" || policy.scope === "artifacts") {
    decisions.push(...artifactDecisions(resolvedRoot, nowMs, policy));
  }
  return {
    decisions,
    policy,
    repoRoot: resolvedRoot,
  };
}

function validateCandidateAncestry(root, candidate) {
  const rootPath = resolve(root.path);
  const candidatePath = resolve(candidate);
  if (!isWithin(rootPath, candidatePath)) {
    throw new Error(`Refusing unsafe cleanup path: ${candidate}`);
  }

  let currentPath = rootPath;
  const relativePath = relative(rootPath, candidatePath);
  for (const segment of relativePath.split(sep)) {
    currentPath = join(currentPath, segment);
    const stat = lstatIfPresent(currentPath);
    if (!stat) {
      return null;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Refusing cleanup through symbolic link: ${currentPath}`,
      );
    }
    if (!stat.isDirectory()) {
      return null;
    }
  }

  const realCandidate = realpathSync(candidatePath);
  if (!isWithin(root.realPath, realCandidate)) {
    throw new Error(
      `Refusing cleanup path that resolves outside its cleanup root: ${candidate}`,
    );
  }
  return lstatSync(candidatePath);
}

function retainedByMarkerInAncestry(root, candidate) {
  const rootPath = resolve(root);
  let currentPath = resolve(candidate);
  while (isWithin(rootPath, currentPath)) {
    if (existsSync(join(currentPath, RETENTION_MARKER))) {
      return true;
    }
    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }
  return false;
}

function assertSafeRemoval(decision, repoRoot) {
  const allowedRoots = new Map([
    [resolve(repoRoot, "release-artifacts"), "release-artifacts"],
    [resolve(repoRoot, "target"), "target"],
  ]);
  const directoryName = allowedRoots.get(resolve(decision.root));
  if (!directoryName) {
    throw new Error(
      `Refusing cleanup outside repository artifact roots: ${decision.root}`,
    );
  }
  const root = validateCleanupRoot(repoRoot, directoryName);
  if (!root.exists) {
    return { remove: false, reason: "cleanup root is no longer present" };
  }
  if (!validateCandidateAncestry(root, decision.path)) {
    return { remove: false, reason: "already absent or no longer a directory" };
  }
  if (retainedByMarkerInAncestry(root.path, decision.path)) {
    return { remove: false, reason: RETENTION_MARKER };
  }
  const current = safeDirectoryInfo(decision.path, {
    recursiveMtime: decision.category === "build",
  });
  if (!current) {
    return { remove: false, reason: "already absent or no longer a directory" };
  }
  if (current.retainedByMarker) {
    return { remove: false, reason: RETENTION_MARKER };
  }
  if (current.mtimeMs !== decision.mtimeMs) {
    return { remove: false, reason: "changed after cleanup planning" };
  }
  const finalRoot = validateCleanupRoot(repoRoot, directoryName);
  if (!finalRoot.exists) {
    return { remove: false, reason: "cleanup root is no longer present" };
  }
  const finalStat = validateCandidateAncestry(finalRoot, decision.path);
  if (!finalStat) {
    return { remove: false, reason: "already absent or no longer a directory" };
  }
  if (retainedByMarkerInAncestry(finalRoot.path, decision.path)) {
    return { remove: false, reason: RETENTION_MARKER };
  }
  if (finalStat.mtimeMs !== current.directoryMtimeMs) {
    return { remove: false, reason: "changed during cleanup verification" };
  }
  return { remove: true };
}

export function applyLocalArtifactCleanup(
  plan,
  { apply = false, removeDirectory = rmSync } = {},
) {
  const results = [];
  for (const decision of plan.decisions) {
    if (decision.action !== "remove") {
      results.push({ ...decision, outcome: "retained" });
      continue;
    }
    if (!apply) {
      results.push({ ...decision, outcome: "would-remove" });
      continue;
    }
    const safety = assertSafeRemoval(decision, plan.repoRoot);
    if (!safety.remove) {
      results.push({
        ...decision,
        outcome: "retained",
        reason: safety.reason,
      });
      continue;
    }
    removeDirectory(decision.path, {
      force: false,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
    results.push({ ...decision, outcome: "removed" });
  }
  return results;
}

function formatPolicy(policy) {
  return [
    `build profiles: ${policy.buildDays} days`,
    `QA artifacts: ${policy.qaDays} days, keep newest ${policy.keepQaArtifacts}`,
    `release artifacts: ${policy.releaseDays} days, keep newest ${policy.keepReleaseArtifacts}`,
  ].join("; ");
}

export function formatCleanupReport({
  apply,
  plan,
  results,
  verbose = false,
}) {
  const changed = results.filter((result) =>
    ["removed", "would-remove"].includes(result.outcome),
  );
  const retained = results.filter((result) => result.outcome === "retained");
  const lines = [
    `Local artifact cleanup (${apply ? "apply" : "dry run"})`,
    `Policy: ${formatPolicy(plan.policy)}.`,
  ];

  if (changed.length === 0) {
    lines.push(apply ? "Nothing was removed." : "Nothing is eligible for removal.");
  } else {
    lines.push(apply ? "Removed:" : "Would remove:");
    for (const result of changed.slice(0, 40)) {
      lines.push(
        `  - ${relative(plan.repoRoot, result.path)} (${result.category}, ${result.ageDays.toFixed(1)} days old)`,
      );
    }
    if (changed.length > 40) {
      lines.push(`  - …and ${changed.length - 40} more`);
    }
  }

  lines.push(
    `Summary: ${changed.length} ${apply ? "removed" : "eligible"}, ${retained.length} retained.`,
  );
  if (verbose && retained.length > 0) {
    lines.push("Retained:");
    for (const result of retained) {
      lines.push(
        `  - ${relative(plan.repoRoot, result.path)} (${result.reason})`,
      );
    }
  }
  if (!apply && changed.length > 0) {
    lines.push("Run again with --apply to apply the same policy-based cleanup.");
  }
  lines.push(
    `Place ${RETENTION_MARKER} inside any build profile or artifact directory that must always be retained.`,
  );
  return lines.join("\n");
}

export function cleanupHelp() {
  return `Usage: npm run cleanup:local -- [options]

The command is a dry run unless --apply is supplied.

Options:
  --apply                 Remove eligible directories
  --scope <all|build|artifacts>
  --build-days <days>     Remove Cargo profiles after this tree-inactivity age (default: 14)
  --qa-days <days>        Remove QA run directories after this age (default: 14)
  --release-days <days>   Remove release artifacts after this age (default: 90)
  --keep-qa <count>       Always keep this many newest QA run directories (default: 5)
  --keep-releases <count> Always keep this many newest release directories (default: 3)
  --verbose               List retained directories and reasons
  --help                  Show this help

Use an age of 0 only when you intentionally want currently recent outputs to
be eligible. A ${RETENTION_MARKER} marker always wins over age and count rules.`;
}

async function main() {
  const options = parseCleanupArguments(process.argv.slice(2));
  if (options.help) {
    console.log(cleanupHelp());
    return;
  }
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const plan = planLocalArtifactCleanup({
    policy: options.policy,
    repoRoot,
  });
  const results = applyLocalArtifactCleanup(plan, { apply: options.apply });
  console.log(
    formatCleanupReport({
      apply: options.apply,
      plan,
      results,
      verbose: options.verbose,
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
