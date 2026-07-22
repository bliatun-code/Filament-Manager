import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const INTERNAL_DOCUMENT_PREFIX = "docs/internal/";
const ALLOW_MARKER = "public-readiness-allow:";
const GENERIC_HOME_NAMES = new Set([
  "alex",
  "alice",
  "bob",
  "developer",
  "example",
  "jane",
  "john",
  "o'brien",
  "runner",
  "test",
  "tester",
  "user",
  "username",
]);

const forbiddenArtifactExtensions = [
  {
    label: "credential or certificate artifact",
    pattern:
      /\.(?:cer|crt|csr|der|jks|key|keystore|mobileprovision|p8|p12|pem|pfx|provisionprofile)$/i,
  },
  {
    label: "database artifact",
    pattern: /\.(?:db|db-shm|db-wal|sqlite|sqlite3)(?:-shm|-wal)?$/i,
  },
  {
    label: "built release artifact",
    pattern:
      /\.(?:7z|app|appimage|appx|deb|dmg|exe|ipa|minisig|msi|msix|mpkg|pkg|rar|rpm|sha256|sha512|sig|tar|tar\.gz|tgz|zip)$/i,
  },
];

const sensitiveFilenamePattern =
  /(?:^|[-_. ])(?:api[-_ ]?key|authkey|credentials?|private[-_ ]?key|secrets?)(?:[-_. ]|$)/i;
const sensitiveConfigurationExtension =
  /\.(?:config|env|ini|json|properties|toml|txt|yaml|yml)$/i;
const signingFilenamePattern =
  /(?:^|[-_.])(?:code[-_.]?signing|developer[-_.]?team[-_.]?key|macos[-_.]?signing|notari[sz]ation|windows[-_.]?signing)(?:[-_.]|$)/i;
const templateFilenamePattern =
  /(?:^|[-_. ])(?:example|sample|template)(?:[-_. ]|$)/i;
const sshPrivateKeyFilenamePattern =
  /^(?:id_(?:dsa|ecdsa|ed25519|rsa)|identity)(?:\.[^.]+)?$/i;
const credentialDotfilePattern = /^\.(?:authinfo|netrc|npmrc)(?:\..+)?$/i;
const serviceAccountFilenamePattern =
  /^(?:service[-_]?account.*|.*[-_]service[-_]?account)\.json$/i;

const secretPatterns = [
  {
    label: "private key material",
    pattern: /-----BEGIN (?:DSA |EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/g,
  },
  {
    label: "GitHub access token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    label: "AWS access key",
    pattern: /\b(?:A3T[A-Z0-9]|AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    label: "Google API key",
    pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  },
  {
    label: "npm access token",
    pattern: /\bnpm_[A-Za-z0-9]{20,}\b/g,
  },
  {
    label: "OpenAI API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: "Slack access token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
  },
  {
    label: "live Stripe secret key",
    pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/g,
  },
];

const homePathPatterns = [
  {
    label: "macOS home path",
    pattern:
      /\/Users\/([\p{L}\p{N}._-]+(?:'[\p{L}\p{N}._-]+)*)(?=\/|[\s"'<>`]|$)/gu,
  },
  {
    label: "Linux home path",
    pattern:
      /\/home\/([\p{L}\p{N}._-]+(?:'[\p{L}\p{N}._-]+)*)(?=\/|[\s"'<>`]|$)/gu,
  },
  {
    label: "Windows home path",
    pattern:
      /[A-Za-z]:\\+(?:Documents and Settings|Users)\\+([\p{L}\p{N}._ -]+(?:'[\p{L}\p{N}._ -]+)*)(?=\\+|[\r\n"'<>`]|$)/gu,
  },
];

function normalizeTrackedPath(file) {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function hasDocumentedAllowMarker(line) {
  const markerIndex = line.indexOf(ALLOW_MARKER);
  return markerIndex >= 0 && line.slice(markerIndex + ALLOW_MARKER.length).trim();
}

function isGenericHomeName(name) {
  const normalized = name.trim().toLowerCase();
  return (
    GENERIC_HOME_NAMES.has(normalized) ||
    normalized.startsWith("$") ||
    normalized.startsWith("%") ||
    (normalized.startsWith("<") && normalized.endsWith(">")) ||
    (normalized.startsWith("{") && normalized.endsWith("}"))
  );
}

function decodeTrackedText(content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (buffer.includes(0)) {
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function forbiddenTrackedPathError(file) {
  const normalized = normalizeTrackedPath(file);
  const basename = posix.basename(normalized);
  const pathSegments = normalized.split("/");

  if (
    normalized.toLowerCase() === "docs/internal" ||
    normalized.toLowerCase().startsWith(INTERNAL_DOCUMENT_PREFIX)
  ) {
    return "internal document";
  }
  if (basename === ".DS_Store") {
    return "macOS metadata artifact";
  }
  for (const { label, pattern } of forbiddenArtifactExtensions) {
    if (pathSegments.some((segment) => pattern.test(segment))) {
      return label;
    }
  }
  if (sshPrivateKeyFilenamePattern.test(basename)) {
    return "private key filename";
  }
  if (
    (credentialDotfilePattern.test(basename) ||
      serviceAccountFilenamePattern.test(basename)) &&
    !templateFilenamePattern.test(basename)
  ) {
    return "credential or secret configuration filename";
  }
  if (signingFilenamePattern.test(basename)) {
    return "internal signing or notarization filename";
  }
  if (
    sensitiveConfigurationExtension.test(basename) &&
    sensitiveFilenamePattern.test(basename) &&
    !templateFilenamePattern.test(basename)
  ) {
    return "credential or secret configuration filename";
  }
  if (/^\.env(?:\..+)?$/i.test(basename) && !templateFilenamePattern.test(basename)) {
    return "environment file";
  }
  return null;
}

function collectContentErrors(source, file) {
  const errors = [];
  const lines = source.split(/\r?\n/);

  for (const { label, pattern } of homePathPatterns) {
    for (const match of source.matchAll(pattern)) {
      const line = lineNumberAt(source, match.index ?? 0);
      if (
        isGenericHomeName(match[1] ?? "") ||
        hasDocumentedAllowMarker(lines[line - 1] ?? "")
      ) {
        continue;
      }
      errors.push({
        file,
        line,
        label: `personal absolute ${label}`,
      });
    }
  }

  for (const { label, pattern } of secretPatterns) {
    for (const match of source.matchAll(pattern)) {
      const line = lineNumberAt(source, match.index ?? 0);
      errors.push({ file, line, label });
    }
  }

  return errors;
}

function extractMarkdownTargets(source) {
  const targets = [];
  const patterns = [
    /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/g,
    /<(?:a|img)\b[^>]*\b(?:href|src)\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const target = match.slice(1).find(Boolean);
      if (target) {
        targets.push({ index: match.index ?? 0, target });
      }
    }
  }
  return targets;
}

function localTrackedTarget(sourceFile, rawTarget) {
  const target = rawTarget.trim();
  if (
    !target ||
    target.startsWith("#") ||
    target.startsWith("//") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)
  ) {
    return null;
  }

  const withoutFragment = target.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) {
    return null;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    decoded = withoutFragment;
  }
  const repoRelative = decoded.startsWith("/")
    ? decoded.slice(1)
    : posix.join(posix.dirname(sourceFile), decoded);
  return normalizeTrackedPath(posix.normalize(repoRelative));
}

function isTrackedTarget(target, trackedFiles) {
  if (trackedFiles.has(target)) {
    return true;
  }
  const directoryPrefix = target.endsWith("/") ? target : `${target}/`;
  return Array.from(trackedFiles).some((file) => file.startsWith(directoryPrefix));
}

function collectReferenceErrors(source, file, trackedFiles) {
  if (!file.toLowerCase().endsWith(".md")) {
    return [];
  }

  const errors = [];
  const seen = new Set();
  for (const { index, target: rawTarget } of extractMarkdownTargets(source)) {
    const target = localTrackedTarget(file, rawTarget);
    if (!target || isTrackedTarget(target, trackedFiles)) {
      continue;
    }
    const line = lineNumberAt(source, index);
    const key = `${line}\0${target}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    errors.push({
      file,
      line,
      label: "missing tracked document or asset reference",
      detail: target,
    });
  }
  return errors;
}

export function collectTrackedFiles(repoRoot = resolve("."), execFileSyncFn = execFileSync) {
  const output = execFileSyncFn("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  return Buffer.from(output)
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizeTrackedPath)
    .sort();
}

export function analyzePublicReadiness(options = {}) {
  const repoRoot = options.repoRoot ?? resolve(".");
  const trackedFiles = (
    options.trackedFiles ?? collectTrackedFiles(repoRoot, options.execFileSyncFn)
  ).map(normalizeTrackedPath);
  const trackedFileSet = new Set(trackedFiles);
  const readTrackedFile =
    options.readTrackedFile ??
    ((file) => readFileSync(resolve(repoRoot, ...file.split("/"))));
  const errors = [];
  let textFilesChecked = 0;

  for (const file of trackedFiles) {
    const forbiddenReason = forbiddenTrackedPathError(file);
    if (forbiddenReason) {
      errors.push({ file, line: null, label: forbiddenReason });
    }

    let source;
    try {
      source = decodeTrackedText(readTrackedFile(file));
    } catch (error) {
      errors.push({
        file,
        line: null,
        label: "tracked file could not be read",
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (source === null) {
      continue;
    }
    textFilesChecked += 1;
    errors.push(...collectContentErrors(source, file));
    errors.push(...collectReferenceErrors(source, file, trackedFileSet));
  }

  return {
    errors,
    textFilesChecked,
    trackedFilesChecked: trackedFiles.length,
  };
}

function runCli() {
  const result = analyzePublicReadiness();
  if (result.errors.length > 0) {
    console.error("Public-readiness contract failed:");
    for (const error of result.errors) {
      const location = error.line ? `${error.file}:${error.line}` : error.file;
      const detail = error.detail ? ` (${error.detail})` : "";
      console.error(`  - ${location}: ${error.label}${detail}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Public-readiness contract ok (${result.trackedFilesChecked} tracked files, ${result.textFilesChecked} text files checked).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
