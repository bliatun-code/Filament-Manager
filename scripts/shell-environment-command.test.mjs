import assert from "node:assert/strict";
import test from "node:test";

import {
  formatShellEnvironmentAssignment,
  formatShellEnvironmentCommand,
} from "./shell-environment-command.mjs";

const variableName = "FILAMENT_MANAGER_DB_PATH";

test("formats a POSIX environment assignment with safe single-quote escaping", () => {
  assert.equal(
    formatShellEnvironmentAssignment(
      variableName,
      "Visual QA/O'Brien.db",
      "linux",
    ),
    "export FILAMENT_MANAGER_DB_PATH='Visual QA/O'\\''Brien.db'",
  );
});

test("formats a PowerShell environment assignment with safe single-quote escaping", () => {
  assert.equal(
    formatShellEnvironmentAssignment(
      variableName,
      String.raw`D:\Visual QA\O'Brien.db`,
      "win32",
    ),
    String.raw`$env:FILAMENT_MANAGER_DB_PATH='D:\Visual QA\O''Brien.db'`,
  );
});

test("formats copyable platform-specific commands", () => {
  assert.equal(
    formatShellEnvironmentCommand(
      [
        [variableName, "Visual QA/fixture.db"],
        ["FILAMENT_MANAGER_VISUAL_QA", "1"],
      ],
      "npm run tauri -- dev",
      "darwin",
    ),
    "FILAMENT_MANAGER_DB_PATH='Visual QA/fixture.db' FILAMENT_MANAGER_VISUAL_QA='1' npm run tauri -- dev",
  );
  assert.equal(
    formatShellEnvironmentCommand(
      [
        [variableName, String.raw`D:\Visual QA\fixture.db`],
        ["FILAMENT_MANAGER_VISUAL_QA", "1"],
      ],
      "npm.cmd run tauri -- dev",
      "win32",
    ),
    String.raw`$env:FILAMENT_MANAGER_DB_PATH='D:\Visual QA\fixture.db'; $env:FILAMENT_MANAGER_VISUAL_QA='1'; npm.cmd run tauri -- dev`,
  );
});

test("rejects invalid environment variable names", () => {
  assert.throws(
    () => formatShellEnvironmentAssignment("UNSAFE-NAME", "value", "linux"),
    /Invalid environment variable name/,
  );
});

test("requires environment entries and a command", () => {
  assert.throws(
    () => formatShellEnvironmentCommand([], "npm run tauri -- dev", "linux"),
    /At least one environment entry/,
  );
  assert.throws(
    () =>
      formatShellEnvironmentCommand(
        [[variableName, "fixture.db"]],
        "",
        "linux",
      ),
    /shell command is required/,
  );
});
