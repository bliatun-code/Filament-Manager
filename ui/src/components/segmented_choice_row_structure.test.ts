import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./segmented_choice_row.tsx", import.meta.url), "utf8");

test("SegmentedChoiceRow exposes pressed state and keyboard focus treatment", () => {
  assert.match(source, /role="group"/);
  assert.match(source, /aria-label=\{groupAriaLabel \?\? label\}/);
  assert.match(source, /aria-pressed=\{active\}/);
  assert.match(source, /groupClassName = ""/);
  assert.match(source, /segmentedChoiceGroupClass\(groupClassName\)/);
  assert.match(source, /(?:app-control-group|appControlGroupClassName)/);
  assert.match(source, /appControlFocusClassName/);
  assert.match(source, /appControlDisabledClassName/);
  assert.match(source, /app-selected-control/);
  assert.match(source, /app-soft-control/);
  assert.match(source, /joinClassNames/);
  assert.doesNotMatch(
    source,
    /inline-flex items-center gap-2 rounded-xl \$\{sizeClasses\} font-semibold transition/,
  );
});
