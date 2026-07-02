import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { collectUiSourceFiles } from "./ui-source-utils.mjs";

const repoRoot = resolve(".");
const sourceRoot = resolve(repoRoot, "ui", "src");
const require = createRequire(import.meta.url);
const ts = require(resolve(repoRoot, "ui", "node_modules", "typescript"));

function sourceKindForFile(file) {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function isTranslationCallExpression(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text === "t";
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === "t";
  }
  return false;
}

function fallbackArgumentIsMissing(callExpression) {
  if (callExpression.arguments.length < 2) {
    return true;
  }
  const fallbackArgument = callExpression.arguments[1];
  return fallbackArgument.kind === ts.SyntaxKind.UndefinedKeyword;
}

function locationForNode(sourceFile, node) {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${relative(repoRoot, sourceFile.fileName)}:${location.line + 1}:${
    location.character + 1
  }`;
}

const violations = [];

for (const file of collectUiSourceFiles(sourceRoot)) {
  const source = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourceKindForFile(file),
  );

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      isTranslationCallExpression(node.expression) &&
      fallbackArgumentIsMissing(node)
    ) {
      violations.push(locationForNode(sourceFile, node));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (violations.length > 0) {
  console.error(
    "UI translation calls must pass an inline fallback so non-active locale dictionaries stay lazy-loaded:",
  );
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log("UI i18n fallback contract ok.");
