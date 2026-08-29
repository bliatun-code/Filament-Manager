#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import {
  dedupeSeedCatalogEntries,
  normalizeSeedColorName,
  normalizeSwatchValue,
} from "./seed-catalog-utils.mjs";

const APP_IDENTIFIER = "no.bliatun.filamentmanager";
const APP_DATABASE_FILE = "filament-manager.db";
const LEGACY_APP_DATABASE_FILE = "bambu.db";

function nonEmptyEnvValue(env, name) {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function databasePathIn(directory, pathApi) {
  return pathApi.join(directory, APP_IDENTIFIER, APP_DATABASE_FILE);
}

function existingDatabasePathIn(directory, pathApi, pathExists) {
  if (!directory) {
    return null;
  }
  for (const fileName of [APP_DATABASE_FILE, LEGACY_APP_DATABASE_FILE]) {
    const candidate = pathApi.join(directory, APP_IDENTIFIER, fileName);
    if (pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveDefaultSeedCatalogDatabasePath(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();
  const pathExists = options.pathExists ?? fs.existsSync;
  const pathApi = platform === "win32" ? path.win32 : path.posix;

  if (platform === "darwin") {
    return databasePathIn(
      pathApi.join(
        homeDirectory,
        "Library",
        "Application Support", // path-portability-allow: guarded by platform === "darwin"
      ),
      pathApi,
    );
  }

  if (platform === "win32") {
    const localData = nonEmptyEnvValue(env, "LOCALAPPDATA");
    const roamingData = nonEmptyEnvValue(env, "APPDATA");
    const localPath = localData ? databasePathIn(localData, pathApi) : null;
    const roamingPath = roamingData ? databasePathIn(roamingData, pathApi) : null;
    const existingLocalPath = existingDatabasePathIn(
      localData,
      pathApi,
      pathExists,
    );
    const existingRoamingPath = existingDatabasePathIn(
      roamingData,
      pathApi,
      pathExists,
    );

    if (existingLocalPath) {
      return existingLocalPath;
    }
    if (existingRoamingPath) {
      return existingRoamingPath;
    }
    if (localPath) {
      return localPath;
    }
    if (roamingPath) {
      return roamingPath;
    }
    throw new Error(
      "Cannot resolve the Windows Filament Manager database. Pass its path explicitly or set LOCALAPPDATA/APPDATA.",
    );
  }

  const dataDirectory =
    nonEmptyEnvValue(env, "XDG_DATA_HOME") ??
    pathApi.join(homeDirectory, ".local", "share");
  return databasePathIn(dataDirectory, pathApi);
}

export function exportSeedCatalog(argv = process.argv.slice(2)) {
  const dbPath = argv[0] ?? resolveDefaultSeedCatalogDatabasePath();
  const outputPath =
    argv[1] ?? path.join("src", "data", "seed_filament_catalog.json");
  const requestedVersion = argv[2];

  const db = new Database(dbPath, { readonly: true });
  let rows;
  try {
    rows = db
      .prepare(
        `
      SELECT material, filament_name, color_name, hex_color, product_url,
             default_weight, vendor, is_discontinued
      FROM filament_master_list
      ORDER BY vendor, material, filament_name, color_name
    `,
      )
      .all();
  } finally {
    db.close();
  }

  const entries = dedupeSeedCatalogEntries(
    rows
      .map((row) => {
        const entry = {
          vendor: String(row.vendor ?? "").trim() || "Generic",
          material: String(row.material ?? "").trim(),
          filament_name: String(row.filament_name ?? "").trim(),
          color_name: normalizeSeedColorName(String(row.color_name ?? "")),
          hex_color: normalizeSwatchValue(row.hex_color),
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

  const generatedAt = new Date().toISOString().slice(0, 10);
  const contentHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(entries))
    .digest("hex")
    .slice(0, 8);
  const version =
    requestedVersion ??
    `${generatedAt.replaceAll("-", ".")}-local-${entries.length}-${contentHash}`;

  const payload = {
    version,
    generated_at: generatedAt,
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  exportSeedCatalog();
}
