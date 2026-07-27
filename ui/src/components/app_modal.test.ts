import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_MODAL_FOCUSABLE_SELECTOR,
  resolveAppModalTabTarget,
} from "./app_modal_focus";

test("AppModal includes native details summaries in its focus order", () => {
  assert.ok(APP_MODAL_FOCUSABLE_SELECTOR.split(",").includes("summary"));
});

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

test("AppModal lets the browser move normally to and from an intermediate summary", () => {
  assert.equal(
    resolveAppModalTabTarget({ activeIndex: 1, focusableCount: 3, shiftKey: false }),
    null,
  );
  assert.equal(
    resolveAppModalTabTarget({ activeIndex: 1, focusableCount: 3, shiftKey: true }),
    null,
  );
});
