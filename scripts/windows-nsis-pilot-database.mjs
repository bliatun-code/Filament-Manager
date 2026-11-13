import { readFileSync, writeFileSync } from "node:fs";
import {
  assertPreservedReleaseUpgradeData,
  assertSanitizedReleaseUpgradeFixture,
  snapshotReleaseUpgradeDatabase,
} from "./smoke-release-database-upgrade.mjs";
import { verifyWindowsAppDatabase } from "./verify-windows-app-database.mjs";

const [command, databasePath, snapshotPath, ...extra] = process.argv.slice(2);
if (!["capture", "verify"].includes(command) || !databasePath || !snapshotPath || extra.length) {
  throw new Error("Usage: node scripts/windows-nsis-pilot-database.mjs capture|verify <database> <snapshot>");
}

assertSanitizedReleaseUpgradeFixture(databasePath);
const snapshot = snapshotReleaseUpgradeDatabase(databasePath);
if (!snapshot.ids.filament_spools?.length || !snapshot.ids.printers?.length) {
  throw new Error("Expected populated spool and printer records with stable IDs.");
}

if (command === "capture") {
  writeFileSync(snapshotPath, JSON.stringify(snapshot), { flag: "wx" });
} else {
  const previous = JSON.parse(readFileSync(snapshotPath, "utf8"));
  await verifyWindowsAppDatabase(databasePath);
  assertPreservedReleaseUpgradeData(previous, snapshot);
  console.log(
    "Verified the same spool and printer IDs and stored state at the default Windows database path.",
  );
}
