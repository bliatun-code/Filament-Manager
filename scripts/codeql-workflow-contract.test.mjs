import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/codeql.yml", import.meta.url),
  "utf8",
);

test("CodeQL covers every supported repository language", () => {
  const matrixEntries = [
    ...workflow.matchAll(
      /^\s+- language: ([^\s]+)\s*\n\s+category: "([^"]+)"$/gm,
    ),
  ].map((match) => ({
    language: match[1],
    category: match[2],
  }));
  assert.deepEqual(matrixEntries, [
    {
      language: "javascript-typescript",
      category: ".github/workflows/codeql.yml:analyze",
    },
    { language: "rust", category: "/language:rust" },
    { language: "actions", category: "/language:actions" },
  ]);
  assert.match(workflow, /fail-fast: false/);
  assert.match(workflow, /languages: \$\{\{ matrix\.language \}\}/);
  assert.match(workflow, /build-mode: none/);
  assert.match(workflow, /category: \$\{\{ matrix\.category \}\}/);

  const initAction = workflow.match(
    /github\/codeql-action\/init@([a-f0-9]{40}) # v(\d+\.\d+\.\d+)/,
  );
  const analyzeAction = workflow.match(
    /github\/codeql-action\/analyze@([a-f0-9]{40}) # v(\d+\.\d+\.\d+)/,
  );
  assert.ok(initAction, "CodeQL init must use an immutable SHA pin.");
  assert.ok(analyzeAction, "CodeQL analyze must use an immutable SHA pin.");
  assert.equal(
    initAction[1],
    analyzeAction[1],
    "CodeQL init and analyze must use the same action revision.",
  );
  assert.equal(
    initAction[2],
    analyzeAction[2],
    "CodeQL init and analyze version comments must stay in sync.",
  );
});

test("CodeQL remains public-only, least privilege and credential-less", () => {
  assert.match(workflow, /if: github\.event\.repository\.private == false/);
  assert.match(
    workflow,
    /^permissions:\n  actions: read\n  contents: read\n  security-events: write$/m,
  );
  assert.equal(
    [...workflow.matchAll(/^\s*permissions:/gm)].length,
    1,
    "jobs must not override the workflow permissions",
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.deepEqual(
    [...workflow.matchAll(/^\s+([a-z-]+): write$/gm)].map(
      (match) => match[1],
    ),
    ["security-events"],
  );
});

test("CodeQL runs for main changes, a schedule and manual audits", () => {
  assert.match(workflow, /^  push:\n    branches:\n      - main$/m);
  assert.match(workflow, /^  pull_request:\n    branches:\n      - main$/m);
  assert.match(workflow, /^  schedule:\n    - cron: "[^"]+"$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /timeout-minutes: 20/);
});
