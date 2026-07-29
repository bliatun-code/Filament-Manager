import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  analyzePublicReadiness,
  collectContentErrors,
  decodeTrackedText,
  forbiddenTrackedPathError,
  isExplicitlyRecognizedBinaryAsset,
} from "./check-public-readiness.mjs";

const MAX_TEXT_BLOB_BYTES = 64 * 1024 * 1024;
const EXPECTED_PUBLIC_REF = "refs/heads/main";

function runGit(repoRoot, args, options = {}) {
  const encoding = Object.hasOwn(options, "encoding")
    ? options.encoding
    : "utf8";
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding,
    input: options.input,
    maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
    stdio: options.stdio,
  });
}

export function parseObjectListing(source) {
  return String(source)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(" ");
      if (separator < 0) {
        return { id: line, path: null };
      }
      return {
        id: line.slice(0, separator),
        path: line.slice(separator + 1) || null,
      };
    });
}

export function parseObjectInventory(source) {
  return String(source)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [id, type, rawSize] = line.split(" ");
      return { id, type, size: Number.parseInt(rawSize, 10) };
    });
}

export function parseNulList(source) {
  return Buffer.from(source)
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function formatObjectLocation(path, id) {
  return path ? `${path}@${id.slice(0, 12)}` : `object:${id.slice(0, 12)}`;
}

function parseCommitIdentity(headerValue) {
  const match = /^(.*) <([^<>]*)> -?\d+ [+-]\d{4}$/.exec(headerValue);
  if (!match) {
    return null;
  }
  const name = match[1].trim();
  const email = match[2].trim();
  return name && email ? { email, name } : null;
}

export function parseRawCommit(id, source) {
  let normalized;
  try {
    normalized = new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.from(source))
      .replaceAll("\r\n", "\n");
  } catch {
    return {
      author: null,
      committer: null,
      id,
      message: "",
      parentIds: [],
      validUtf8: false,
    };
  }
  const separator = normalized.indexOf("\n\n");
  const headers = (separator >= 0 ? normalized.slice(0, separator) : normalized).split(
    "\n",
  );
  const message = separator >= 0 ? normalized.slice(separator + 2) : "";
  const parentIds = [];
  let author = null;
  let committer = null;

  for (const header of headers) {
    if (header.startsWith("parent ")) {
      const parentId = header.slice("parent ".length).trim();
      if (parentId) {
        parentIds.push(parentId);
      }
    } else if (header.startsWith("author ")) {
      author = parseCommitIdentity(header.slice("author ".length));
    } else if (header.startsWith("committer ")) {
      committer = parseCommitIdentity(header.slice("committer ".length));
    }
  }

  return { author, committer, id, message, parentIds, validUtf8: true };
}

export function parseLocalGitIdentity(source) {
  const values = new Map();
  const entries = Buffer.from(source)
    .toString("utf8")
    .split("\0")
    .filter(Boolean);

  for (const entry of entries) {
    const separator = entry.indexOf("\n");
    if (separator < 0) {
      continue;
    }
    const key = entry.slice(0, separator).toLowerCase();
    if (key !== "user.name" && key !== "user.email") {
      continue;
    }
    const value = entry.slice(separator + 1).trim();
    const existing = values.get(key) ?? [];
    existing.push(value);
    values.set(key, existing);
  }

  const names = values.get("user.name") ?? [];
  const emails = values.get("user.email") ?? [];
  if (names.length !== 1 || emails.length !== 1) {
    return null;
  }
  const name = names[0];
  const email = emails[0];
  if (
    !name ||
    !email ||
    /[\r\n<>]/.test(name) ||
    !/^[^\s<>@]+@[^\s<>@]+$/.test(email)
  ) {
    return null;
  }
  return { email, name };
}

function normalizePublicMaintainerIdentity(value) {
  const name =
    typeof value?.name === "string" ? value.name.trim() : "";
  const email =
    typeof value?.email === "string" ? value.email.trim() : "";
  if (
    !name ||
    !email ||
    /[\r\n<>]/.test(name) ||
    !/^[^\s<>@]+@[^\s<>@]+$/.test(email)
  ) {
    return null;
  }
  return { email, name };
}

export function loadPublicationPolicy(repoRoot = resolve(".")) {
  try {
    const policy = JSON.parse(
      readFileSync(
        resolve(repoRoot, "config", "publication-policy.json"),
        "utf8",
      ),
    );
    if (policy.schemaVersion !== 1) {
      return null;
    }
    return normalizePublicMaintainerIdentity(
      policy.publicMaintainerIdentity,
    );
  } catch {
    return null;
  }
}

function identitiesMatch(actual, expected) {
  return (
    actual !== null &&
    expected !== null &&
    actual.name === expected.name &&
    actual.email === expected.email
  );
}

export function evaluatePublicMirrorInventory({
  allObjects,
  blobs,
  commitMetadata = null,
  commitIds,
  configuredGitIdentity = null,
  historicalPaths,
  publicMaintainerIdentity = null,
  reachableObjects,
  refs,
  shallowRepository = false,
  treeReadiness,
  workingTreeClean,
}) {
  const errors = [];
  const normalizedCommitIds = uniqueSorted(commitIds);
  const normalizedRefs = uniqueSorted(refs);
  const reachableIds = new Set(reachableObjects.map(({ id }) => id));
  const allObjectIds = new Set(allObjects.map(({ id }) => id));

  if (!workingTreeClean) {
    errors.push({
      location: "worktree",
      label: "public mirror has uncommitted changes",
    });
  }
  if (normalizedCommitIds.length !== 1) {
    errors.push({
      location: "history",
      label: `public mirror must contain exactly one squash commit, found ${normalizedCommitIds.length}`,
    });
  }
  if (
    normalizedRefs.length !== 1 ||
    normalizedRefs[0] !== EXPECTED_PUBLIC_REF
  ) {
    errors.push({
      location: "refs",
      label: `public mirror must contain only ${EXPECTED_PUBLIC_REF}`,
      detail: normalizedRefs.join(", ") || "none",
    });
  }
  if (shallowRepository) {
    errors.push({
      location: "history",
      label: "public mirror must not be a shallow repository",
    });
  }

  if (normalizedCommitIds.length === 1 && commitMetadata !== null) {
    const commit = commitMetadata.find(
      ({ id }) => id === normalizedCommitIds[0],
    );
    if (!commit) {
      errors.push({
        location: "commit",
        label: "public snapshot commit metadata could not be verified",
      });
    } else {
      const location = `commit:${commit.id.slice(0, 12)}`;
      if (commit.validUtf8 === false) {
        errors.push({
          location,
          label: "public snapshot commit must be valid UTF-8",
        });
      }
      if (commit.parentIds.length !== 0) {
        errors.push({
          location,
          label: "sole public snapshot commit must be a root commit",
        });
      }
      if (publicMaintainerIdentity === null) {
        errors.push({
          location: "identity",
          label:
            "checked-in public maintainer identity policy could not be verified",
        });
      }
      if (configuredGitIdentity === null) {
        errors.push({
          location: "identity",
          label:
            "public mirror requires one explicit local user.name and user.email",
        });
      } else if (
        publicMaintainerIdentity !== null &&
        !identitiesMatch(configuredGitIdentity, publicMaintainerIdentity)
      ) {
        errors.push({
          location: "identity",
          label:
            "local Git identity does not match the checked-in public maintainer identity",
        });
      }
      if (commit.author === null) {
        errors.push({
          location: `${location}:author`,
          label: "public snapshot author identity could not be verified",
        });
      } else if (
        publicMaintainerIdentity !== null &&
        !identitiesMatch(commit.author, publicMaintainerIdentity)
      ) {
        errors.push({
          location: `${location}:author`,
          label:
            "public snapshot author does not match the configured public maintainer identity",
        });
      }
      if (commit.committer === null) {
        errors.push({
          location: `${location}:committer`,
          label: "public snapshot committer identity could not be verified",
        });
      } else if (
        publicMaintainerIdentity !== null &&
        !identitiesMatch(commit.committer, publicMaintainerIdentity)
      ) {
        errors.push({
          location: `${location}:committer`,
          label:
            "public snapshot committer does not match the configured public maintainer identity",
        });
      }
    }
  }

  for (const { id } of allObjects) {
    if (!reachableIds.has(id)) {
      errors.push({
        location: `object:${id.slice(0, 12)}`,
        label: "unreachable Git object may retain private history",
      });
    }
  }
  for (const { id } of reachableObjects) {
    if (!allObjectIds.has(id)) {
      errors.push({
        location: `object:${id.slice(0, 12)}`,
        label: "reachable object was missing from the complete object inventory",
      });
    }
  }

  for (const path of uniqueSorted(historicalPaths)) {
    const label = forbiddenTrackedPathError(path);
    if (label) {
      errors.push({ location: path, label: `historical ${label}` });
    }
  }

  let textBlobsChecked = 0;
  for (const blob of blobs) {
    const location = formatObjectLocation(blob.path, blob.id);
    if (blob.size > MAX_TEXT_BLOB_BYTES) {
      errors.push({
        location,
        label: `historical blob exceeds the ${MAX_TEXT_BLOB_BYTES}-byte audit limit`,
      });
      continue;
    }
    const source = decodeTrackedText(blob.content);
    if (source === null) {
      if (
        blob.path &&
        isExplicitlyRecognizedBinaryAsset(blob.path, blob.content)
      ) {
        for (const error of collectContentErrors(
          Buffer.from(blob.content).toString("latin1"),
          location,
        )) {
          errors.push({
            location: error.line ? `${error.file}:${error.line}` : error.file,
            label: `historical ${error.label}`,
          });
        }
      } else {
        errors.push({
          location,
          label:
            "historical blob is neither supported text nor an explicitly recognized binary asset",
        });
      }
      continue;
    }
    textBlobsChecked += 1;
    for (const error of collectContentErrors(source, location)) {
      errors.push({
        location: error.line ? `${error.file}:${error.line}` : error.file,
        label: `historical ${error.label}`,
      });
    }
  }

  if (commitMetadata !== null) {
    for (const commit of commitMetadata) {
      for (const error of collectContentErrors(
        commit.message,
        `commit:${commit.id.slice(0, 12)}`,
      )) {
        errors.push({
          location: error.line ? `${error.file}:${error.line}` : error.file,
          label: `historical ${error.label}`,
        });
      }
    }
  }

  for (const error of treeReadiness.errors) {
    errors.push({
      location: error.line ? `${error.file}:${error.line}` : error.file,
      label: error.label,
      detail: error.detail,
    });
  }

  return {
    errors,
    commitsChecked: normalizedCommitIds.length,
    historicalPathsChecked: uniqueSorted(historicalPaths).length,
    objectsChecked: allObjectIds.size,
    textBlobsChecked,
  };
}

export function auditPublicMirror(options = {}) {
  const repoRoot = options.repoRoot ?? resolve(".");
  const execGit = options.execGit ?? ((args, gitOptions) =>
    runGit(repoRoot, args, gitOptions));
  const status = String(execGit(["status", "--porcelain=v1", "--untracked-files=all"]));
  const commitIds = String(execGit(["rev-list", "--all"]))
    .split(/\r?\n/)
    .filter(Boolean);
  const refs = String(execGit(["for-each-ref", "--format=%(refname)"]))
    .split(/\r?\n/)
    .filter(Boolean);
  const shallowRepository =
    String(execGit(["rev-parse", "--is-shallow-repository"])).trim() !== "false";
  const workingTreeClean = status.trim().length === 0;
  if (
    !workingTreeClean ||
    commitIds.length !== 1 ||
    refs.length !== 1 ||
    refs[0] !== EXPECTED_PUBLIC_REF ||
    shallowRepository
  ) {
    return evaluatePublicMirrorInventory({
      allObjects: [],
      blobs: [],
      commitMetadata: null,
      commitIds,
      configuredGitIdentity: null,
      historicalPaths: [],
      publicMaintainerIdentity: null,
      reachableObjects: [],
      refs,
      shallowRepository,
      treeReadiness: { errors: [] },
      workingTreeClean,
    });
  }
  const commitMetadata = [
    parseRawCommit(
      commitIds[0],
      execGit(["cat-file", "commit", commitIds[0]], {
        encoding: null,
      }),
    ),
  ];
  const configuredGitIdentity = parseLocalGitIdentity(
    execGit(["config", "--local", "--null", "--list"], {
      encoding: null,
    }),
  );
  const expectedPublicMaintainerIdentity = Object.hasOwn(
    options,
    "publicMaintainerIdentity",
  )
    ? normalizePublicMaintainerIdentity(options.publicMaintainerIdentity)
    : loadPublicationPolicy(repoRoot);
  const reachableObjects = parseObjectListing(
    execGit(["rev-list", "--objects", "--all"]),
  );
  const allObjects = parseObjectInventory(
    execGit([
      "cat-file",
      "--batch-all-objects",
      "--batch-check=%(objectname) %(objecttype) %(objectsize)",
    ]),
  );
  const allObjectById = new Map(allObjects.map((object) => [object.id, object]));
  const representativePathById = new Map(
    reachableObjects
      .filter(({ path }) => path)
      .map(({ id, path }) => [id, path]),
  );
  const blobs = [];

  for (const { id } of reachableObjects) {
    const object = allObjectById.get(id);
    if (!object || object.type !== "blob") {
      continue;
    }
    const content = execGit(["cat-file", "blob", id], {
      encoding: null,
      maxBuffer: Math.max(object.size + 1024, 1024 * 1024),
    });
    blobs.push({
      content: Buffer.from(content),
      id,
      path: representativePathById.get(id) ?? null,
      size: object.size,
    });
  }

  const historicalPaths = parseNulList(
    execGit(["log", "--all", "--format=", "--name-only", "-z", "--no-renames"], {
      encoding: null,
    }),
  );

  return evaluatePublicMirrorInventory({
    allObjects,
    blobs,
    commitMetadata,
    commitIds,
    configuredGitIdentity,
    historicalPaths,
    publicMaintainerIdentity: expectedPublicMaintainerIdentity,
    reachableObjects,
    refs,
    shallowRepository,
    treeReadiness:
      options.treeReadiness ?? analyzePublicReadiness({ repoRoot }),
    workingTreeClean,
  });
}

function runCli() {
  const result = auditPublicMirror();
  if (result.errors.length > 0) {
    console.error("Public mirror audit failed:");
    for (const error of result.errors) {
      const detail = error.detail ? ` (${error.detail})` : "";
      console.error(`  - ${error.location}: ${error.label}${detail}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    [
      "Public mirror audit ok",
      `(${result.commitsChecked} squash commit`,
      `${result.objectsChecked} Git objects`,
      `${result.historicalPathsChecked} historical paths`,
      `${result.textBlobsChecked} text blobs checked).`,
    ].join(", "),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
