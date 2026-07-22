import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test(
  "macOS native window helper typechecks against the active SDK",
  { skip: process.platform !== "darwin" },
  (t) => {
    const cacheRoot = mkdtempSync(
      path.join(tmpdir(), "filament-manager-swift-typecheck-"),
    );
    t.after(() => rmSync(cacheRoot, { force: true, recursive: true }));
    const result = spawnSync(
      "swiftc",
      [
        "-typecheck",
        fileURLToPath(new URL("./macos-window-info.swift", import.meta.url)),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CLANG_MODULE_CACHE_PATH: path.join(cacheRoot, "clang"),
          SWIFT_MODULECACHE_PATH: path.join(cacheRoot, "swift"),
        },
        shell: false,
      },
    );

    assert.equal(
      result.status,
      0,
      `Swift helper typecheck failed:\n${result.stdout}\n${result.stderr}`,
    );
  },
);
