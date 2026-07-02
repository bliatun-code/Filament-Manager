import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./settings_route_map_props.tsx", import.meta.url), "utf8");
const lazyRoutesSource = readFileSync(
  new URL("./settings_lazy_routes.tsx", import.meta.url),
  "utf8",
);
const outletSource = readFileSync(new URL("./settings_route_outlet.tsx", import.meta.url), "utf8");

test("settings routes lazy-load tab UI while keeping props typed", () => {
  assert.match(lazyRoutesSource, /lazy\(\(\) =>\s*\n?\s*import\("\.\/settings_catalog_tab"\)/);
  assert.match(lazyRoutesSource, /lazy\(\(\) =>\s*\n?\s*import\("\.\/settings_printers_route"\)/);
  assert.match(source, /import type \{ SettingsCatalogTabProps \}/);
  assert.match(source, /import type \{ SettingsPrintersRouteProps \}/);
  assert.doesNotMatch(source, /import \{ SettingsCatalogTab \}/);
  assert.doesNotMatch(source, /import \{ SettingsPrintersRoute \}/);
  assert.match(outletSource, /<Suspense/);
});
