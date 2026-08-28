import assert from "node:assert/strict";
import test from "node:test";

import { neutralChipClass } from "./chip_styles";

test("active neutral chips use the shared selected-control chrome", () => {
  assert.match(neutralChipClass(true), /app-selected-control/);
  assert.doesNotMatch(neutralChipClass(false), /app-selected-control/);
});
