#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isNonEmptyString,
  isShoutingAsciiLabel,
  isValidSwatch,
  seedCatalogIdentityKey,
} from "./seed-catalog-utils.mjs";

const repoRoot = resolve(".");
const seedCatalogPath = resolve(repoRoot, "src", "data", "seed_filament_catalog.json");
const seed = JSON.parse(readFileSync(seedCatalogPath, "utf8"));

function fail(message) {
  console.error(`Seed catalog check failed: ${message}`);
  process.exit(1);
}

if (!isNonEmptyString(seed.version)) {
  fail("version must be a non-empty string");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(seed.generated_at ?? ""))) {
  fail("generated_at must use YYYY-MM-DD format");
}
if (!Array.isArray(seed.entries) || seed.entries.length === 0) {
  fail("entries must be a non-empty array");
}

const ids = new Set();
const identities = new Set();
const errors = [];
for (const [index, entry] of seed.entries.entries()) {
  const label = `entries[${index}]`;
  for (const field of ["vendor", "material", "filament_name", "color_name", "id"]) {
    if (!isNonEmptyString(entry[field])) {
      errors.push(`${label}.${field} must be a non-empty string`);
    }
  }
  if (!/^seed_[a-f0-9]{18}$/.test(String(entry.id ?? ""))) {
    errors.push(`${label}.id must match seed_<18 lowercase hex chars>`);
  }
  if (ids.has(entry.id)) {
    errors.push(`${label}.id duplicates ${entry.id}`);
  }
  ids.add(entry.id);

  const identity = seedCatalogIdentityKey(entry);
  if (identities.has(identity)) {
    errors.push(
      `${label} duplicates normalized material/filament/color identity for ${entry.material} / ${entry.filament_name} / ${entry.color_name}`,
    );
  }
  identities.add(identity);

  if (isShoutingAsciiLabel(entry.color_name)) {
    errors.push(`${label}.color_name should be normalized from all-caps display text`);
  }
  if (entry.product_url != null && !/^https?:\/\//.test(String(entry.product_url).trim())) {
    errors.push(`${label}.product_url must be null or an http(s) URL`);
  }
  if (!Number.isInteger(entry.default_weight) || entry.default_weight < 1) {
    errors.push(`${label}.default_weight must be a positive integer`);
  }
  if (typeof entry.is_discontinued !== "boolean") {
    errors.push(`${label}.is_discontinued must be a boolean`);
  }
  if (!isValidSwatch(entry.hex_color)) {
    errors.push(`${label}.hex_color must be null, a hex color, multi(...), or gradient(...)`);
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

console.log(`Seed catalog check ok (${seed.entries.length} entries, ${ids.size} unique ids).`);
