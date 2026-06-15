import test from "node:test";
import assert from "node:assert/strict";

import {
  formatBambuSettingsProfileNameParts,
  parseBambuSettingsProfileName,
} from "./bambu_settings_profiles";

test("parseBambuSettingsProfileName separates BBL printer and nozzle parts", () => {
  assert.deepEqual(parseBambuSettingsProfileName("Bambu PLA Basic @BBL P1S 0.4 nozzle"), {
    filamentProfile: "Bambu PLA Basic",
    nozzleDiameterMm: "0.4",
    printerProfile: "P1S",
    rawName: "Bambu PLA Basic @BBL P1S 0.4 nozzle",
  });
  assert.deepEqual(parseBambuSettingsProfileName("Bambu PLA Basic @BBL A1"), {
    filamentProfile: "Bambu PLA Basic",
    nozzleDiameterMm: null,
    printerProfile: "A1",
    rawName: "Bambu PLA Basic @BBL A1",
  });
});

test("parseBambuSettingsProfileName supports generic nozzle-only profiles", () => {
  assert.deepEqual(parseBambuSettingsProfileName("Generic PLA @0.2 nozzle"), {
    filamentProfile: "Generic PLA",
    nozzleDiameterMm: "0.2",
    printerProfile: null,
    rawName: "Generic PLA @0.2 nozzle",
  });
  assert.deepEqual(formatBambuSettingsProfileNameParts("Generic PLA @0.2 nozzle"), [
    "Generic PLA",
    "0.2 mm nozzle",
  ]);
});

test("parseBambuSettingsProfileName keeps unstructured names intact", () => {
  assert.deepEqual(parseBambuSettingsProfileName("Generic PLA"), {
    filamentProfile: "Generic PLA",
    nozzleDiameterMm: null,
    printerProfile: null,
    rawName: "Generic PLA",
  });
  assert.equal(parseBambuSettingsProfileName("   "), null);
});
