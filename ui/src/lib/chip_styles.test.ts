import assert from "node:assert/strict";
import test from "node:test";

import { neutralChipClass } from "./chip_styles";

test("neutral chips use shared selected and soft control chrome", () => {
  assert.match(neutralChipClass(true), /app-selected-control/);
  assert.doesNotMatch(neutralChipClass(false), /app-selected-control/);
  assert.match(neutralChipClass(false), /app-soft-control/);
});
