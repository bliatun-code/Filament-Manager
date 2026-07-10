import assert from "node:assert/strict";
import test from "node:test";
import { resolveAppModalTabTarget } from "./app_modal_focus";

test("AppModal tab model wraps focus at both dialog edges", () => {
  assert.equal(
    resolveAppModalTabTarget({ activeIndex: 2, focusableCount: 3, shiftKey: false }),
    "first",
  );
  assert.equal(
    resolveAppModalTabTarget({ activeIndex: 0, focusableCount: 3, shiftKey: true }),
    "last",
  );
  assert.equal(
    resolveAppModalTabTarget({ activeIndex: -1, focusableCount: 3, shiftKey: false }),
    "first",
  );
  assert.equal(
    resolveAppModalTabTarget({ activeIndex: -1, focusableCount: 3, shiftKey: true }),
    "last",
  );
});

test("AppModal tab model preserves normal movement and handles an empty dialog", () => {
  assert.equal(
    resolveAppModalTabTarget({ activeIndex: 1, focusableCount: 3, shiftKey: false }),
    null,
  );
  assert.equal(
    resolveAppModalTabTarget({ activeIndex: 1, focusableCount: 3, shiftKey: true }),
    null,
  );
  assert.equal(
    resolveAppModalTabTarget({ activeIndex: -1, focusableCount: 0, shiftKey: false }),
    "panel",
  );
});
