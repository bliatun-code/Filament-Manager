import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/;

function tokenizeLicenseExpression(expression) {
  if (typeof expression !== "string" || expression.trim() === "") {
    throw new Error("license expression must be a non-empty string");
  }

  const tokens = [];
  let offset = 0;
  while (offset < expression.length) {
    const remaining = expression.slice(offset);
    const whitespace = remaining.match(/^\s+/);
    if (whitespace) {
      offset += whitespace[0].length;
      continue;
    }

    const character = expression[offset];
    if (character === "(" || character === ")") {
      tokens.push({ type: character, value: character });
      offset += 1;
      continue;
    }

    const identifier = remaining.match(/^[A-Za-z0-9][A-Za-z0-9.+-]*/);
    if (!identifier) {
      throw new Error(`unexpected token at column ${offset + 1}`);
    }
    const value = identifier[0];
    tokens.push({
      type: value === "AND" || value === "OR" || value === "WITH" ? value : "id",
      value,
    });
    offset += value.length;
  }
  return tokens;
}

export function parseLicenseExpression(expression) {
  const tokens = tokenizeLicenseExpression(expression);
  let position = 0;

  const peek = (type) => tokens[position]?.type === type;
  const consume = (type) => {
    if (!peek(type)) {
      const actual = tokens[position]?.value ?? "end of expression";
      throw new Error(`expected ${type}, found ${actual}`);
    }
    return tokens[position++];
  };

  const parsePrimary = () => {
    if (peek("(")) {
      consume("(");
      const nested = parseOr();
      consume(")");
      return nested;
    }

    const license = consume("id").value;
    if (peek("WITH")) {
      consume("WITH");
      const exception = consume("id").value;
      return { type: "license", value: `${license} WITH ${exception}` };
    }
    return { type: "license", value: license };
  };

  const parseAnd = () => {
    let expressionNode = parsePrimary();
    while (peek("AND")) {
      consume("AND");
      expressionNode = {
        left: expressionNode,
        right: parsePrimary(),
        type: "and",
      };
    }
    return expressionNode;
  };

  function parseOr() {
    let expressionNode = parseAnd();
    while (peek("OR")) {
      consume("OR");
      expressionNode = {
        left: expressionNode,
        right: parseAnd(),
        type: "or",
      };
    }
    return expressionNode;
  }

  const parsed = parseOr();
  if (position !== tokens.length) {
    throw new Error(`unexpected token ${tokens[position].value}`);
  }
  return parsed;
}

export function isLicenseExpressionAllowed(expression, allowedLicenses) {
  const parsed = parseLicenseExpression(expression);
  const allowed = new Set(allowedLicenses);

  const evaluate = (node) => {
    if (node.type === "license") {
      return allowed.has(node.value);
    }
    if (node.type === "and") {
      return evaluate(node.left) && evaluate(node.right);
    }
    return evaluate(node.left) || evaluate(node.right);
  };

  return evaluate(parsed);
}

function packageNameFromLockPath(packagePath) {
  const marker = "node_modules/";
  const markerIndex = packagePath.lastIndexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  const packagePart = packagePath.slice(markerIndex + marker.length);
  if (packagePart.startsWith("@")) {
    return packagePart.split("/").slice(0, 2).join("/");
  }
  return packagePart.split("/", 1)[0];
}

export function validateLicensePolicy(policy) {
  const errors = [];
  if (policy?.schemaVersion !== 1) {
    errors.push("policy schemaVersion must be 1");
  }
  if (!Array.isArray(policy?.allowedLicenses) || policy.allowedLicenses.length === 0) {
    errors.push("policy allowedLicenses must be a non-empty array");
  }
  if (!Array.isArray(policy?.packageExceptions)) {
    errors.push("policy packageExceptions must be an array");
  }

  const allowedLicenses = policy?.allowedLicenses ?? [];
  const seenLicenses = new Set();
  for (const license of allowedLicenses) {
    if (
      typeof license !== "string" ||
      !license
        .split(" WITH ")
        .every((part) => identifierPattern.test(part))
    ) {
      errors.push(`invalid allowed license identifier: ${String(license)}`);
    } else if (seenLicenses.has(license)) {
      errors.push(`duplicate allowed license identifier: ${license}`);
    }
    seenLicenses.add(license);
  }

  const seenExceptions = new Set();
  for (const exception of policy?.packageExceptions ?? []) {
    const key = `${exception?.package}\u0000${exception?.version}\u0000${exception?.license}`;
    if (
      typeof exception?.package !== "string" ||
      exception.package === "" ||
      typeof exception?.version !== "string" ||
      exception.version === "" ||
      typeof exception?.license !== "string" ||
      exception.license === "" ||
      typeof exception?.reason !== "string" ||
      exception.reason.trim() === ""
    ) {
      errors.push("every package exception must pin package, version and license with a reason");
    } else if (seenExceptions.has(key)) {
      errors.push(
        `duplicate package exception: ${exception.package}@${exception.version} (${exception.license})`,
      );
    }
    seenExceptions.add(key);
  }

  return errors;
}

export function analyzePackageLockLicenses(lockfile, policy, label = "<lockfile>") {
  const errors = validateLicensePolicy(policy);
  const usedExceptions = new Set();
  let packagesChecked = 0;

  if (lockfile?.lockfileVersion !== 3 || typeof lockfile?.packages !== "object") {
    errors.push(`${label}: expected an npm lockfileVersion 3 packages map`);
    return { errors, packagesChecked, usedExceptions };
  }

  for (const [packagePath, packageMetadata] of Object.entries(lockfile.packages)) {
    const packageName =
      packageMetadata?.name ?? (packagePath === "" ? null : packageNameFromLockPath(packagePath));
    const version = packageMetadata?.version;
    const license = packageMetadata?.license;
    packagesChecked += 1;

    if (
      typeof packageName !== "string" ||
      packageName === "" ||
      typeof version !== "string" ||
      version === ""
    ) {
      errors.push(`${label}:${packagePath || "<root>"}: package name and version are required`);
      continue;
    }
    if (typeof license !== "string" || license.trim() === "") {
      errors.push(`${label}:${packageName}@${version}: license metadata is missing`);
      continue;
    }

    const exceptionIndex = policy.packageExceptions.findIndex(
      (exception) =>
        exception.package === packageName &&
        exception.version === version &&
        exception.license === license,
    );
    if (exceptionIndex >= 0) {
      usedExceptions.add(exceptionIndex);
      continue;
    }

    try {
      if (!isLicenseExpressionAllowed(license, policy.allowedLicenses)) {
        errors.push(
          `${label}:${packageName}@${version}: license is not allowed by policy: ${license}`,
        );
      }
    } catch (error) {
      errors.push(
        `${label}:${packageName}@${version}: invalid license expression ${JSON.stringify(
          license,
        )}: ${error.message}`,
      );
    }
  }

  return { errors, packagesChecked, usedExceptions };
}

export function analyzeNpmLicenseFiles({
  lockfilePaths = [resolve("package-lock.json"), resolve("ui", "package-lock.json")],
  policyPath = resolve("config", "dependency-license-policy.json"),
} = {}) {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const errors = validateLicensePolicy(policy);
  const usedExceptions = new Set();
  let packagesChecked = 0;

  for (const lockfilePath of lockfilePaths) {
    const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
    const result = analyzePackageLockLicenses(lockfile, policy, lockfilePath);
    errors.push(...result.errors.filter((error) => !errors.includes(error)));
    packagesChecked += result.packagesChecked;
    for (const exceptionIndex of result.usedExceptions) {
      usedExceptions.add(exceptionIndex);
    }
  }

  for (const [exceptionIndex, exception] of policy.packageExceptions.entries()) {
    if (!usedExceptions.has(exceptionIndex)) {
      errors.push(
        `unused package exception: ${exception.package}@${exception.version} (${exception.license})`,
      );
    }
  }

  return {
    errors,
    lockfilesChecked: lockfilePaths.length,
    packagesChecked,
  };
}

function runCli() {
  const result = analyzeNpmLicenseFiles();
  if (result.errors.length > 0) {
    console.error("npm dependency license policy failed:");
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `npm dependency license policy ok (${result.packagesChecked} package entries in ${result.lockfilesChecked} lockfiles).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
