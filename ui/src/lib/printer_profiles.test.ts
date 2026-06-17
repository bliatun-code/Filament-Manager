import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  formatBambuStudioPrinterProfileCode,
  listSupportedPrinterModels,
  resolvePrinterModelProfile,
  summarizeEffectivePrinterSlots,
} from "./printer_profiles";

type SupportedPrinterModelFixture = {
  model: string;
  bambu_studio_code?: string | null;
};

const supportedPrinterModelFixtures = JSON.parse(
  fs.readFileSync(
    new URL("../../../src/data/supported_printer_models.json", import.meta.url),
    "utf8",
  ),
) as SupportedPrinterModelFixture[];
const currentBambuStudioCodes = JSON.parse(
  fs.readFileSync(
    new URL("../../../src/data/bambu_studio_printer_profile_codes.json", import.meta.url),
    "utf8",
  ),
) as string[];

function expectedBambuStudioCodeLabels(): Array<[string, string]> {
  const labelByCode = new Map(
    supportedPrinterModelFixtures
      .filter((entry) => entry.bambu_studio_code)
      .map((entry) => [
        String(entry.bambu_studio_code).trim().toUpperCase(),
        entry.model.replace(/^Bambu Lab\s+/i, "").trim(),
      ]),
  );
  return currentBambuStudioCodes.map((code) => {
    const label = labelByCode.get(code);
    assert.ok(label, `missing Bambu Studio fixture label for ${code}`);
    return [code, label];
  });
}

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

test("formatBambuStudioPrinterProfileCode uses the shared printer catalog codes", () => {
  for (const [code, label] of expectedBambuStudioCodeLabels()) {
    assert.equal(formatBambuStudioPrinterProfileCode(code), label);
  }
  assert.equal(formatBambuStudioPrinterProfileCode(" "), null);
  assert.equal(formatBambuStudioPrinterProfileCode("UNKNOWN"), "UNKNOWN");
});

test("resolvePrinterModelProfile keeps generic fallback for non-profiled exact models", () => {
  const profile = resolvePrinterModelProfile("Creality K1");

  assert.equal(profile.systemKind, "GENERIC");
  assert.equal(profile.maxUnits, 4);
  assert.equal(profile.maxSlotsPerUnit, 8);
});

test("summarizeEffectivePrinterSlots treats AMS/MMU slots as the readiness target when present", () => {
  const summary = summarizeEffectivePrinterSlots([
    { ams_id: "printer_ext", spool_id: "spool-ext" },
    { ams_id: "printer_ams_1", spool_id: "spool-1" },
    { ams_id: "printer_ams_1", spool_id: "spool-2" },
    { ams_id: "printer_ams_1", spool_id: null },
    { ams_id: "printer_ams_1", spool_id: "" },
  ]);

  assert.equal(summary.mode, "MULTI");
  assert.equal(summary.loadedSlots, 2);
  assert.equal(summary.totalSlots, 4);
  assert.deepEqual(
    summary.slots.map((slot) => slot.ams_id),
    ["printer_ams_1", "printer_ams_1", "printer_ams_1", "printer_ams_1"],
  );
});

test("summarizeEffectivePrinterSlots uses EXT as readiness target for single-material printers", () => {
  const emptySummary = summarizeEffectivePrinterSlots([{ ams_id: "printer_ext", spool_id: null }]);
  assert.equal(emptySummary.mode, "EXT");
  assert.equal(emptySummary.loadedSlots, 0);
  assert.equal(emptySummary.totalSlots, 1);

  const loadedSummary = summarizeEffectivePrinterSlots([{ ams_id: "printer_ext", spool_id: "spool-ext" }]);
  assert.equal(loadedSummary.mode, "EXT");
  assert.equal(loadedSummary.loadedSlots, 1);
  assert.equal(loadedSummary.totalSlots, 1);
});
