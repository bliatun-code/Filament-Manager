import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  discoveredMaterialsFromNames,
  inferMaterial,
} from "../../../src/scraper/bambu_filament_scraper";

type BambuMaterialFamily = {
  material: string;
  prefixes: string[];
};

const bambuMaterialFamilies = JSON.parse(
  fs.readFileSync(
    new URL("../../../src/data/bambu_material_families.json", import.meta.url),
    "utf8",
  ),
) as BambuMaterialFamily[];

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

test("Bambu scraper material family table stays unique and specificity ordered", () => {
  assert.ok(bambuMaterialFamilies.length > 0, "Bambu material family table is empty");

  const seenMaterials = new Set<string>();
  const seenPrefixes = new Set<string>();
  const flattenedPrefixes: Array<{ material: string; prefix: string }> = [];

  for (const [familyIndex, family] of bambuMaterialFamilies.entries()) {
    assert.ok(
      family.material.trim().length > 0,
      `empty Bambu material family name at index ${familyIndex}`,
    );
    const normalizedMaterial = family.material.trim().toUpperCase();
    assert.ok(!seenMaterials.has(normalizedMaterial), `duplicate Bambu material ${family.material}`);
    seenMaterials.add(normalizedMaterial);

    assert.ok(family.prefixes.length > 0, `Bambu material ${family.material} has no prefixes`);
    for (const prefix of family.prefixes) {
      assert.equal(prefix, prefix.trim(), `Bambu material prefix has surrounding whitespace: ${prefix}`);
      assert.ok(prefix.length > 0, `empty Bambu material prefix for ${family.material}`);

      const normalizedPrefix = prefix.toUpperCase();
      assert.ok(!seenPrefixes.has(normalizedPrefix), `duplicate Bambu material prefix ${prefix}`);
      seenPrefixes.add(normalizedPrefix);
      flattenedPrefixes.push({ material: family.material, prefix: normalizedPrefix });
    }
  }

  for (const [leftIndex, left] of flattenedPrefixes.entries()) {
    for (const right of flattenedPrefixes.slice(leftIndex + 1)) {
      assert.ok(
        !right.prefix.startsWith(left.prefix),
        `Bambu material prefix ${left.prefix} for ${left.material} shadows later prefix ` +
          `${right.prefix} for ${right.material}; put the more specific prefix first`,
      );
    }
  }
});
