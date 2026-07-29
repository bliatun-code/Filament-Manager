import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  auditPublicMirror,
  evaluatePublicMirrorInventory,
  parseLocalGitIdentity,
  parseNulList,
  parseObjectInventory,
  parseObjectListing,
  parseRawCommit,
} from "./audit-public-mirror.mjs";

const COMMIT_ID = "a".repeat(40);
const TREE_ID = "b".repeat(40);
const README_ID = "c".repeat(40);
const PUBLIC_IDENTITY = {
  email: "public-maintainer@example.invalid",
  name: "Public Maintainer",
};

function evaluate(overrides = {}) {
  return evaluatePublicMirrorInventory({
    allObjects: [
      { id: COMMIT_ID, size: 100, type: "commit" },
      { id: TREE_ID, size: 100, type: "tree" },
      { id: README_ID, size: 12, type: "blob" },
    ],
    blobs: [
      {
        content: Buffer.from("# Public\n"),
        id: README_ID,
        path: "README.md",
        size: 9,
      },
    ],
    commitMetadata: [
      {
        author: PUBLIC_IDENTITY,
        committer: PUBLIC_IDENTITY,
        id: COMMIT_ID,
        message: "Public source snapshot\n",
        parentIds: [],
      },
    ],
    commitIds: [COMMIT_ID],
    configuredGitIdentity: PUBLIC_IDENTITY,
    historicalPaths: ["README.md"],
    publicMaintainerIdentity: PUBLIC_IDENTITY,
    reachableObjects: [
      { id: COMMIT_ID, path: null },
      { id: TREE_ID, path: null },
      { id: README_ID, path: "README.md" },
    ],
    refs: ["refs/heads/main"],
    shallowRepository: false,
    treeReadiness: { errors: [] },
    workingTreeClean: true,
    ...overrides,
  });
}

test("public mirror audit accepts one clean squash commit and no hidden objects", () => {
  const result = evaluate();

  assert.deepEqual(result.errors, []);
  assert.equal(result.commitsChecked, 1);
  assert.equal(result.objectsChecked, 3);
  assert.equal(result.historicalPathsChecked, 1);
  assert.equal(result.textBlobsChecked, 1);
});

test("public mirror audit rejects inherited refs, history, and unreachable objects", () => {
  const privateCommitId = "d".repeat(40);
  const result = evaluate({
    allObjects: [
      { id: COMMIT_ID, size: 100, type: "commit" },
      { id: TREE_ID, size: 100, type: "tree" },
      { id: README_ID, size: 12, type: "blob" },
      { id: privateCommitId, size: 100, type: "commit" },
    ],
    commitIds: [COMMIT_ID, privateCommitId],
    refs: ["refs/heads/main", "refs/tags/v0.1.0"],
    workingTreeClean: false,
  });

  assert.deepEqual(
    result.errors.map(({ label }) => label),
    [
      "public mirror has uncommitted changes",
      "public mirror must contain exactly one squash commit, found 2",
      "public mirror must contain only refs/heads/main",
      "unreachable Git object may retain private history",
    ],
  );
});

test("public mirror audit fails shape checks before reading private history blobs", () => {
  const calls = [];
  const result = auditPublicMirror({
    execGit: (args) => {
      calls.push(args);
      if (args[0] === "status") {
        return "";
      }
      if (args[0] === "rev-list") {
        return `${COMMIT_ID}\n${"d".repeat(40)}\n`;
      }
      if (args[0] === "for-each-ref") {
        return "refs/heads/main\n";
      }
      if (args[0] === "rev-parse") {
        return "false\n";
      }
      throw new Error(`Unexpected history read: ${args.join(" ")}`);
    },
  });

  assert.deepEqual(calls, [
    ["status", "--porcelain=v1", "--untracked-files=all"],
    ["rev-list", "--all"],
    ["for-each-ref", "--format=%(refname)"],
    ["rev-parse", "--is-shallow-repository"],
  ]);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].label, /exactly one squash commit/);
});

test("public mirror audit scans historical paths, blobs, commit messages, and tree", () => {
  const privateKey = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  const token = ["github", "_pat_", "A".repeat(32)].join("");
  const result = evaluate({
    blobs: [
      {
        content: Buffer.from(privateKey),
        id: README_ID,
        path: "docs/guide.md",
        size: privateKey.length,
      },
    ],
    commitMetadata: [
      {
        author: PUBLIC_IDENTITY,
        committer: PUBLIC_IDENTITY,
        id: COMMIT_ID,
        message: token,
        parentIds: [],
      },
    ],
    historicalPaths: ["docs/guide.md", "private-key.pem"],
    treeReadiness: {
      errors: [{ file: "README.md", line: 3, label: "fixture tree failure" }],
    },
  });

  assert.deepEqual(
    result.errors.map(({ location, label }) => ({ location, label })),
    [
      {
        location: "private-key.pem",
        label: "historical credential or certificate artifact",
      },
      {
        location: `docs/guide.md@${README_ID.slice(0, 12)}:1`,
        label: "historical private key material",
      },
      {
        location: `commit:${COMMIT_ID.slice(0, 12)}:1`,
        label: "historical GitHub access token",
      },
      { location: "README.md:3", label: "fixture tree failure" },
    ],
  );
});

test("public mirror audit rejects a shallow clone even with one commit and one ref", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-public-mirror-"));
  const source = join(directory, "source");
  const mirror = join(directory, "mirror");

  const git = (cwd, args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    git(directory, ["init", "-b", "main", source]);
    git(source, ["config", "--local", "user.name", PUBLIC_IDENTITY.name]);
    git(source, ["config", "--local", "user.email", PUBLIC_IDENTITY.email]);
    writeFileSync(join(source, "README.md"), "# First\n");
    git(source, ["add", "README.md"]);
    git(source, ["commit", "-m", "First"]);
    writeFileSync(join(source, "README.md"), "# Second\n");
    git(source, ["add", "README.md"]);
    git(source, ["commit", "-m", "Second"]);

    git(directory, [
      "clone",
      "--depth=1",
      pathToFileURL(source).href,
      mirror,
    ]);
    git(mirror, ["remote", "remove", "origin"]);

    assert.equal(git(mirror, ["rev-list", "--count", "--all"]).trim(), "1");
    assert.equal(
      git(mirror, ["for-each-ref", "--format=%(refname)"]).trim(),
      "refs/heads/main",
    );
    assert.equal(
      git(mirror, ["rev-parse", "--is-shallow-repository"]).trim(),
      "true",
    );

    const result = auditPublicMirror({ repoRoot: mirror });
    assert.deepEqual(
      result.errors.map(({ label }) => label),
      ["public mirror must not be a shallow repository"],
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("public mirror audit accepts a real root snapshot with local public identity", () => {
  const directory = mkdtempSync(join(tmpdir(), "filament-manager-public-root-"));
  const git = (args) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    git(["init", "-b", "main"]);
    git(["config", "--local", "user.name", PUBLIC_IDENTITY.name]);
    git(["config", "--local", "user.email", PUBLIC_IDENTITY.email]);
    mkdirSync(join(directory, "config"));
    writeFileSync(
      join(directory, "config", "publication-policy.json"),
      `${JSON.stringify(
        {
          publicMaintainerIdentity: PUBLIC_IDENTITY,
          schemaVersion: 1,
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(join(directory, "README.md"), "# Public snapshot\n");
    git(["add", "."]);
    git(["commit", "-m", "Public source snapshot"]);

    const result = auditPublicMirror({
      repoRoot: directory,
      treeReadiness: { errors: [] },
    });

    assert.deepEqual(result.errors, []);
    assert.equal(result.commitsChecked, 1);
    assert.equal(result.textBlobsChecked, 2);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("public mirror audit requires the sole raw commit to have no parents", () => {
  const parentId = "d".repeat(40);
  const rawCommit = [
    `tree ${TREE_ID}`,
    `parent ${parentId}`,
    `author ${PUBLIC_IDENTITY.name} <${PUBLIC_IDENTITY.email}> 0 +0000`,
    `committer ${PUBLIC_IDENTITY.name} <${PUBLIC_IDENTITY.email}> 0 +0000`,
    "",
    "Public source snapshot",
    "",
  ].join("\n");
  const metadata = parseRawCommit(COMMIT_ID, rawCommit);
  const result = evaluate({ commitMetadata: [metadata] });

  assert.deepEqual(metadata.parentIds, [parentId]);
  assert.equal(
    result.errors.find(({ label }) => label.includes("root commit"))?.label,
    "sole public snapshot commit must be a root commit",
  );
});

test("public mirror audit validates author and committer without reporting identities", () => {
  const privateIdentity = {
    email: "private-person@example.invalid",
    name: "Private Person",
  };
  const result = evaluate({
    commitMetadata: [
      {
        author: privateIdentity,
        committer: privateIdentity,
        id: COMMIT_ID,
        message: "Public source snapshot\n",
        parentIds: [],
      },
    ],
    configuredGitIdentity: privateIdentity,
  });

  assert.deepEqual(
    result.errors.map(({ location, label }) => ({ location, label })),
    [
      {
        location: "identity",
        label:
          "local Git identity does not match the checked-in public maintainer identity",
      },
      {
        location: `commit:${COMMIT_ID.slice(0, 12)}:author`,
        label:
          "public snapshot author does not match the configured public maintainer identity",
      },
      {
        location: `commit:${COMMIT_ID.slice(0, 12)}:committer`,
        label:
          "public snapshot committer does not match the configured public maintainer identity",
      },
    ],
  );
  const serializedErrors = JSON.stringify(result.errors);
  assert.doesNotMatch(serializedErrors, /Private Person/);
  assert.doesNotMatch(serializedErrors, /private-person@example\.invalid/);
});

test("public mirror audit rejects malformed or missing public identity configuration", () => {
  const malformedCommit = {
    author: null,
    committer: null,
    id: COMMIT_ID,
    message: "Public source snapshot\n",
    parentIds: [],
  };
  const result = evaluate({
    commitMetadata: [malformedCommit],
    configuredGitIdentity: null,
    publicMaintainerIdentity: null,
  });

  assert.deepEqual(
    result.errors.map(({ label }) => label),
    [
      "checked-in public maintainer identity policy could not be verified",
      "public mirror requires one explicit local user.name and user.email",
      "public snapshot author identity could not be verified",
      "public snapshot committer identity could not be verified",
    ],
  );
  assert.equal(
    parseLocalGitIdentity(
      Buffer.from("user.name\nPublic Maintainer\0user.email\nnot-an-email\0"),
    ),
    null,
  );
});

test("public mirror audit fails closed on a non-UTF-8 raw commit", () => {
  const rawCommit = Buffer.concat([
    Buffer.from(
      [
        `tree ${TREE_ID}`,
        `author ${PUBLIC_IDENTITY.name} <${PUBLIC_IDENTITY.email}> 0 +0000`,
        `committer ${PUBLIC_IDENTITY.name} <${PUBLIC_IDENTITY.email}> 0 +0000`,
        "",
        "",
      ].join("\n"),
      "utf8",
    ),
    Buffer.from([0xff]),
  ]);
  const metadata = parseRawCommit(COMMIT_ID, rawCommit);
  const result = evaluate({ commitMetadata: [metadata] });

  assert.equal(metadata.validUtf8, false);
  assert.equal(
    result.errors.find(({ label }) => label.includes("valid UTF-8"))?.label,
    "public snapshot commit must be valid UTF-8",
  );
});

test("public mirror audit scans UTF-16 historical text and rejects opaque blobs", () => {
  const token = ["github", "_pat_", "A".repeat(32)].join("");
  const utf16Text = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(`Public notes\n${token}\n`, "utf16le"),
  ]);
  const opaque = Buffer.from([0xc3, 0x28, 0xff]);
  const result = evaluate({
    allObjects: [
      { id: COMMIT_ID, size: 100, type: "commit" },
      { id: TREE_ID, size: 100, type: "tree" },
      { id: README_ID, size: utf16Text.length, type: "blob" },
      { id: "e".repeat(40), size: opaque.length, type: "blob" },
    ],
    blobs: [
      {
        content: utf16Text,
        id: README_ID,
        path: "docs/notes.txt",
        size: utf16Text.length,
      },
      {
        content: opaque,
        id: "e".repeat(40),
        path: "docs/opaque.dat",
        size: opaque.length,
      },
    ],
    reachableObjects: [
      { id: COMMIT_ID, path: null },
      { id: TREE_ID, path: null },
      { id: README_ID, path: "docs/notes.txt" },
      { id: "e".repeat(40), path: "docs/opaque.dat" },
    ],
  });

  assert.deepEqual(
    result.errors.map(({ location, label }) => ({ location, label })),
    [
      {
        location: `docs/notes.txt@${README_ID.slice(0, 12)}:2`,
        label: "historical GitHub access token",
      },
      {
        location: `docs/opaque.dat@${"e".repeat(12)}`,
        label:
          "historical blob is neither supported text nor an explicitly recognized binary asset",
      },
    ],
  );
  assert.equal(result.textBlobsChecked, 1);
});

test("public mirror audit scans recognizable ASCII secrets in binary assets", () => {
  const token = ["github", "_pat_", "A".repeat(32)].join("");
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(token, "ascii"),
    Buffer.from([
      0x00,
      0x00,
      0x00,
      0x00,
      0x49,
      0x45,
      0x4e,
      0x44,
      0xae,
      0x42,
      0x60,
      0x82,
    ]),
  ]);
  const result = evaluate({
    allObjects: [
      { id: COMMIT_ID, size: 100, type: "commit" },
      { id: TREE_ID, size: 100, type: "tree" },
      { id: README_ID, size: png.length, type: "blob" },
    ],
    blobs: [
      {
        content: png,
        id: README_ID,
        path: "docs/metadata.png",
        size: png.length,
      },
    ],
    reachableObjects: [
      { id: COMMIT_ID, path: null },
      { id: TREE_ID, path: null },
      { id: README_ID, path: "docs/metadata.png" },
    ],
  });

  assert.deepEqual(
    result.errors.map(({ label }) => label),
    ["historical GitHub access token"],
  );
  assert.equal(result.textBlobsChecked, 0);
});

test("public mirror parsers preserve object paths, sizes, and NUL-delimited names", () => {
  assert.deepEqual(
    parseObjectListing(`${COMMIT_ID}\n${README_ID} docs/guide with spaces.md\n`),
    [
      { id: COMMIT_ID, path: null },
      { id: README_ID, path: "docs/guide with spaces.md" },
    ],
  );
  assert.deepEqual(
    parseObjectInventory(`${README_ID} blob 42\n${TREE_ID} tree 81\n`),
    [
      { id: README_ID, size: 42, type: "blob" },
      { id: TREE_ID, size: 81, type: "tree" },
    ],
  );
  assert.deepEqual(
    parseNulList(Buffer.from("README.md\0docs/guide with spaces.md\0")),
    ["README.md", "docs/guide with spaces.md"],
  );
});
