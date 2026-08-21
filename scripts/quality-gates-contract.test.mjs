import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageManifest = JSON.parse(readFileSync("package.json", "utf8"));
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const releaseWorkflow = readFileSync(
  ".github/workflows/release-build.yml",
  "utf8",
);
const qualityGates = readFileSync("docs/QUALITY_GATES.md", "utf8");
const performanceBaseline = readFileSync(
  "docs/PERFORMANCE_BASELINE.md",
  "utf8",
);
const localizationWorkflow = readFileSync("docs/LOCALIZATION.md", "utf8");
const accessibilityGate = readFileSync(
  "scripts/run-data-backed-accessibility.mjs",
  "utf8",
);

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  const endIndex = end
    ? source.indexOf(end, startIndex + start.length)
    : source.length;
  if (end) {
    assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  }
  return source.slice(startIndex, endIndex);
}

test("blocking quality gates retain named ownership and measurable thresholds", () => {
  for (const gate of [
    "Performance",
    "Backup and database upgrade",
    "Accessibility",
    "Localization",
  ]) {
    assert.equal(
      qualityGates.includes(`| ${gate} | \`@bliatun-code\``),
      true,
      `${gate} must retain a named owner`,
    );
  }

  assert.match(qualityGates, /10,000-spool/);
  assert.match(qualityGates, /SQLite `quick_check` is `ok`/);
  assert.match(qualityGates, /zero axe violations/);
  assert.match(qualityGates, /100% key and placeholder coverage/);
  assert.match(qualityGates, /at least 95% translation signal/);

  assert.match(performanceBaseline, /10,000 spools/);
  assert.match(performanceBaseline, /Entry \(`index-\*`\) \| 300,000 bytes/);
  assert.match(performanceBaseline, /Inventory \| 260,000 bytes/);
  assert.match(localizationWorkflow, /100% key and placeholder coverage/);
  assert.match(localizationWorkflow, /at least 95% overall translation signal/);
  for (const tag of ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]) {
    assert.match(accessibilityGate, new RegExp(`"${tag}"`));
  }
});

test("required platform jobs keep every documented gate blocking", () => {
  const smoke = packageManifest.scripts.smoke;
  for (const command of [
    "npm run test:a11y:app-modal",
    "npm run test:a11y:data-backed",
    "npm run test:scripts",
    "npm run test:performance",
    "npm run check:contracts",
  ]) {
    assert.match(smoke, new RegExp(command.replaceAll(" ", "\\s+")));
  }
  assert.match(packageManifest.scripts.verify, /npm run smoke/);
  assert.match(packageManifest.scripts.verify, /npm run test:rust/);
  assert.match(packageManifest.scripts["test:rust"], /cargo test/);

  const macosJob = section(ciWorkflow, "  macos-smoke:", "  windows-smoke:");
  const windowsJob = section(ciWorkflow, "  windows-smoke:");
  assert.match(macosJob, /run: npm run verify/);
  assert.match(windowsJob, /run: npm run verify/);
  assert.match(macosJob, /npm run smoke:release:database-upgrade/);

  const publishJob = section(
    releaseWorkflow,
    "  publish-github-release:",
  );
  assert.match(
    publishJob,
    /required_checks=\("macOS Smoke" "Windows Smoke"\)/,
  );
});
