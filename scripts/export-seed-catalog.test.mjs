import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { posix, win32 } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  exportSeedCatalog,
  resolveDefaultSeedCatalogDatabasePath,
} from "./export-seed-catalog.mjs";

const appDirectoryParts = [
  "no.bliatun.filamentmanager",
  "filament-manager.db",
];
const legacyAppDirectoryParts = ["no.bliatun.filamentmanager", "bambu.db"];
const windowsRoot = String.fromCharCode(67, 58, 92);

test("seed catalog export resolves the macOS application database", () => {
  const homeDirectory = posix.join("", "Users", "Alex");

  assert.equal(
    resolveDefaultSeedCatalogDatabasePath({
      env: {},
      homeDirectory,
      platform: "darwin",
    }),
    posix.join(
      homeDirectory,
      "Library",
      "Application Support", // path-portability-allow: expected macOS path fixture
      ...appDirectoryParts,
    ),
  );
});

test("seed catalog export prefers an existing Windows local database", () => {
  const localData = win32.join(
    windowsRoot,
    "Users",
    "Alex",
    "AppData",
    "Local",
  );
  const roamingData = win32.join(
    windowsRoot,
    "Users",
    "Alex",
    "AppData",
    "Roaming",
  );
  const localPath = win32.join(localData, ...appDirectoryParts);

  assert.equal(
    resolveDefaultSeedCatalogDatabasePath({
      env: { APPDATA: roamingData, LOCALAPPDATA: localData },
      pathExists: (candidate) => candidate === localPath,
      platform: "win32",
    }),
    localPath,
  );
});

test("seed catalog export keeps the existing Windows roaming database", () => {
  const localData = win32.join(windowsRoot, "AppData", "Local");
  const roamingData = win32.join(windowsRoot, "AppData", "Roaming");
  const roamingPath = win32.join(roamingData, ...appDirectoryParts);

  assert.equal(
    resolveDefaultSeedCatalogDatabasePath({
      env: { APPDATA: roamingData, LOCALAPPDATA: localData },
      pathExists: (candidate) => candidate === roamingPath,
      platform: "win32",
    }),
    roamingPath,
  );
});

test("seed catalog export defaults new Windows data to LOCALAPPDATA", () => {
  const localData = win32.join(windowsRoot, "AppData", "Local");

  assert.equal(
    resolveDefaultSeedCatalogDatabasePath({
      env: { LOCALAPPDATA: localData },
      pathExists: () => false,
      platform: "win32",
    }),
    win32.join(localData, ...appDirectoryParts),
  );
});

test("seed catalog export opens an existing Windows roaming legacy database", () => {
  const localData = win32.join(windowsRoot, "AppData", "Local");
  const roamingData = win32.join(windowsRoot, "AppData", "Roaming");
  const legacyRoamingPath = win32.join(
    roamingData,
    ...legacyAppDirectoryParts,
  );

  assert.equal(
    resolveDefaultSeedCatalogDatabasePath({
      env: { APPDATA: roamingData, LOCALAPPDATA: localData },
      pathExists: (candidate) => candidate === legacyRoamingPath,
      platform: "win32",
    }),
    legacyRoamingPath,
  );
});

test("seed catalog export keeps Windows local legacy priority", () => {
  const localData = win32.join(windowsRoot, "AppData", "Local");
  const roamingData = win32.join(windowsRoot, "AppData", "Roaming");
  const legacyLocalPath = win32.join(localData, ...legacyAppDirectoryParts);
  const currentRoamingPath = win32.join(roamingData, ...appDirectoryParts);

  assert.equal(
    resolveDefaultSeedCatalogDatabasePath({
      env: { APPDATA: roamingData, LOCALAPPDATA: localData },
      pathExists: (candidate) =>
        candidate === legacyLocalPath || candidate === currentRoamingPath,
      platform: "win32",
    }),
    legacyLocalPath,
  );
});

test("seed catalog export resolves Linux XDG and home data directories", () => {
  const homeDirectory = posix.join("", "home", "alex");
  const xdgData = posix.join(homeDirectory, "portable data");

  assert.equal(
    resolveDefaultSeedCatalogDatabasePath({
      env: { XDG_DATA_HOME: xdgData },
      homeDirectory,
      platform: "linux",
    }),
    posix.join(xdgData, ...appDirectoryParts),
  );
  assert.equal(
    resolveDefaultSeedCatalogDatabasePath({
      env: {},
      homeDirectory,
      platform: "linux",
    }),
    posix.join(homeDirectory, ".local", "share", ...appDirectoryParts),
  );
});

test("seed catalog export fails clearly without Windows app-data roots", () => {
  assert.throws(
    () =>
      resolveDefaultSeedCatalogDatabasePath({
        env: {},
        platform: "win32",
      }),
    /Pass its path explicitly or set LOCALAPPDATA\/APPDATA/,
  );
});

test("seed catalog export handles portable paths and releases its database", () => {
  const fixtureDirectory = mkdtempSync(
    path.join(tmpdir(), "Filament Manager O'Brien export-"),
  );
  const dbPath = path.join(fixtureDirectory, "source library.db");
  const outputPath = path.join(fixtureDirectory, "catalog output.json");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE filament_master_list (
      material TEXT,
      filament_name TEXT,
      color_name TEXT,
      hex_color TEXT,
      product_url TEXT,
      default_weight INTEGER,
      vendor TEXT,
      is_discontinued INTEGER
    );
    INSERT INTO filament_master_list VALUES (
      'PLA', 'Basic', 'Black', '#000000', NULL, 1000, 'Generic', 0
    );
  `);
  db.close();

  const originalLog = console.log;
  try {
    console.log = () => {};
    exportSeedCatalog([dbPath, outputPath, "portable-test"]);
  } finally {
    console.log = originalLog;
  }

  const payload = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(payload.version, "portable-test");
  assert.equal(payload.entries.length, 1);
  assert.equal(payload.entries[0].vendor, "Generic");
  assert.doesNotThrow(() => rmSync(fixtureDirectory, { force: true, recursive: true }));
});
