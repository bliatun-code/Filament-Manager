import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultSpoolTareWeightForVendor,
  resolveSpoolRowTareWeight,
  resolveSpoolTareWeight,
} from "./companion_spool_weight.js";

test("companion spool weight resolves known vendor defaults", () => {
  assert.equal(defaultSpoolTareWeightForVendor("Bambu Lab"), 250);
  assert.equal(defaultSpoolTareWeightForVendor("eSUN"), 224);
  assert.equal(defaultSpoolTareWeightForVendor("Generic"), 0);
});

test("companion spool weight prefers explicit finite tare values", () => {
  assert.equal(resolveSpoolTareWeight({ spool_tare_weight_g: 198.6 }, "Bambu Lab"), 199);
  assert.equal(resolveSpoolTareWeight({ spool_tare_weight_g: -10 }, "Bambu Lab"), 0);
});

test("companion spool row tare helper reads spool and master shape", () => {
  assert.equal(
    resolveSpoolRowTareWeight({
      spool: { spool_tare_weight_g: null },
      master: { vendor: "eSUN" },
    }),
    224,
  );
});

test("live weight previews track edited values, invalid drafts and restored forms", async () => {
  const { updateCompanionWeightPreviews } = await import("./companion_spool_weight.js");
  const { loadCompanionLocale } = await import("./companion_i18n.js");
  await loadCompanionLocale("nb");
  for (const kind of ["outgoing", "return", "inbound", "measurement"]) {
    const input = { value: "950" };
    const result = { textContent: "old calculation" };
    const used = { textContent: "old usage" };
    const preview = {
      dataset: { weightPreview: kind, tareWeight: "200", loanedWeight: "850" },
      closest: () => ({ elements: { namedItem: () => input } }),
      querySelector: (selector) => selector === ".metric-value" ? result : kind === "return" || kind === "inbound" ? used : null,
    };
    const root = { querySelectorAll: () => [preview] };
    updateCompanionWeightPreviews(root, "nb");
    assert.match(result.textContent, /950 g.*200 g.*750 g/);
    if (kind === "return" || kind === "inbound") assert.match(used.textContent, /100 g/);
    input.value = "";
    updateCompanionWeightPreviews(root, "nb");
    assert.match(result.textContent, /gyldig/);
    assert.doesNotMatch(result.textContent, /750/);
    if (kind === "return" || kind === "inbound") assert.equal(used.textContent, "");
    input.value = "2.5";
    updateCompanionWeightPreviews(root, "nb");
    assert.match(result.textContent, /gyldig/);
    input.value = "100";
    updateCompanionWeightPreviews(root, "nb");
    assert.match(result.textContent, /= 0 g/);
    input.value = "1200";
    updateCompanionWeightPreviews(root, "nb");
    assert.match(result.textContent, /= 1\s000 g/);
  }
});


test("measured weight parsing never truncates decimals, exponent notation or unsafe integers", async () => {
  const { parseCompanionMeasuredWeight } = await import("./companion_spool_weight.js");
  for (const raw of ["", "-1", "2.5", "1e3", "9007199254740992", "123abc"]) {
    assert.ok(Number.isNaN(parseCompanionMeasuredWeight(raw)), raw);
  }
  assert.equal(parseCompanionMeasuredWeight(" 900 "), 900);
  assert.equal(parseCompanionMeasuredWeight("0"), 0);
});
