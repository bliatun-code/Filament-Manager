import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectUiSourceFiles } from "./ui-source-utils.mjs";

const repoRoot = resolve(".");
const sourceRoot = resolve(repoRoot, "ui", "src");
const require = createRequire(import.meta.url);
const ts = require(resolve(repoRoot, "ui", "node_modules", "typescript"));
const userCopyAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const allowedTechnicalCopy = new Set([
  "ID:",
  "RFID:",
  "mm",
  "g",
  "g - 0 g",
  "60 × 24 mm ·",
  "/ ID:",
  "#RRGGBB / gradient(...) / multi(...)",
  "http://192.168.1.25:4278/companion?pairing=...",
]);

function normalizedCopy(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function collectStaticUiCopyFromSource(source, fileName = "source.tsx") {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings = [];

  function addFinding(node, kind, value) {
    const copy = normalizedCopy(value);
    if (!copy || !/[A-Za-zÆØÅæøå]/.test(copy)) {
      return;
    }
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({ kind, value: copy, line: location.line + 1, column: location.character + 1 });
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      addFinding(node, "text", node.text);
    } else if (
      ts.isJsxAttribute(node) &&
      userCopyAttributes.has(node.name.text) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      addFinding(node, node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

export function validateStaticUiCopy(findings) {
  return findings
    .filter(({ value }) => !allowedTechnicalCopy.has(value))
    .map(
      ({ file, line, column, kind, value }) =>
        `${file}:${line}:${column}: untranslated ${kind} copy ${JSON.stringify(value)}.`,
    );
}

function runStaticUiCopyCheck() {
  const findings = collectUiSourceFiles(sourceRoot)
    .filter((file) => file.endsWith(".tsx"))
    .flatMap((file) =>
      collectStaticUiCopyFromSource(readFileSync(file, "utf8"), file).map((finding) => ({
        ...finding,
        file: relative(repoRoot, file),
      })),
    );
  const errors = validateStaticUiCopy(findings);

  if (errors.length > 0) {
    console.error("Static UI copy must use the locale dictionaries:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Static UI copy contract ok.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStaticUiCopyCheck();
}
