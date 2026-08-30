import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./use_settings_filament_defaults.ts", import.meta.url),
  "utf8",
);
const settingsPageSource = readFileSync(
  new URL("./settings.tsx", import.meta.url),
  "utf8",
);

test("filament standards accept results only from the latest data source request", () => {
  assert.match(source, /const requestGenerationRef = useRef\(0\)/);
  assert.match(
    source,
    /snapshotState\.dataSourceKey === dataSourceKey\s*\? snapshotState\.snapshot\s*:\s*null/,
  );
  assert.match(
    source,
    /if \(requestGenerationRef\.current !== requestGeneration\) \{\s*return null;\s*\}\s*setSnapshot\(next\)/,
  );
  assert.match(
    source,
    /return \(\) => \{\s*requestGenerationRef\.current \+= 1;\s*\}/,
  );
  assert.match(source, /clientTargetGeneration/);
  assert.match(source, /clientHostWritePaired \? "paired" : "unpaired"/);
  assert.match(
    settingsPageSource,
    /clientTargetGeneration: settingsClientTargetGeneration/,
  );
});

test("poll refreshes retain good snapshots and retry transient failures", () => {
  assert.match(source, /preserveSnapshotOnFailure: true/);
  assert.match(source, /propagateFailure: true/);
  assert.match(
    source,
    /if \(options\.propagateFailure && !hostUnsupported\) \{\s*throw error;\s*\}/,
  );
  assert.match(
    source,
    /if \(hostUnsupported \|\| !options\.preserveSnapshotOnFailure\) \{[\s\S]*setSnapshot\(null\)/,
  );
  assert.match(
    source,
    /setLoadFailedState\(\{[\s\S]*value: clientReadOnly && !hostUnsupported/,
  );
  assert.match(
    source,
    /const retryLoad = useCallback\([\s\S]*preserveSnapshotOnFailure: true/,
  );
  assert.match(settingsPageSource, /loadFailed: filamentDefaults\.loadFailed/);
  assert.match(settingsPageSource, /onReload: filamentDefaults\.retryLoad/);
});

test("a missing client Host target is guidance state rather than a retryable load failure", () => {
  assert.match(
    source,
    /const hostTargetMissing =\s*tauri &&\s*roleResolved &&\s*clientReadOnly/,
  );
  assert.match(
    source,
    /if \(hostTargetMissing\) \{[\s\S]*setSnapshot\(null\);[\s\S]*setLoadFailedState\(\{ dataSourceKey, value: false \}\);[\s\S]*return null;/,
  );
  assert.match(settingsPageSource, /hostTargetMissing: filamentDefaults\.hostTargetMissing/);
});

test("filament standards fail closed without local fallback while the role is unresolved", () => {
  assert.match(source, /!roleResolved\s*\? "unresolved"/);
  assert.match(
    source,
    /if \(!roleResolved\) \{[\s\S]*setSnapshot\(null\);[\s\S]*return null;/,
  );
  assert.match(
    source,
    /!roleResolved\s*\? \[\]\s*:\s*snapshot\s*\? mapFilamentStandardsSnapshotRows/,
  );
  assert.match(
    settingsPageSource,
    /lowStock:\s*\{[\s\S]*?readOnly: !tauri \|\| settingsClientReadOnly/,
  );
  assert.match(
    source,
    /requireWritableFilamentStandardsSnapshot\(\{[\s\S]*?roleResolved,[\s\S]*?snapshot/,
  );
});
