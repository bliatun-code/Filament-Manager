import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PRIVATE_QA_ARTIFACT_MODE,
  PRIVATE_QA_DIRECTORY_MODE,
  preparePrivateQaArtifactDirectory,
  securePrivateQaArtifact,
} from "./qa-artifact-permissions.mjs";

test(
  "QA artifacts use private POSIX directory and file modes",
  { skip: process.platform === "win32" },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "filament-manager-private-qa-"));
    const directory = join(root, "captures");
    const artifact = join(directory, "capture.png");
    try {
      await preparePrivateQaArtifactDirectory(directory, { platform: "darwin" });
      writeFileSync(artifact, "synthetic screenshot", { mode: 0o644 });
      await securePrivateQaArtifact(artifact, { platform: "darwin" });

      assert.equal(statSync(directory).mode & 0o777, PRIVATE_QA_DIRECTORY_MODE);
      assert.equal(statSync(artifact).mode & 0o777, PRIVATE_QA_ARTIFACT_MODE);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  },
);

test("QA artifact permission helpers avoid POSIX chmod on Windows", async () => {
  const calls = [];
  await preparePrivateQaArtifactDirectory("C:\\qa", {
    platform: "win32",
    mkdirFn: async (path, options) => calls.push(["mkdir", path, options]),
    chmodFn: async () => calls.push(["chmod"]),
  });
  await securePrivateQaArtifact("C:\\qa\\capture.png", {
    platform: "win32",
    chmodFn: async () => calls.push(["chmod"]),
  });

  assert.deepEqual(calls, [["mkdir", "C:\\qa", { recursive: true }]]);
});
