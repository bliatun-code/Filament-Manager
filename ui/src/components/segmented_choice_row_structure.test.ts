import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./segmented_choice_row.tsx", import.meta.url), "utf8");

test("SegmentedChoiceRow exposes pressed state and keyboard focus treatment", () => {
  assert.match(source, /role="group"/);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /aria-pressed=\{active\}/);
  assert.match(source, /groupClassName = ""/);
  assert.match(source, /segmentedChoiceGroupClass\(groupClassName\)/);
  assert.match(source, /focus-visible:border-sky-300/);
  assert.match(source, /focus-visible:ring-2/);
  assert.doesNotMatch(
    source,
    /inline-flex items-center gap-2 rounded-xl \$\{sizeClasses\} font-semibold transition/,
  );
});
