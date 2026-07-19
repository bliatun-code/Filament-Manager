import assert from "node:assert/strict";
import test from "node:test";

import {
  parseNodeModuleVersionMismatch,
  probeBetterSqlite,
} from "./doctor-database.mjs";

test("doctor parses multiline native Node ABI mismatch diagnostics", () => {
  assert.deepEqual(
    parseNodeModuleVersionMismatch(`
The module '/project/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 127. This version of Node.js requires
NODE_MODULE_VERSION 137. Please try re-compiling or re-installing the module.
`),
    {
      builtAbi: 127,
      requiredAbi: 137,
    },
  );
});

test("doctor parses Windows native Node ABI mismatch diagnostics", () => {
  const modulePath = String.raw`\\?\C:\Program Files\Filament Manager\better_sqlite3.node`;
  assert.deepEqual(
    parseNodeModuleVersionMismatch(
      `The module '${modulePath}'\r\nwas compiled against a different Node.js version using\r\n` +
        "NODE_MODULE_VERSION 115. This version of Node.js requires\r\n" +
        "NODE_MODULE_VERSION 137.",
    ),
    {
      builtAbi: 115,
      requiredAbi: 137,
    },
  );
});

test("doctor rejects unrelated, ambiguous, and invalid ABI diagnostics", () => {
  const unrelatedMessages = [
    "better-sqlite3 is unavailable",
    "Node.js requires NODE_MODULE_VERSION 137.",
    "Built with NODE_MODULE_VERSION 127.",
    "Could not locate the bindings file.",
    "%1 is not a valid Win32 application.",
    "Module did not self-register.",
    "mach-o file, but is an incompatible architecture",
    "Documentation says NODE_MODULE_VERSION 115; plugin foo requires NODE_MODULE_VERSION 137.",
    "NODE_MODULE_VERSION 137. This version of Node.js requires NODE_MODULE_VERSION 137.",
    "NODE_MODULE_VERSION 9007199254740992. This version of Node.js requires NODE_MODULE_VERSION 137.",
    "",
    null,
  ];
  for (const message of unrelatedMessages) {
    assert.equal(parseNodeModuleVersionMismatch(message), null);
  }
});

test("doctor opens and closes an in-memory database to verify the native binding", async () => {
  const calls = [];
  class FakeDatabase {
    constructor(databasePath) {
      calls.push(["open", databasePath]);
    }

    close() {
      calls.push(["close"]);
    }
  }

  assert.deepEqual(
    await probeBetterSqlite({
      loadModule: async () => ({ default: FakeDatabase }),
    }),
    {
      mismatch: null,
      ready: true,
      reason: "",
    },
  );
  assert.deepEqual(calls, [["open", ":memory:"], ["close"]]);
});

test("doctor reports and classifies native binding constructor failures", async () => {
  const reason =
    "NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 137.";
  class IncompatibleDatabase {
    constructor() {
      throw new Error(reason);
    }
  }

  assert.deepEqual(
    await probeBetterSqlite({
      loadModule: async () => ({ default: IncompatibleDatabase }),
    }),
    {
      mismatch: {
        builtAbi: 127,
        requiredAbi: 137,
      },
      ready: false,
      reason,
    },
  );
});

test("doctor keeps non-ABI native binding failures unclassified", async () => {
  assert.deepEqual(
    await probeBetterSqlite({
      loadModule: async () => {
        throw new Error("%1 is not a valid Win32 application.");
      },
    }),
    {
      mismatch: null,
      ready: false,
      reason: "%1 is not a valid Win32 application.",
    },
  );
});
