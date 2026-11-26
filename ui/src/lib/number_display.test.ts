import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_LOCALES } from "../../../src-tauri/companion_browser/supported_locales.js";
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

test("repeated gram labels follow locale changes and isolate custom precision and signs", () => {
  for (const {id, intlLocale} of [...SUPPORTED_LOCALES, SUPPORTED_LOCALES[0]]) {
    const unit = {style: "unit", unit: "gram", unitDisplay: "short"} as const;
    const standard = new Intl.NumberFormat(intlLocale, {...unit, maximumFractionDigits: 1});
    const signed = {signDisplay: "always", minimumFractionDigits: 2, maximumFractionDigits: 2} as const;
    assert.equal(formatDisplayGrams(1234.56, id), standard.format(1234.56));
    assert.equal(formatDisplayGrams(12.345, id, signed), new Intl.NumberFormat(intlLocale, {...unit, ...signed}).format(12.345));
    assert.equal(formatDisplayGrams(-12.345, id), standard.format(-12.345));
  }
  assert.equal(formatDisplayGrams(1234.5, " no "), formatDisplayGrams(1234.5, "nb"));
  assert.equal(formatDisplayGrams(1234.5, null), formatDisplayGrams(1234.5, "en"));
});
