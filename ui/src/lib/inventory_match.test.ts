import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInventoryMetadataCandidateResult,
  buildInventoryMatchResult,
  translateObservedMatchNote,
} from "./inventory_match";
import type { SpoolWithMasterRow } from "./tauri_client";

function createRow(
  id: string,
  overrides: {
    status?: string;
    rfidTag?: string | null;
    material?: string;
    filamentName?: string;
    hexColor?: string | null;
    vendor?: string;
  } = {},
): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: `${id}-master`,
      status: overrides.status ?? "IN_STOCK",
      rfid_tag: overrides.rfidTag,
    },
    master: {
      id: `${id}-master`,
      material: overrides.material ?? "PLA",
      filament_name: overrides.filamentName ?? "PLA Basic",
      color_name: "Blue",
      hex_color: overrides.hexColor ?? "#2563EB",
      default_weight: 1000,
      vendor: overrides.vendor ?? "eSUN",
    },
  };
}

test("buildInventoryMatchResult prefers exact non-zero RFID matches", () => {
  const result = buildInventoryMatchResult(
    [
      createRow("spool-1", { rfidTag: "ABC123", filamentName: "PLA Basic" }),
      createRow("spool-2", { rfidTag: "XYZ789", filamentName: "PLA Basic" }),
    ],
    {
      rfid: " ABC123 ",
      material: "PLA",
      filamentName: "PLA Basic",
    },
  );

  assert.equal(result.kind, "rfid_exact");
  assert.deepEqual(result.candidates.map((row) => row.spool.id), ["spool-1"]);
});

test("buildInventoryMatchResult ignores empty and lost rows", () => {
  const result = buildInventoryMatchResult(
    [
      createRow("empty", { status: "EMPTY", rfidTag: "ABC123" }),
      createRow("lost", { status: "LOST", material: "PLA", filamentName: "PLA Basic" }),
    ],
    {
      rfid: "ABC123",
      material: "PLA",
      filamentName: "PLA Basic",
    },
  );

  assert.equal(result.kind, "none");
});

test("buildInventoryMatchResult ignores deleted rows", () => {
  const result = buildInventoryMatchResult(
    [
      createRow("deleted", {
        status: "DELETED",
        rfidTag: "ABC123",
        material: "PLA",
        filamentName: "PLA Basic",
      }),
    ],
    {
      rfid: "ABC123",
      material: "PLA",
      filamentName: "PLA Basic",
    },
  );

  assert.equal(result.kind, "none");
});

test("buildInventoryMatchResult does not fall back to metadata when an unregistered RFID is present", () => {
  const result = buildInventoryMatchResult(
    [
      createRow("metadata", {
        material: "PLA",
        filamentName: "PLA+HS",
        hexColor: "#121212",
      }),
    ],
    {
      rfid: "UNREGISTERED-RFID",
      material: "PLA",
      colorHex: "#000000",
    },
  );

  assert.equal(result.kind, "none");
});

test("buildInventoryMetadataCandidateResult suggests Bambu rows for unknown RFID assistance", () => {
  const observed = {
    rfid: "UNREGISTERED-BAMBU-RFID",
    material: "PLA",
    filamentName: "PLA Matte",
    colorHex: "#000000",
  };
  const rows = [
    createRow("bambu-black", {
      vendor: "Bambu",
      material: "PLA",
      filamentName: "PLA Matte",
      hexColor: "#000000",
    }),
    createRow("esun-black", {
      vendor: "eSUN",
      material: "PLA",
      filamentName: "PLA+HS",
      hexColor: "#000000",
    }),
  ];

  assert.equal(buildInventoryMatchResult(rows, observed).kind, "none");

  const result = buildInventoryMetadataCandidateResult(rows, observed, {
    includeBambuMetadataCandidates: true,
    onlyBambuMetadataCandidates: true,
  });

  assert.equal(result.kind, "metadata_single");
  assert.deepEqual(result.candidates.map((row) => row.spool.id), ["bambu-black"]);
});

test("buildInventoryMatchResult falls back to metadata matching", () => {
  const result = buildInventoryMatchResult(
    [
      createRow("spool-1", { material: "PETG", filamentName: "PETG Basic" }),
      createRow("spool-2", { material: "PLA", filamentName: "PLA Basic", hexColor: "#2563EB" }),
    ],
    {
      rfid: "000000",
      material: "pla",
      filamentName: "Basic",
      colorHex: "2563eb",
    },
  );

  assert.equal(result.kind, "metadata_single");
  assert.deepEqual(result.candidates.map((row) => row.spool.id), ["spool-2"]);
});

test("buildInventoryMatchResult does not treat a material token as a filament name match", () => {
  const result = buildInventoryMatchResult(
    [createRow("spool-1", { material: "PLA", filamentName: "PLA Basic", hexColor: "#2563EB" })],
    {
      material: "PLA",
      filamentName: "PLA",
      colorHex: "#00FF00",
    },
  );

  assert.equal(result.kind, "none");
});

test("buildInventoryMatchResult keeps short distinctive filament name matches", () => {
  const result = buildInventoryMatchResult(
    [createRow("spool-1", { material: "PETG", filamentName: "PETG HF", hexColor: "#00AE42" })],
    {
      material: "PETG",
      filamentName: "HF",
    },
  );

  assert.equal(result.kind, "metadata_single");
  assert.deepEqual(result.candidates.map((row) => row.spool.id), ["spool-1"]);
});

test("buildInventoryMatchResult matches observed RFID color against multi swatch colors", () => {
  const result = buildInventoryMatchResult(
    [
      createRow("spool-1", {
        material: "PLA",
        filamentName: "PLA Silk Multi-Color",
        hexColor: "multi(#720062,#3A913F)",
      }),
      createRow("spool-2", {
        material: "PLA",
        filamentName: "PLA Silk Multi-Color",
        hexColor: "multi(#00629B,#000000)",
      }),
    ],
    {
      material: "PLA",
      filamentName: "PLA Silk Multi-Color",
      colorHex: "#3A913F",
    },
  );

  assert.equal(result.kind, "metadata_single");
  assert.deepEqual(result.candidates.map((row) => row.spool.id), ["spool-1"]);
});

test("buildInventoryMatchResult matches composite swatches independent of color order", () => {
  const result = buildInventoryMatchResult(
    [
      createRow("spool-1", {
        material: "PLA",
        filamentName: "PLA Silk Multi-Color",
        hexColor: "multi(#3A913F,#720062)",
      }),
      createRow("spool-2", {
        material: "PLA",
        filamentName: "PLA Silk Multi-Color",
        hexColor: "multi(#720062,#000000)",
      }),
      createRow("spool-3", {
        material: "PLA",
        filamentName: "PLA Silk Multi-Color",
        hexColor: "#720062",
      }),
    ],
    {
      material: "PLA",
      filamentName: "PLA Silk Multi-Color",
      colorHex: "multi(#720062,#3A913F)",
    },
  );

  assert.equal(result.kind, "metadata_single");
  assert.deepEqual(result.candidates.map((row) => row.spool.id), ["spool-1"]);
});

test("buildInventoryMatchResult reports multiple metadata candidates", () => {
  const result = buildInventoryMatchResult(
    [createRow("spool-1"), createRow("spool-2")],
    {
      material: "PLA",
      filamentName: "PLA Basic",
    },
  );

  assert.equal(result.kind, "metadata_multiple");
  assert.deepEqual(result.candidates.map((row) => row.spool.id), ["spool-1", "spool-2"]);
});

test("buildInventoryMatchResult keeps Bambu rolls out of non-RFID metadata matching", () => {
  const result = buildInventoryMatchResult(
    [
      createRow("bambu", {
        vendor: "Bambu",
        material: "PLA",
        filamentName: "PLA Matte",
        hexColor: "#000000",
      }),
      createRow("esun", {
        vendor: "eSUN",
        material: "PLA",
        filamentName: "PLA+HS",
        hexColor: "#121212",
      }),
    ],
    {
      material: "PLA",
      filamentName: "PLA Matte",
      colorHex: "#000000",
    },
  );

  assert.equal(result.kind, "metadata_single");
  assert.deepEqual(result.candidates.map((row) => row.spool.id), ["esun"]);
});

test("buildInventoryMatchResult matches third-party live AMS color with tolerance and prefers the assigned slot", () => {
  const result = buildInventoryMatchResult(
    [
      createRow("assigned-black", {
        status: "ASSIGNED",
        material: "PLA",
        filamentName: "PLA+HS",
        hexColor: "#121212",
      }),
      createRow("stock-black", {
        status: "IN_STOCK",
        material: "PLA",
        filamentName: "PLA+HS",
        hexColor: "#121212",
      }),
      createRow("dark-purple", {
        status: "IN_STOCK",
        material: "PLA",
        filamentName: "PLA-Twinkling",
        hexColor: "#33152F",
      }),
      createRow("black-tpu", {
        status: "IN_STOCK",
        material: "TPU",
        filamentName: "TPU",
        hexColor: "#000000",
      }),
    ],
    {
      material: "PLA",
      filamentName: "PLA Matte",
      colorHex: "#000000",
    },
    { preferredSpoolId: "assigned-black" },
  );

  assert.equal(result.kind, "metadata_multiple");
  assert.deepEqual(result.candidates.map((row) => row.spool.id), [
    "assigned-black",
    "stock-black",
  ]);
});

test("buildInventoryMatchResult excludes borrowed rolls from non-RFID metadata candidates", () => {
  const result = buildInventoryMatchResult(
    [
      createRow("borrowed", {
        status: "BORROWED",
        material: "PLA",
        filamentName: "PLA+HS",
        hexColor: "#121212",
      }),
      createRow("stock", {
        status: "IN_STOCK",
        material: "PLA",
        filamentName: "PLA+HS",
        hexColor: "#121212",
      }),
    ],
    {
      material: "PLA",
      colorHex: "#000000",
    },
  );

  assert.equal(result.kind, "metadata_single");
  assert.deepEqual(result.candidates.map((row) => row.spool.id), ["stock"]);
});

test("translateObservedMatchNote localizes known notes and preserves unknown notes", () => {
  const t = (key: string, fallback?: string) =>
    key === "settings.bambuLivePresetNozzleSuffix"
      ? (fallback ?? "")
      : `${key}:${fallback ?? ""}`;
  assert.equal(
    translateObservedMatchNote("Exact RFID/AMS identity match against inventory.", t),
    "settings.bambuLiveMatchNoteExact:Exact RFID/AMS identity match against inventory.",
  );
  assert.equal(
    translateObservedMatchNote("Exact tray identity match against inventory.", t),
    "settings.bambuLiveMatchNoteExact:Exact RFID/AMS identity match against inventory.",
  );
  assert.equal(
    translateObservedMatchNote(
      "AMS reported an RFID/AMS identity that is not registered in inventory. Filament settings preset GFSA00_04 (Bambu PLA Basic @BBL P1S 0.4 nozzle) was observed via tray_info_idx; this is a material/settings hint, not a roll identity.",
      t,
    ),
    "settings.bambuLiveMatchNoteUnknownIdentity:AMS reported an RFID/AMS identity that is not registered in inventory. settings.bambuLiveMatchNotePresetSignal:Filament settings preset: GFSA00_04 · Bambu PLA Basic · P1S · 0.4 mm nozzle. This is a material/settings hint, not a roll identity.",
  );
  assert.equal(
    translateObservedMatchNote(
      "AMS reported a tray identity that is not registered in inventory. AMS preset signal GFSA00_04 was observed via tray_info_idx; this is a material/preset hint, not a roll identity.",
      t,
    ),
    "settings.bambuLiveMatchNoteUnknownIdentity:AMS reported an RFID/AMS identity that is not registered in inventory. settings.bambuLiveMatchNotePresetSignal:Filament settings preset: GFSA00_04. This is a material/settings hint, not a roll identity.",
  );
  assert.equal(
    translateObservedMatchNote(
      "AMS reported a tray identity that is not registered in inventory. Filament settings preset GFSA00_04 (Bambu PLA Basic @BBL P1S 0.4 nozzle) was observed via tray_info_idx; this is a material/settings hint, not a roll identity.",
      t,
    ),
    "settings.bambuLiveMatchNoteUnknownIdentity:AMS reported an RFID/AMS identity that is not registered in inventory. settings.bambuLiveMatchNotePresetSignal:Filament settings preset: GFSA00_04 · Bambu PLA Basic · P1S · 0.4 mm nozzle. This is a material/settings hint, not a roll identity.",
  );
  assert.equal(
    translateObservedMatchNote(
      "AMS reported a tray identity that is not registered in inventory. Filament settings preset GFSA00_17 (Bambu PLA Basic @BBL H2DP 0.4 nozzle) was observed via tray_info_idx; this is a material/settings hint, not a roll identity.",
      t,
    ),
    "settings.bambuLiveMatchNoteUnknownIdentity:AMS reported an RFID/AMS identity that is not registered in inventory. settings.bambuLiveMatchNotePresetSignal:Filament settings preset: GFSA00_17 · Bambu PLA Basic · H2D Pro · 0.4 mm nozzle. This is a material/settings hint, not a roll identity.",
  );
  assert.equal(
    translateObservedMatchNote(
      "AMS reported a tray identity that is not registered in inventory. Filament settings preset GENERIC_PLA_02 (Generic PLA @0.2 nozzle) was observed via tray_info_idx; this is a material/settings hint, not a roll identity.",
      t,
    ),
    "settings.bambuLiveMatchNoteUnknownIdentity:AMS reported an RFID/AMS identity that is not registered in inventory. settings.bambuLiveMatchNotePresetSignal:Filament settings preset: GENERIC_PLA_02 · Generic PLA · 0.2 mm nozzle. This is a material/settings hint, not a roll identity.",
  );
  assert.equal(
    translateObservedMatchNote("Multiple stored spools could match this live tray.", t),
    "settings.bambuLiveMatchNoteMultipleStoredMatch:Multiple stored spools could match this live tray.",
  );
  assert.equal(translateObservedMatchNote("Custom note", t), "Custom note");
  assert.equal(translateObservedMatchNote("  ", t), null);
});
