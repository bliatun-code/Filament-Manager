import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hookSource = readFileSync(
  new URL("./use_settings_application_diagnostics.ts", import.meta.url),
  "utf8",
);
const maintenanceSource = readFileSync(
  new URL("./use_settings_maintenance_section.ts", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(new URL("./settings.tsx", import.meta.url), "utf8");

test("application diagnostics load lazily only for the active maintenance tab", () => {
  assert.match(hookSource, /if \(!enabled\) \{\s*return;\s*\}/);
  assert.match(hookSource, /\[enabled, refreshApplicationDiagnostics\]/);
  assert.match(
    settingsSource,
    /applicationDiagnosticsEnabled: activeTab === "MAINTENANCE"/,
  );
  assert.match(
    maintenanceSource,
    /useSettingsApplicationDiagnostics\(\{\s*enabled: applicationDiagnosticsEnabled,/,
  );
});
