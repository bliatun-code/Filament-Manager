import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./use_settings_filament_defaults.ts", import.meta.url),
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
});
