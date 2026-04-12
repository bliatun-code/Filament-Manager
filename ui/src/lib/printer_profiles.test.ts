import test from "node:test";
import assert from "node:assert/strict";

import { listSupportedPrinterModels, resolvePrinterModelProfile } from "./printer_profiles";

test("listSupportedPrinterModels exposes the shared add-printer model list", () => {
  const models = listSupportedPrinterModels();

  assert.ok(models.includes("Bambu Lab X1 Carbon"));
  assert.ok(models.includes("Prusa XL (Five Toolhead)"));
  assert.ok(models.includes("Creality K1"));
  assert.ok(models.includes("Anycubic Kobra 2"));
  assert.ok(models.includes("Custom model"));
  assert.equal(new Set(models).size, models.length);
});

test("resolvePrinterModelProfile keeps generic fallback for non-profiled exact models", () => {
  const profile = resolvePrinterModelProfile("Creality K1");

  assert.equal(profile.systemKind, "GENERIC");
  assert.equal(profile.maxUnits, 4);
  assert.equal(profile.maxSlotsPerUnit, 8);
});
