import assert from "node:assert/strict";
import test from "node:test";

import {
  discoveredMaterialsFromNames,
  inferMaterial,
} from "../../../src/scraper/bambu_filament_scraper";

test("Bambu scraper material inference matches the backend material families", () => {
  assert.equal(inferMaterial("PLA Basic"), "PLA");
  assert.equal(inferMaterial("PA6-CF"), "PA6");
  assert.equal(inferMaterial("PA-CF"), "PA");
  assert.equal(inferMaterial("PPA-CF"), "PPA");
  assert.equal(inferMaterial("PCTG"), "PCTG");
  assert.equal(inferMaterial("PPS-CF"), "PPS");
  assert.equal(inferMaterial("PVA"), "PVA");
  assert.equal(inferMaterial("PP"), "PP");
  assert.equal(inferMaterial("PE Support"), "PE");
  assert.equal(inferMaterial("BVOH Support"), "BVOH");
  assert.equal(inferMaterial("EVA"), "EVA");
  assert.equal(inferMaterial("HIPS"), "HIPS");
  assert.equal(inferMaterial("PHA"), "PHA");
  assert.equal(inferMaterial("Support for PLA"), "Support for PLA");
  assert.equal(inferMaterial("Support For PLA/PETG"), "Support for PLA/PETG");
  assert.equal(inferMaterial("Custom Blend"), "CUSTOM");
});

test("Bambu scraper discovered materials include current BambuStudio families", () => {
  const values = discoveredMaterialsFromNames([
    "PLA Basic",
    "PETG HF",
    "ABS-GF",
    "TPU for AMS",
    "PA6-CF",
    "PAHT-CF",
    "PA-CF",
    "PPA-CF",
    "PET-CF",
    "PCTG",
    "PC FR",
    "PP",
    "PE Support",
    "PPS-CF",
    "PVA",
    "BVOH Support",
    "EVA",
    "HIPS",
    "PHA",
    "ASA Aero",
    "Support for PLA",
    "Support for PLA/PETG",
    "PLA Basic",
  ]);

  assert.deepEqual(values, [
    "ABS",
    "ASA",
    "BVOH",
    "EVA",
    "HIPS",
    "PA",
    "PA6",
    "PAHT",
    "PC",
    "PCTG",
    "PE",
    "PET",
    "PETG",
    "PHA",
    "PLA",
    "PP",
    "PPA",
    "PPS",
    "PVA",
    "Support for PLA",
    "Support for PLA/PETG",
    "TPU",
  ]);
});
