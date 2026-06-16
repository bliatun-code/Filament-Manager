import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildDiagnosticCaptureSession,
  buildDiagnosticChartFieldOptions,
  buildDiagnosticChartPoints,
  buildDiagnosticFallbackSummary,
  buildDiagnosticSignalQualityBuckets,
  buildDiagnosticDisplayTrays,
  classifyDiagnosticField,
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

test("buildDiagnosticCaptureSession seeds backend observed state annotations without raw payload", () => {
  const session = buildDiagnosticCaptureSession({
    online: true,
    mqtt_connected: true,
    last_seen_at: "2026-05-15T10:00:00Z",
    progress_percent: 64,
    remaining_minutes: 12,
    active_ams_index: 0,
    active_tray_index: 2,
    ams_humidity_index: 4,
    job_state_code: 4,
    ams_status_code: 769,
    ams_status_main: 3,
    ams_status_sub: 1,
    ams_exist_bits: "4",
    ams_read_done_bits: "4",
    ams_bambu_bits: "4",
    trays: [
      {
        ams_index: 0,
        tray_index: 2,
        loaded: true,
        filament_type: "PETG",
        filament_name: "Basic",
        color_hex: "#112233",
        remaining_percent: 44,
        remaining_grams: 440,
        tray_weight_g: 1000,
        observed_rfid_tag: "tag-3",
        tray_uuid: "uuid-3",
      },
    ],
  } as never);

  assert.equal(session.seededFromObservedAt, "2026-05-15T10:00:00Z");
  assert.equal(
    session.fields.find((field) => field.path === "_bfm_job.progress_percent")?.valueText,
    "64",
  );
  assert.deepEqual(buildDiagnosticFallbackSummary(session.fields), {
    progressPercent: 64,
    remainingMinutes: 12,
    activeAmsIndex: 0,
    activeTrayIndex: 2,
    amsHumidityIndex: 4,
    jobStateCode: 4,
    amsStatusCode: 769,
    amsStatusMain: 3,
    amsStatusSub: 1,
  });

  const [snapshot] = extractDiagnosticTraySnapshots(session.fields);
  assert.equal(snapshot?.trayIndex, 2);
  assert.equal(snapshot?.filamentType, "PETG");
  assert.equal(snapshot?.remainingGrams, 440);
  assert.equal(snapshot?.trayPresentInAms, true);
  assert.equal(snapshot?.trayReadDone, true);
  assert.equal(snapshot?.trayIsBambu, true);
});

test("buildDiagnosticCaptureSession augments partial raw payload with observed tray snapshots", () => {
  const session = buildDiagnosticCaptureSession({
    last_seen_at: "2026-05-15T10:00:00Z",
    progress_percent: 64,
    raw_payload_json: {
      print: {
        progress: 64,
      },
      ams: {
        ams: [
          {
            tray: [
              {
                tray_uuid: "RAW-UUID",
              },
            ],
          },
        ],
      },
    },
    trays: [
      {
        ams_index: 0,
        tray_index: 0,
        loaded: true,
        filament_type: "PLA",
        filament_name: "Basic",
        color_hex: "#112233",
        remaining_percent: 44,
        remaining_grams: 440,
        tray_weight_g: 1000,
        observed_rfid_tag: "tag-1",
        tray_uuid: "OBSERVED-UUID",
        tray_info_idx: "GFSA00_04",
        tray_id_name: "Bambu PLA Basic @BBL P1S 0.4 nozzle",
        nozzle_temp_min_c: 190,
        nozzle_temp_max_c: 240,
      },
    ],
  } as never);

  assert.equal(
    session.fields.find((field) => field.path === "print.progress")?.valueText,
    "64",
  );
  assert.equal(
    session.fields.find((field) => field.path === "ams.ams[0].tray[0].tray_uuid")?.valueText,
    "RAW-UUID",
  );
  assert.equal(
    session.fields.find((field) => field.path === "ams.ams[0].tray[0].tray_info_idx")?.valueText,
    "GFSA00_04",
  );
  assert.equal(
    session.fields.find((field) => field.path === "ams.ams[0].tray[0].nozzle_temp_min")?.valueText,
    "190",
  );
  assert.equal(
    session.fields.find((field) => field.path === "ams.ams[0].tray[0].nozzle_temp_max")?.valueText,
    "240",
  );

  const [snapshot] = extractDiagnosticTraySnapshots(session.fields);
  assert.equal(snapshot?.trayUuid, "RAW-UUID");
  assert.equal(snapshot?.trayInfoIdx, "GFSA00_04");
  assert.equal(snapshot?.nozzleTempMinC, 190);
  assert.equal(snapshot?.nozzleTempMaxC, 240);
  assert.equal(snapshot?.remainingGrams, 440);
});

test("diagnostic tray snapshots use Bambu tray id as the logical slot coordinate", () => {
  const session = buildDiagnosticCaptureSession({
    last_seen_at: "2026-05-15T10:00:00Z",
    raw_payload_json: {
      ams: {
        ams: [
          {
            tray: [
              {
                id: "1",
                tray_uuid: "RAW-SLOT-2",
              },
            ],
          },
        ],
      },
    },
    trays: [
      {
        ams_index: 0,
        tray_index: 1,
        loaded: true,
        filament_type: "PLA",
        remaining_grams: 760,
      },
    ],
  } as never);

  const snapshots = extractDiagnosticTraySnapshots(session.fields);

  assert.equal(snapshots.length, 1);
  assert.deepEqual(
    snapshots.map((snapshot) => diagnosticTraySnapshotKey(snapshot.amsIndex, snapshot.trayIndex)),
    ["0:1"],
  );
  assert.equal(snapshots[0]?.trayUuid, "RAW-SLOT-2");
  assert.equal(snapshots[0]?.filamentType, "PLA");
  assert.equal(snapshots[0]?.remainingGrams, 760);
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

test("diagnostic signal quality keeps live nozzle temperature separate from settings range", () => {
  const buckets = buildDiagnosticSignalQualityBuckets([
    {
      avgReceiveIntervalMs: 4000,
      changeCount: 3,
      firstSeenAt: "2026-05-15T10:00:00Z",
      group: "print",
      label: "nozzle_temp_c",
      lastSeenAt: "2026-05-15T10:00:10Z",
      path: "_bfm_job.nozzle_temp_c",
      receiveCount: 3,
      recentValues: [],
      valueText: "218.5",
    },
    {
      avgReceiveIntervalMs: 4000,
      changeCount: 1,
      firstSeenAt: "2026-05-15T10:00:00Z",
      group: "tray",
      label: "nozzle_temp_min",
      lastSeenAt: "2026-05-15T10:00:10Z",
      path: "ams.ams[0].tray[0].nozzle_temp_min",
      receiveCount: 3,
      recentValues: [],
      valueText: "190",
    },
    {
      avgReceiveIntervalMs: 4000,
      changeCount: 1,
      firstSeenAt: "2026-05-15T10:00:00Z",
      group: "tray",
      label: "nozzle_temp_max",
      lastSeenAt: "2026-05-15T10:00:10Z",
      path: "ams.ams[0].tray[0].nozzle_temp_max",
      receiveCount: 3,
      recentValues: [],
      valueText: "240",
    },
  ]);

  assert.deepEqual(
    buckets.map((bucket) => [bucket.label, bucket.fields.map((field) => field.path)]),
    [
      [
        "Stable AMS metadata",
        ["ams.ams[0].tray[0].nozzle_temp_min", "ams.ams[0].tray[0].nozzle_temp_max"],
      ],
      ["Continuous telemetry", ["_bfm_job.nozzle_temp_c"]],
    ],
  );
});

test("diagnostic tray helpers build fallback display trays", () => {
  const session = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      ams: {
        tray_exist_bits: "1",
        tray_read_done_bits: "1",
        tray_is_bbl_bits: "1",
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
                tray_weight: "1000",
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
  assert.equal(snapshots[0]?.trayWeightG, 1000);
  assert.equal(snapshots[0]?.nozzleTempMinC, 190);
  assert.equal(snapshots[0]?.nozzleTempMaxC, 240);
  assert.equal(snapshots[0]?.remainingGrams, 870);
  assert.equal(snapshots[0]?.trayPresentInAms, true);
  assert.equal(snapshots[0]?.trayReadDone, true);
  assert.equal(snapshots[0]?.trayIsBambu, true);
  const csv = exportDiagnosticCaptureSessionCsv(session);
  assert.match(
    csv,
    /ams_index,tray_index,tray_loaded,tray_present_in_ams,tray_read_done,tray_is_bambu,filament_type/,
  );
  assert.match(
    csv,
    /tray_snapshot,.*AMS 1 tray 1.*GFSA00_04 · Bambu PLA Basic · P1S · 0\.4 mm nozzle/,
  );
  assert.match(
    csv,
    /,0,0,true,true,true,true,PLA,Basic,#336699,1000,87,870,tag-1,uuid-1,GFSA00_04,/,
  );
  assert.deepEqual(buildDiagnosticDisplayTrays([], session.fields), [
    {
      ams_index: 0,
      tray_index: 0,
      loaded: true,
      filament_type: "PLA",
      filament_name: "Basic",
      color_hex: "#336699",
      tray_weight_g: 1000,
      remaining_percent: 87,
      remaining_grams: 870,
      match_status: null,
      match_note:
        "RFID: tag-1 · uuid-1 · AMS bits: slot present, RFID read done, Bambu tag bit · AMS estimate: 870 g / 1000 g · 87% · Settings preset: GFSA00_04 · Bambu PLA Basic · P1S · 0.4 mm nozzle · Nozzle range: 190-240 C",
    },
  ]);
  assert.equal(countDiagnosticIdentitySignals(session.fields), 2);
});

test("diagnostic tray helpers treat AMS bitfields as physical slot evidence", () => {
  const session = updateDiagnosticCaptureSessionFromPayload({
    session: null,
    rawPayload: {
      ams: {
        tray_exist_bits: "1",
        tray_read_done_bits: "0",
        tray_is_bbl_bits: "1",
        ams: [
          {
            tray: [
              {
                tray_type: "",
                tray_uuid: "00000000000000000000000000000000",
              },
            ],
          },
        ],
      },
    },
    observedAt: "2026-05-15T10:00:00Z",
  });

  assert.ok(session);
  const [snapshot] = extractDiagnosticTraySnapshots(session.fields);

  assert.equal(snapshot?.loaded, true);
  assert.equal(snapshot?.trayPresentInAms, true);
  assert.equal(snapshot?.trayReadDone, false);
  assert.equal(snapshot?.trayIsBambu, true);
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
    jobStateCode: null,
    amsStatusCode: null,
    amsStatusMain: null,
    amsStatusSub: null,
  });
});

test("diagnostic field classifier groups backend job and AMS status annotations", () => {
  assert.equal(classifyDiagnosticField("_bfm_job.job_state_code"), "print");
  assert.equal(classifyDiagnosticField("job.job_state"), "print");
  assert.equal(classifyDiagnosticField("_bfm_ams_status.ams_status_code"), "ams");
  assert.equal(classifyDiagnosticField("_bfm_ams_bits.tray_exist_bits"), "ams");
  assert.equal(classifyDiagnosticField("ams.ams_status"), "ams");
});
