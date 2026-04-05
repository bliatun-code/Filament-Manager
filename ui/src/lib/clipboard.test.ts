import assert from "node:assert/strict";
import test from "node:test";

import { copyTextToClipboard } from "./clipboard";

test("copyTextToClipboard uses navigator clipboard when available", async () => {
  const copied: string[] = [];
  await copyTextToClipboard("http://example.test/companion", {
    navigator: {
      clipboard: {
        async writeText(text: string) {
          copied.push(text);
        },
      },
    },
  });

  assert.deepEqual(copied, ["http://example.test/companion"]);
});

test("copyTextToClipboard falls back to execCommand when navigator clipboard is unavailable", async () => {
  const appended: string[] = [];
  const removed: string[] = [];
  const selections: string[] = [];

  await copyTextToClipboard("launch-token", {
    document: {
      createElement() {
        return {
          value: "",
          setAttribute() {},
          style: {
            position: "",
            left: "",
          },
          select() {
            selections.push("selected");
          },
        };
      },
      body: {
        appendChild(node) {
          appended.push(node.value);
        },
        removeChild(node) {
          removed.push(node.value);
        },
      },
      execCommand(command) {
        assert.equal(command, "copy");
        return true;
      },
    },
  });

  assert.deepEqual(appended, ["launch-token"]);
  assert.deepEqual(removed, ["launch-token"]);
  assert.deepEqual(selections, ["selected"]);
});

test("copyTextToClipboard fails cleanly when no clipboard implementation is available", async () => {
  await assert.rejects(
    () => copyTextToClipboard("launch-token", {}),
    /Clipboard copy unavailable/,
  );
});

test("copyTextToClipboard surfaces fallback copy failure", async () => {
  await assert.rejects(
    () =>
      copyTextToClipboard("launch-token", {
        document: {
          createElement() {
            return {
              value: "",
              setAttribute() {},
              style: {
                position: "",
                left: "",
              },
              select() {},
            };
          },
          body: {
            appendChild() {},
            removeChild() {},
          },
          execCommand() {
            return false;
          },
        },
      }),
    /Clipboard copy failed/,
  );
});
