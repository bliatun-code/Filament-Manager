#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(".");
const materialFamiliesPath = resolve(repoRoot, "src", "data", "bambu_material_families.json");
const officialHexPath = resolve(repoRoot, "src", "data", "bambu_official_hex_codes.json");

function fail(message) {
  console.error(`Bambu data check failed: ${message}`);
  process.exit(1);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHex(value) {
  return typeof value === "string" && /^#[0-9A-F]{6}$/.test(value);
}

function isNormalizedLookupKey(value) {
  return typeof value === "string" && /^[a-z0-9]+$/.test(value);
}

function reportErrors(errors) {
  if (errors.length === 0) {
    return;
  }
  for (const error of errors.slice(0, 25)) {
    console.error(`  - ${error}`);
  }
  if (errors.length > 25) {
    console.error(`  ...and ${errors.length - 25} more`);
  }
  fail(`${errors.length} validation error${errors.length === 1 ? "" : "s"}`);
}

const materialFamilies = JSON.parse(readFileSync(materialFamiliesPath, "utf8"));
const officialHexEntries = JSON.parse(readFileSync(officialHexPath, "utf8"));
const errors = [];

if (!Array.isArray(materialFamilies) || materialFamilies.length === 0) {
  fail("bambu_material_families.json must contain a non-empty array");
}

const seenMaterials = new Set();
const seenPrefixes = new Set();
const flattenedPrefixes = [];
for (const [familyIndex, family] of materialFamilies.entries()) {
  const label = `materialFamilies[${familyIndex}]`;
  if (!isPlainObject(family)) {
    errors.push(`${label} must be an object`);
    continue;
  }

  if (!isNonEmptyString(family.material)) {
    errors.push(`${label}.material must be a non-empty string`);
  } else {
    if (family.material !== family.material.trim()) {
      errors.push(`${label}.material must be trimmed`);
    }
    const normalizedMaterial = family.material.trim().toUpperCase();
    if (seenMaterials.has(normalizedMaterial)) {
      errors.push(`${label}.material duplicates ${family.material}`);
    }
    seenMaterials.add(normalizedMaterial);
  }

  if (!Array.isArray(family.prefixes) || family.prefixes.length === 0) {
    errors.push(`${label}.prefixes must be a non-empty array`);
    continue;
  }

  for (const [prefixIndex, prefix] of family.prefixes.entries()) {
    const prefixLabel = `${label}.prefixes[${prefixIndex}]`;
    if (!isNonEmptyString(prefix)) {
      errors.push(`${prefixLabel} must be a non-empty string`);
      continue;
    }
    if (prefix !== prefix.trim()) {
      errors.push(`${prefixLabel} must be trimmed`);
    }
    const normalizedPrefix = prefix.trim().toUpperCase();
    if (seenPrefixes.has(normalizedPrefix)) {
      errors.push(`${prefixLabel} duplicates ${prefix}`);
    }
    seenPrefixes.add(normalizedPrefix);
    flattenedPrefixes.push({
      material: family.material,
      prefix: normalizedPrefix,
      source: prefixLabel,
    });
  }
}

for (const [leftIndex, left] of flattenedPrefixes.entries()) {
  for (const right of flattenedPrefixes.slice(leftIndex + 1)) {
    if (right.prefix.startsWith(left.prefix)) {
      errors.push(
        `${left.source} (${left.prefix}) for ${left.material} shadows later ` +
          `${right.source} (${right.prefix}) for ${right.material}; put the more specific prefix first`,
      );
    }
  }
}

if (!Array.isArray(officialHexEntries) || officialHexEntries.length === 0) {
  fail("bambu_official_hex_codes.json must contain a non-empty array");
}

const seenOfficialHexKeys = new Set();
for (const [entryIndex, entry] of officialHexEntries.entries()) {
  const label = `officialHex[${entryIndex}]`;
  if (!isPlainObject(entry)) {
    errors.push(`${label} must be an object`);
    continue;
  }

  for (const field of ["filament", "color"]) {
    if (!isNormalizedLookupKey(entry[field])) {
      errors.push(`${label}.${field} must be a normalized lowercase lookup key`);
    }
  }

  const key = `${entry.filament ?? ""}/${entry.color ?? ""}`;
  if (seenOfficialHexKeys.has(key)) {
    errors.push(`${label} duplicates official Bambu hex key ${key}`);
  }
  seenOfficialHexKeys.add(key);

  if (!isHex(entry.hex)) {
    errors.push(`${label}.hex must be an uppercase #RRGGBB color`);
  }

  if (entry.kind != null && entry.kind !== "multi" && entry.kind !== "gradient") {
    errors.push(`${label}.kind must be multi or gradient when present`);
  }

  if (entry.kind == null && entry.colors != null) {
    errors.push(`${label}.colors is only valid for multi or gradient entries`);
  }

  if (entry.kind != null) {
    if (!Array.isArray(entry.colors) || entry.colors.length < 2) {
      errors.push(`${label}.colors must contain at least two colors for ${entry.kind}`);
    } else {
      for (const [colorIndex, color] of entry.colors.entries()) {
        if (!isHex(color)) {
          errors.push(`${label}.colors[${colorIndex}] must be an uppercase #RRGGBB color`);
        }
      }
    }
  }
}

reportErrors(errors);

console.log(
  `Bambu data check ok (${materialFamilies.length} material families, ${officialHexEntries.length} official hex entries).`,
);
