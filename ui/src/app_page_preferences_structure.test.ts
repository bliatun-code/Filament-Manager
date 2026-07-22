import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("./pages/settings.tsx", import.meta.url), "utf8");
const settingsActiveTabSource = readFileSync(
  new URL("./pages/use_settings_active_tab.ts", import.meta.url),
  "utf8",
);

test("ordinary Settings navigation can restore storage while explicit navigation stays available", () => {
  assert.match(appSource, /function initialSettingsTabFromUrl\(\): SettingsTabKey \| null/);
  assert.match(appSource, /useState<SettingsTabKey \| null>/);
  assert.match(appSource, /setSettingsInitialTab\(null\)/);
  assert.match(appSource, /const openSettingsTab = \(tab: SettingsTabKey\)/);
  assert.match(appSource, /openSettingsTab\("LIBRARY"\)/);
  assert.match(appSource, /openSettingsTab\("MAINTENANCE"\)/);
  assert.match(settingsActiveTabSource, /resolveSettingsActiveTab\(initialTab/);
});

test("Settings visual QA uses the requested tab without reading or writing user preferences", () => {
  assert.match(appSource, /desktopVisualQaInitialSettingsTab\(window\.location\.search\)/);
  assert.match(
    settingsSource,
    /activeTabPersistenceEnabled: !desktopVisualQaScenario/,
  );
  assert.match(settingsActiveTabSource, /deterministic: !persistenceEnabled/);
});
