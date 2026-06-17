#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath =
  process.argv[2] ??
  path.join(
    process.env.HOME ?? "",
    "Library",
    "Application Support",
    "com.bambu.filament.manager",
    "bambu.db",
  );
const outputPath =
  process.argv[3] ?? path.join("src", "data", "seed_filament_catalog.json");
const version = process.argv[4] ?? "2026.06.17-local-1106";

const db = new Database(dbPath, { readonly: true });
const rows = db
  .prepare(
    `
      SELECT material, filament_name, color_name, hex_color, product_url,
             default_weight, vendor, is_discontinued
      FROM filament_master_list
      ORDER BY vendor, material, filament_name, color_name
    `,
  )
  .all();

function isShoutingAsciiLabel(value) {
  const letters = Array.from(value).filter((char) => /[A-Za-z]/.test(char));
  return letters.length > 0 && letters.every((char) => char === char.toUpperCase());
}

function titleCaseAsciiLabel(value) {
  let nextUpper = true;
  return Array.from(value)
    .map((char) => {
      if (/[A-Za-z]/.test(char)) {
        const normalized = nextUpper ? char.toUpperCase() : char.toLowerCase();
        nextUpper = false;
        return normalized;
      }
      nextUpper = /[\s\-\/_([{]/.test(char);
      return char;
    })
    .join("");
}

function normalizeSeedColorName(value) {
  const trimmed = value.trim();
  return isShoutingAsciiLabel(trimmed) ? titleCaseAsciiLabel(trimmed) : trimmed;
}

function catalogIdentityKey(entry) {
  return [entry.material, entry.filament_name, entry.color_name]
    .map((value) => value.trim().toLowerCase())
    .join("\u001f");
}

function catalogEntryRank(entry) {
  return [
    entry.is_discontinued ? 1 : 0,
    isShoutingAsciiLabel(entry.color_name) ? 1 : 0,
    entry.product_url ? 0 : 1,
    entry.id,
  ];
}

function compareRank(left, right) {
  const leftRank = catalogEntryRank(left);
  const rightRank = catalogEntryRank(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] < rightRank[index]) {
      return -1;
    }
    if (leftRank[index] > rightRank[index]) {
      return 1;
    }
  }
  return 0;
}

function dedupeEntries(rawEntries) {
  const byIdentity = new Map();
  for (const entry of rawEntries) {
    const key = catalogIdentityKey(entry);
    const existing = byIdentity.get(key);
    if (!existing || compareRank(entry, existing) < 0) {
      byIdentity.set(key, entry);
    }
  }
  return Array.from(byIdentity.values()).sort((left, right) =>
    [left.vendor, left.material, left.filament_name, left.color_name, left.id]
      .join("\u001f")
      .localeCompare(
        [right.vendor, right.material, right.filament_name, right.color_name, right.id].join(
          "\u001f",
        ),
      ),
  );
}

const entries = dedupeEntries(
  rows
    .map((row) => {
      const entry = {
        vendor: String(row.vendor ?? "").trim() || "Generic",
        material: String(row.material ?? "").trim(),
        filament_name: String(row.filament_name ?? "").trim(),
        color_name: normalizeSeedColorName(String(row.color_name ?? "")),
        hex_color: String(row.hex_color ?? "").trim() || null,
        product_url: String(row.product_url ?? "").trim() || null,
        default_weight: Math.max(1, Number(row.default_weight) || 1000),
        is_discontinued: Number(row.is_discontinued) !== 0,
      };
      const idKey = [
        entry.vendor,
        entry.material,
        entry.filament_name,
        entry.color_name,
      ].join("\u001f");
      return {
        ...entry,
        id: `seed_${crypto.createHash("sha256").update(idKey).digest("hex").slice(0, 18)}`,
      };
    })
    .filter((entry) => entry.material && entry.filament_name && entry.color_name),
);

const payload = {
  version,
  generated_at: new Date().toISOString().slice(0, 10),
  description:
    "Sanitized master filament catalog seed generated from the local Filament Manager catalog. Contains only vendor/material/name/color/swatch/default-weight/catalog URL metadata; no spool, loan, printer, RFID, location, or user history data.",
  entries,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

const byVendor = entries.reduce((counts, entry) => {
  counts[entry.vendor] = (counts[entry.vendor] ?? 0) + 1;
  return counts;
}, {});
console.log(
  JSON.stringify(
    {
      dbPath,
      outputPath,
      version,
      entries: entries.length,
      discontinued: entries.filter((entry) => entry.is_discontinued).length,
      byVendor,
    },
    null,
    2,
  ),
);
