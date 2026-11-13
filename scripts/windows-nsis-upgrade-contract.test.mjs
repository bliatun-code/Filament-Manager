import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const sources = JSON.parse(read("scripts/windows-nsis-msi-sources.json"));
const workflow = read(".github/workflows/windows-nsis-pilot.yml");
const hooks = read("scripts/windows-nsis-pilot.nsh");

test("CI covers every published MSI in the migration allowlist", () => {
  const pairs = Array.from(
    hooks.matchAll(/"({[0-9A-F-]{36}}):(\d+\.\d+\.\d+)" eligible/g),
    ([, productCode, version]) => [`v${version}`, productCode],
  );
  assert.equal(pairs.length, 4);
  assert.deepEqual(Object.fromEntries(pairs), Object.fromEntries(
    Object.entries(sources).map(([tag, { asset, sha256, productCode }]) => {
      assert.equal(asset, `Filament-Manager_${tag.slice(1)}_x64_en-US.msi`);
      assert.match(sha256, /^[0-9a-f]{64}$/);
      assert.ok(workflow.includes(`source: ${tag}`));
      return [tag, productCode];
    }),
  ));
});
