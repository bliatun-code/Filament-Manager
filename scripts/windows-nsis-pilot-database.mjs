import { readFileSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import {
  assertPreservedReleaseUpgradeData,
  assertSanitizedReleaseUpgradeFixture,
  snapshotReleaseUpgradeDatabase,
} from "./smoke-release-database-upgrade.mjs";
import { verifyWindowsAppDatabase } from "./verify-windows-app-database.mjs";

const [command, databasePath, snapshotPath, ...extra] = process.argv.slice(2);
const commands = ["capture", "prepare-launch", "verify-launch", "verify"];
if (!commands.includes(command) || !databasePath || !snapshotPath || extra.length) {
  throw new Error(
    "Usage: node scripts/windows-nsis-pilot-database.mjs " +
      "capture|prepare-launch|verify-launch|verify <database> <snapshot>",
  );
}

function journalMode(databasePath, { reset = false } = {}) {
  const database = new Database(databasePath, {
    fileMustExist: true,
    readonly: !reset,
  });
  try {
    return database.pragma(reset ? "journal_mode = DELETE" : "journal_mode", {
      simple: true,
    });
  } finally {
    database.close();
  }
}

if (command === "prepare-launch") {
  // The application's standard SQLite open enables WAL. Reset this marker
  // before a normal launch to prove it opened this file without a path override.
  if (journalMode(databasePath, { reset: true }) !== "delete") {
    throw new Error("Could not reset the fixture journal before startup.");
  }
} else {
  if (command === "verify-launch" && journalMode(databasePath) !== "wal") {
    throw new Error("Waiting for the app to open the default SQLite database in WAL mode.");
  }
  const snapshot = snapshotReleaseUpgradeDatabase(databasePath);
  if (!snapshot.ids.filament_spools?.length || !snapshot.ids.printers?.length) {
    throw new Error("Expected populated spool and printer records with stable IDs.");
  }

  if (command === "capture") {
    assertSanitizedReleaseUpgradeFixture(databasePath);
    writeFileSync(snapshotPath, JSON.stringify(snapshot), { flag: "wx" });
  } else {
    const previous = JSON.parse(readFileSync(snapshotPath, "utf8"));
    await verifyWindowsAppDatabase(databasePath);
    assertPreservedReleaseUpgradeData(previous, snapshot);
    console.log("Verified the spool and printer IDs and state in the default Windows database.");
  }
}
