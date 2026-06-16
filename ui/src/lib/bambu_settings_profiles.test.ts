import test from "node:test";
import assert from "node:assert/strict";

import {
  formatBambuSettingsProfileNameParts,
  formatBambuSettingsProfileSignal,
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

test("parseBambuSettingsProfileName supports current BambuStudio printer profile shapes", () => {
  assert.deepEqual(parseBambuSettingsProfileName("Bambu PLA Pure @BBL A2L 0.2 nozzle"), {
    filamentProfile: "Bambu PLA Pure",
    nozzleDiameterMm: "0.2",
    printerProfile: "A2L",
    rawName: "Bambu PLA Pure @BBL A2L 0.2 nozzle",
  });
  assert.deepEqual(parseBambuSettingsProfileName("Generic PETG HF @BBL H2DP 0.2 nozzle"), {
    filamentProfile: "Generic PETG HF",
    nozzleDiameterMm: "0.2",
    printerProfile: "H2DP",
    rawName: "Generic PETG HF @BBL H2DP 0.2 nozzle",
  });
  assert.deepEqual(parseBambuSettingsProfileName("Bambu PLA Galaxy @BBL X2D 0.4 nozzle"), {
    filamentProfile: "Bambu PLA Galaxy",
    nozzleDiameterMm: "0.4",
    printerProfile: "X2D",
    rawName: "Bambu PLA Galaxy @BBL X2D 0.4 nozzle",
  });
});

test("parseBambuSettingsProfileName keeps vendor and support profile names readable", () => {
  assert.deepEqual(parseBambuSettingsProfileName("eSUN PLA+ @BBL X1C 0.2 nozzle"), {
    filamentProfile: "eSUN PLA+",
    nozzleDiameterMm: "0.2",
    printerProfile: "X1C",
    rawName: "eSUN PLA+ @BBL X1C 0.2 nozzle",
  });
  assert.deepEqual(
    parseBambuSettingsProfileName("Bambu Support For PLA-PETG @BBL H2C 0.2 nozzle"),
    {
      filamentProfile: "Bambu Support For PLA-PETG",
      nozzleDiameterMm: "0.2",
      printerProfile: "H2C",
      rawName: "Bambu Support For PLA-PETG @BBL H2C 0.2 nozzle",
    },
  );
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
  assert.deepEqual(parseBambuSettingsProfileName("Bambu PLA Basic @base"), {
    filamentProfile: "Bambu PLA Basic",
    nozzleDiameterMm: null,
    printerProfile: null,
    rawName: "Bambu PLA Basic @base",
  });
  assert.deepEqual(formatBambuSettingsProfileNameParts("Bambu PLA Basic @base"), [
    "Bambu PLA Basic",
  ]);
  assert.deepEqual(parseBambuSettingsProfileName("Generic PLA"), {
    filamentProfile: "Generic PLA",
    nozzleDiameterMm: null,
    printerProfile: null,
    rawName: "Generic PLA",
  });
  assert.equal(parseBambuSettingsProfileName("   "), null);
});

test("formatBambuSettingsProfileSignal joins setting id and readable profile parts", () => {
  assert.equal(
    formatBambuSettingsProfileSignal(
      "GFSA00_04",
      "Bambu PLA Basic @BBL P1S 0.4 nozzle",
    ),
    "GFSA00_04 · Bambu PLA Basic · P1S · 0.4 mm nozzle",
  );
  assert.equal(
    formatBambuSettingsProfileSignal("GENERIC_PLA_02", "Generic PLA @0.2 nozzle", {
      nozzleSuffix: "mm dyse",
    }),
    "GENERIC_PLA_02 · Generic PLA · 0.2 mm dyse",
  );
  assert.equal(formatBambuSettingsProfileSignal("GFSA00_04", null), "GFSA00_04");
  assert.equal(formatBambuSettingsProfileSignal(null, "Bambu PLA Basic @base"), "Bambu PLA Basic");
  assert.equal(formatBambuSettingsProfileSignal(" ", " "), null);
});
