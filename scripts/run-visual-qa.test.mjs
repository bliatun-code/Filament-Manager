import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { resolveVisualQaTauriLaunch } from "./run-visual-qa.mjs";

test("visual QA launches the local Tauri wrapper through Node without a shell", () => {
  const executable = "node-runtime";
  const launch = resolveVisualQaTauriLaunch({ executable });

  assert.deepEqual(launch, {
    args: [fileURLToPath(new URL("./run-tauri.mjs", import.meta.url)), "dev"],
    command: executable,
    shell: false,
  });
});

test("visual QA Tauri launch stays clean when Node deprecations throw", () => {
  const moduleUrl = new URL("./run-visual-qa.mjs", import.meta.url).href;
  const probe = `
    import { spawnSync } from "node:child_process";
    import { resolveVisualQaTauriLaunch } from ${JSON.stringify(moduleUrl)};

    const launch = resolveVisualQaTauriLaunch({ args: ["--version"] });
    const result = spawnSync(launch.command, launch.args, {
      encoding: "utf8",
      shell: launch.shell,
    });

    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", probe],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--throw-deprecation" },
    },
  );

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /tauri-cli 2\./);
  assert.doesNotMatch(result.stderr, /DEP0190/);
});
