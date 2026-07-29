import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDisplayCelsius,
  formatDisplayGrams,
  formatDisplayInteger,
  formatDisplayKilograms,
  formatDisplayNumber,
  formatDisplayPercent,
} from "./number_display";

test("number display uses English separators and short units", () => {
  assert.equal(
    formatDisplayNumber(1234.5, "en", { maximumFractionDigits: 1 }),
    "1,234.5",
  );
  assert.equal(formatDisplayInteger(1234, "en"), "1,234");
  assert.equal(formatDisplayGrams(1234.5, "en"), "1,234.5 g");
  assert.equal(
    formatDisplayKilograms(4.15, "en", {
      minimumFractionDigits: 2,
    }),
    "4.15 kg",
  );
  assert.equal(formatDisplayPercent(12.5, "en", 1), "12.5%");
  assert.equal(formatDisplayCelsius(22.5, "en", 1), "22.5°C");
});

test("number display uses comma decimals and localized spacing for Norwegian", () => {
  assert.equal(
    formatDisplayNumber(1234.5, "nb", { maximumFractionDigits: 1 }),
    "1\u00a0234,5",
  );
  assert.equal(formatDisplayInteger(1234, "nb"), "1\u00a0234");
  assert.equal(formatDisplayGrams(1234.5, "nb"), "1\u00a0234,5 g");
  assert.equal(
    formatDisplayKilograms(4.15, "nb", {
      minimumFractionDigits: 2,
    }),
    "4,15 kg",
  );
  assert.equal(formatDisplayPercent(12.5, "nb", 1), "12,5\u00a0%");
  assert.equal(formatDisplayCelsius(22.5, "nb", 1), "22,5 °C");
});
