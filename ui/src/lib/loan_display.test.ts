import test from "node:test";
import assert from "node:assert/strict";

import {
  inventorySwatchCardStyle,
  inventorySwatchInsetStyle,
} from "./inventory_swatch_style";
import {
  loanFactLabelClassName,
  loanFactValueClassName,
  loanSwatchPreviewStyle,
  loanSwatchSurfaceStyle,
} from "./loan_display";

test("loan swatch surfaces share the inventory swatch contract", () => {
  assert.deepEqual(
    loanSwatchSurfaceStyle("#B91C1C", "card", "dark"),
    inventorySwatchCardStyle("#B91C1C", "dark"),
  );
  assert.deepEqual(
    loanSwatchSurfaceStyle("#B91C1C", "inset", "light"),
    inventorySwatchInsetStyle("#B91C1C", "light"),
  );
});

test("loan swatch preview uses the shared swatch gradient language", () => {
  assert.equal(loanSwatchPreviewStyle("#B91C1C").background, "#B91C1C");
  assert.match(
    loanSwatchPreviewStyle("gradient(#B91C1C,#2563EB)").background,
    /^linear-gradient\(145deg, /,
  );
});

test("loan fact typography matches modal detail scale", () => {
  assert.equal(
    loanFactLabelClassName,
    "text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400",
  );
  assert.equal(
    loanFactValueClassName,
    "mt-1 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-50",
  );
});
