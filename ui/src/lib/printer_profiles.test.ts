import test from "node:test";
import assert from "node:assert/strict";

import { listSupportedPrinterModels, resolvePrinterModelProfile } from "./printer_profiles";

test("listSupportedPrinterModels exposes the shared add-printer model list", () => {
  const models = listSupportedPrinterModels();

  assert.ok(models.includes("Bambu Lab X1 Carbon"));
  assert.ok(models.includes("Bambu Lab X1"));
  assert.ok(models.includes("Bambu Lab H2D Pro"));
  assert.ok(models.includes("Bambu Lab H2S"));
  assert.ok(models.includes("Bambu Lab H2C"));
  assert.ok(models.includes("Bambu Lab P2S"));
  assert.ok(models.includes("Bambu Lab X2D"));
  assert.ok(models.includes("Bambu Lab A2L"));
  assert.ok(models.includes("Prusa XL (Five Toolhead)"));
  assert.ok(models.includes("Creality K1"));
  assert.ok(models.includes("Anycubic Kobra 2"));
  assert.ok(models.includes("Custom model"));
  assert.equal(new Set(models).size, models.length);
});

test("resolvePrinterModelProfile maps current Bambu Studio models conservatively", () => {
  assert.equal(resolvePrinterModelProfile("Bambu Lab A2L").systemKind, "AMS");
  assert.equal(resolvePrinterModelProfile("Bambu Lab A2L").maxUnits, 1);
  assert.equal(resolvePrinterModelProfile("Bambu Lab H2D Pro").systemKind, "AMS");
  assert.equal(resolvePrinterModelProfile("Bambu Lab H2D Pro").maxUnits, 4);
  assert.equal(resolvePrinterModelProfile("Bambu Lab P2S").maxSlotsPerUnit, 4);
  assert.equal(resolvePrinterModelProfile("Bambu Lab X2D").defaultSlotsPerUnit, 4);
});

test("resolvePrinterModelProfile keeps generic fallback for non-profiled exact models", () => {
  const profile = resolvePrinterModelProfile("Creality K1");

  assert.equal(profile.systemKind, "GENERIC");
  assert.equal(profile.maxUnits, 4);
  assert.equal(profile.maxSlotsPerUnit, 8);
});
