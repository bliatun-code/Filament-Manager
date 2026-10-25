import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import test from "node:test";
registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith(".png")) return { format: "module", shortCircuit: true, source: `export default ${JSON.stringify(url)};` };
  return nextLoad(url, context);
} });
const { printerImageFilename } = await import("./printer_images");

test("printer artwork follows exact models and MMU configurations without guessing unknown models", () => {
  assert.equal(printerImageFilename(" Bambu Lab P1S ", true), "bambu-p1s.png");
  assert.equal(printerImageFilename("prusa mk4s", false), "prusa-mk4s.png");
  assert.equal(printerImageFilename("Prusa MK4S", true), "prusa-mk4smmu3.png");
  assert.equal(printerImageFilename("Prusa XL (Dual Toolhead)", true), "prusa-xl2.png");
  assert.equal(printerImageFilename("My custom P1S enclosure", false), null);
  assert.equal(printerImageFilename("Prusa CORE One+ (Gen 2) INDX (8 tools)", true), null);
});

test("every bundled printer image keeps its upstream source, license and original bytes", () => {
  const base = new URL("../assets/printers/", import.meta.url);
  const sources = JSON.parse(readFileSync(new URL("sources.json", base), "utf8")) as Array<{ file: string; source: string; license: string; sha256: string }>;
  assert.equal(sources.length, 31);
  for (const source of sources) {
    assert.match(source.source, /^https:\/\/github.com\/(bambulab\/BambuStudio|prusa3d\/PrusaSlicer)\/blob\//);
    assert.equal(source.license, "AGPL-3.0");
    assert.equal(createHash("sha256").update(readFileSync(new URL(source.file, base))).digest("hex"), source.sha256);
  }
  for (const license of ["BambuStudio-LICENSE.txt", "PrusaSlicer-LICENSE.txt"]) assert.ok(existsSync(new URL(license, base)));
  const catalog = JSON.parse(readFileSync(new URL("./printer_image_catalog.json", import.meta.url), "utf8")) as Record<string, Record<string, string>>;
  const recorded = new Set(sources.map((row) => row.file));
  for (const entry of Object.values(catalog)) for (const file of Object.values(entry)) assert.ok(recorded.has(file), file);
});
