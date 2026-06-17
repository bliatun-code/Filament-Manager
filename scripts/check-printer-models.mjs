#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(".");
const printerModelsPath = resolve(repoRoot, "src", "data", "supported_printer_models.json");
const supportedProfiles = new Set([
  "bambu_multi",
  "bambu_a1",
  "prusa_mmu",
  "prusa_mini",
  "prusa_xl",
  "prusa_xl_single",
  "prusa_xl_dual",
  "prusa_xl_five",
  "generic",
]);
const currentBambuStudioCodes = new Set([
  "A1",
  "A1M",
  "A2L",
  "H2C",
  "H2D",
  "H2DP",
  "H2S",
  "P1P",
  "P1S",
  "P2S",
  "X1",
  "X1C",
  "X1E",
  "X2D",
]);

function fail(message) {
  console.error(`Printer model check failed: ${message}`);
  process.exit(1);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

const models = JSON.parse(readFileSync(printerModelsPath, "utf8"));
if (!Array.isArray(models) || models.length === 0) {
  fail("supported_printer_models.json must contain a non-empty array");
}

const seenModels = new Set();
const seenBambuCodes = new Set();
const errors = [];
for (const [index, entry] of models.entries()) {
  const label = `entries[${index}]`;
  if (typeof entry !== "object" || entry == null) {
    errors.push(`${label} must be an object`);
    continue;
  }

  if (!nonEmptyString(entry.model)) {
    errors.push(`${label}.model must be a non-empty string`);
  } else {
    const normalizedModel = entry.model.trim().toLowerCase();
    if (seenModels.has(normalizedModel)) {
      errors.push(`${label}.model duplicates ${entry.model}`);
    }
    seenModels.add(normalizedModel);
  }

  if (!supportedProfiles.has(entry.profile)) {
    errors.push(`${label}.profile is not supported: ${entry.profile}`);
  }

  const rawBambuCode = entry.bambu_studio_code;
  if (rawBambuCode != null) {
    if (!nonEmptyString(rawBambuCode)) {
      errors.push(`${label}.bambu_studio_code must be non-empty when present`);
    } else if (!String(entry.model ?? "").trim().startsWith("Bambu Lab ")) {
      errors.push(`${label}.bambu_studio_code is only valid for Bambu Lab models`);
    } else {
      const normalizedCode = rawBambuCode.trim().toUpperCase();
      if (seenBambuCodes.has(normalizedCode)) {
        errors.push(`${label}.bambu_studio_code duplicates ${normalizedCode}`);
      }
      seenBambuCodes.add(normalizedCode);
    }
  }
}

for (const code of currentBambuStudioCodes) {
  if (!seenBambuCodes.has(code)) {
    errors.push(`missing current Bambu Studio printer code ${code}`);
  }
}

if (errors.length > 0) {
  for (const error of errors.slice(0, 25)) {
    console.error(`  - ${error}`);
  }
  if (errors.length > 25) {
    console.error(`  ...and ${errors.length - 25} more`);
  }
  fail(`${errors.length} validation error${errors.length === 1 ? "" : "s"}`);
}

console.log(`Printer model check ok (${models.length} models, ${seenBambuCodes.size} Bambu Studio codes).`);
