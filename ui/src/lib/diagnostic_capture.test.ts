import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildDiagnosticCaptureSession,
  buildDiagnosticChartFieldOptions,
  buildDiagnosticChartPoints,
  buildDiagnosticFallbackSummary,
  buildDiagnosticDisplayTrays,
  countDiagnosticIdentitySignals,
  decodeBambuTrayCoordinate,
  diagnosticTraySnapshotKey,
  exportDiagnosticCaptureSessionCsv,
  extractDiagnosticTraySnapshots,
  updateDiagnosticCaptureSessionFromPayload,
} from "./diagnostic_capture";

test("updateDiagnosticCaptureSessionFromPayload records first, refresh, and changed samples", () => {
  const first = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: { print: { progress: 10 }, ams: { tray: [{ tray_type: "PLA" }] } },
    observedAt: "2026-05-15T10:00:00Z",
  });

  assert.ok(first);
  assert.equal(first.fields.length, 2);
  assert.equal(first.samples[0]?.changeKind, "first_seen");

  const refreshed = updateDiagnosticCaptureSessionFromPayload({
    session: first,
    rawPayload: { print: { progress: 10 }, ams: { tray: [{ tray_type: "PLA" }] } },
    observedAt: "2026-05-15T10:00:05Z",
  });

  assert.ok(refreshed);
  assert.equal(refreshed.fields.find((field) => field.path === "print.progress")?.receiveCount, 2);
  assert.equal(refreshed.samples.at(-1)?.changeKind, "refresh");

  const changed = updateDiagnosticCaptureSessionFromPayload({
    session: refreshed,
    rawPayload: { print: { progress: 20 }, ams: { tray: [{ tray_type: "PETG" }] } },
    observedAt: "2026-05-15T10:00:10Z",
  });

  assert.ok(changed);
  const progress = changed.fields.find((field) => field.path === "print.progress");
  assert.equal(progress?.valueText, "20");
  assert.equal(progress?.changeCount, 2);
  assert.equal(changed.samples.at(-1)?.changeKind, "changed");
});

test("updateDiagnosticCaptureSessionFromPayload preserves seeded sessions as changed additions", () => {
  const seeded = buildDiagnosticCaptureSession({
    last_seen_at: "2026-05-15T10:00:00Z",
    raw_payload_json: { print: { progress: 10 } },
  } as never);

  const updated = updateDiagnosticCaptureSessionFromPayload({
    session: seeded,
    rawPayload: { print: { progress: 10 }, new_field: "ready" },
    observedAt: "2026-05-15T10:00:05Z",
  });

  assert.ok(updated);
  assert.equal(updated.fields.find((field) => field.path === "new_field")?.valueText, "ready");
  assert.equal(updated.samples.at(-1)?.changeKind, "changed");
});

test("exportDiagnosticCaptureSessionCsv writes summary and sample rows with escaping", () => {
  const session = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      msg: 'hello, "printer"',
      print: {
        note: "line\nbreak",
      },
    },
    observedAt: "2026-05-15T10:00:00Z",
  });

  assert.ok(session);
  const csv = exportDiagnosticCaptureSessionCsv(session);

  assert.match(csv, /^section,session_started_at,/);
  assert.match(csv, /field_summary,.*?,print,print\.note,,"line\nbreak"/);
  assert.match(csv, /field_summary,.*?,print,msg,,"hello, ""printer"""/);
  assert.match(csv, /sample_log,.*?,print,msg,2026-05-15T10:00:00Z,"hello, ""printer""",first_seen/);
});

test("diagnostic chart helpers select numeric changing telemetry", () => {
  const session = buildDiagnosticCaptureSession(null);
  const updated = updateDiagnosticCaptureSessionFromPayload({
    session,
    rawPayload: {
      mc_percent: 10,
      sequence_id: 123,
      tag_uid: "abc",
      nozzle_temp: "205",
    },
    observedAt: "2026-05-15T10:00:00Z",
  });
  assert.ok(updated);
  const changed = updateDiagnosticCaptureSessionFromPayload({
    session: updated,
    rawPayload: {
      mc_percent: 20,
      sequence_id: 124,
      tag_uid: "def",
      nozzle_temp: "210",
    },
    observedAt: "2026-05-15T10:00:05Z",
  });
  assert.ok(changed);

  const options = buildDiagnosticChartFieldOptions(changed.fields);
  assert.deepEqual(
    options.map((option) => option.path).sort(),
    ["mc_percent", "nozzle_temp"],
  );
  assert.deepEqual(buildDiagnosticChartPoints(changed, "mc_percent"), [
    {
      observedAt: "2026-05-15T10:00:00Z",
      value: 10,
      valueText: "10",
    },
    {
      observedAt: "2026-05-15T10:00:05Z",
      value: 20,
      valueText: "20",
    },
  ]);
});

test("diagnostic tray helpers build fallback display trays", () => {
  const session = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      ams: {
        ams: [
          {
            tray: [
              {
                tray_type: "PLA",
                tray_sub_brands: "Basic",
                tray_color: "336699FF",
                remain: "87",
                tag_uid: "tag-1",
                tray_uuid: "uuid-1",
                tray_info_idx: "GFSA00_04",
                tray_id_name: "Bambu PLA Basic @BBL P1S 0.4 nozzle",
                nozzle_temp_min: "190",
                nozzle_temp_max: "240",
              },
            ],
          },
        ],
      },
    },
    observedAt: "2026-05-15T10:00:00Z",
  });

  assert.ok(session);
  const snapshots = extractDiagnosticTraySnapshots(session.fields);
  assert.equal(snapshots[0]?.amsIndex, 0);
  assert.equal(snapshots[0]?.nozzleTempMinC, 190);
  assert.equal(snapshots[0]?.nozzleTempMaxC, 240);
  assert.deepEqual(buildDiagnosticDisplayTrays([], session.fields), [
    {
      ams_index: 0,
      tray_index: 0,
      loaded: true,
      filament_type: "PLA",
      filament_name: "Basic",
      color_hex: "#336699",
      remaining_percent: 87,
      match_status: null,
      match_note:
        "RFID: tag-1 · uuid-1 · Settings preset: GFSA00_04 · Bambu PLA Basic @BBL P1S 0.4 nozzle · Nozzle range: 190-240 C",
    },
  ]);
  assert.equal(countDiagnosticIdentitySignals(session.fields), 2);
});

test("diagnostic tray helpers keep same tray index separate across AMS units", () => {
  const session = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      ams: {
        ams: [
          {
            tray: [
              {
                tray_type: "PLA",
                tray_uuid: "AMS1-SLOT1",
              },
            ],
          },
          {
            tray: [
              {
                tray_type: "PETG",
                tray_uuid: "AMS2-SLOT1",
                nozzle_temp_min: "230",
                nozzle_temp_max: "260",
              },
            ],
          },
        ],
      },
    },
    observedAt: "2026-05-15T10:00:00Z",
  });

  assert.ok(session);
  const snapshots = extractDiagnosticTraySnapshots(session.fields);
  assert.deepEqual(
    snapshots.map((snapshot) => [
      diagnosticTraySnapshotKey(snapshot.amsIndex, snapshot.trayIndex),
      snapshot.trayUuid,
      snapshot.filamentType,
      snapshot.nozzleTempMaxC,
    ]),
    [
      ["0:0", "AMS1-SLOT1", "PLA", null],
      ["1:0", "AMS2-SLOT1", "PETG", 260],
    ],
  );
});

test("diagnostic fallback decodes packed Bambu active tray coordinates", () => {
  assert.deepEqual(decodeBambuTrayCoordinate(4), {
    activeAmsIndex: 1,
    activeTrayIndex: 0,
  });
  assert.deepEqual(decodeBambuTrayCoordinate(255), {
    activeAmsIndex: null,
    activeTrayIndex: 255,
  });

  const session = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      ams: {
        tray_now: 4,
      },
      mc_percent: 81,
    },
    observedAt: "2026-05-15T10:00:00Z",
  });

  assert.ok(session);
  assert.deepEqual(buildDiagnosticFallbackSummary(session.fields), {
    progressPercent: 81,
    remainingMinutes: null,
    activeAmsIndex: 1,
    activeTrayIndex: 0,
    amsHumidityIndex: null,
  });
});
