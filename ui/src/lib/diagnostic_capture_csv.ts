import {
  classifyDiagnosticField,
  type DiagnosticCaptureSession,
} from "./diagnostic_capture";
import { formatBambuSettingsProfileSignal } from "./bambu_settings_profiles";
import { extractDiagnosticTraySnapshots } from "./diagnostic_capture_trays";

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const TRAY_SNAPSHOT_COLUMNS = [
  "ams_index",
  "tray_index",
  "tray_loaded",
  "tray_present_in_ams",
  "tray_read_done",
  "tray_is_bambu",
  "filament_type",
  "filament_name",
  "color_hex",
  "tray_weight_g",
  "remaining_percent",
  "remaining_grams",
  "tag_uid",
  "tray_uuid",
  "tray_info_idx",
  "tray_id_name",
  "settings_profile",
  "nozzle_temp_min_c",
  "nozzle_temp_max_c",
  "tray_exist_bits",
  "tray_read_done_bits",
  "tray_is_bambu_bits",
  "tray_last_seen_at",
];

const EMPTY_TRAY_SNAPSHOT_CELLS = TRAY_SNAPSHOT_COLUMNS.map(() => "");

function formatCsvNumber(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function formatCsvBoolean(value: boolean | null | undefined): string {
  return value == null ? "" : value ? "true" : "false";
}

export function exportDiagnosticCaptureSessionCsv(session: DiagnosticCaptureSession): string {
  const rows = [
    [
      "section",
      "session_started_at",
      "session_seeded_from_observed_at",
      "session_last_captured_at",
      "group",
      "field",
      "observed_at",
      "value",
      "change_kind",
      "first_seen",
      "last_seen",
      "last_changed",
      "receive_count",
      "change_count",
      "avg_seen_interval_ms",
      "avg_change_interval_ms",
      "recent_values",
      ...TRAY_SNAPSHOT_COLUMNS,
    ].join(","),
  ];

  for (const tray of extractDiagnosticTraySnapshots(session.fields)) {
    const coordinate =
      tray.amsIndex == null
        ? `legacy tray ${tray.trayIndex + 1}`
        : `AMS ${tray.amsIndex + 1} tray ${tray.trayIndex + 1}`;
    rows.push(
      [
        "tray_snapshot",
        session.startedAt,
        session.seededFromObservedAt ?? "",
        session.lastCapturedAt ?? "",
        "tray",
        coordinate,
        tray.lastSeenAt ?? "",
        [
          tray.filamentType,
          tray.filamentName,
          formatBambuSettingsProfileSignal(tray.trayInfoIdx, tray.trayIdName),
        ]
          .filter(Boolean)
          .join(" · "),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        tray.amsIndex == null ? "" : String(tray.amsIndex),
        String(tray.trayIndex),
        tray.loaded ? "true" : "false",
        formatCsvBoolean(tray.trayPresentInAms),
        formatCsvBoolean(tray.trayReadDone),
        formatCsvBoolean(tray.trayIsBambu),
        tray.filamentType ?? "",
        tray.filamentName ?? "",
        tray.colorHex ?? "",
        formatCsvNumber(tray.trayWeightG),
        formatCsvNumber(tray.remainingPercent),
        formatCsvNumber(tray.remainingGrams),
        tray.tagUid ?? "",
        tray.trayUuid ?? "",
        tray.trayInfoIdx ?? "",
        tray.trayIdName ?? "",
        formatBambuSettingsProfileSignal(tray.trayInfoIdx, tray.trayIdName) ?? "",
        formatCsvNumber(tray.nozzleTempMinC),
        formatCsvNumber(tray.nozzleTempMaxC),
        tray.trayExistBits ?? "",
        tray.trayReadDoneBits ?? "",
        tray.trayIsBambuBits ?? "",
        tray.lastSeenAt ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  for (const field of session.fields) {
    const group = classifyDiagnosticField(field.path);
    rows.push(
      [
        "field_summary",
        session.startedAt,
        session.seededFromObservedAt ?? "",
        session.lastCapturedAt ?? "",
        group,
        field.path,
        "",
        field.valueText,
        "",
        field.firstSeenAt,
        field.lastSeenAt,
        field.lastChangedAt,
        String(field.receiveCount),
        String(field.changeCount),
        field.avgReceiveIntervalMs == null ? "" : String(Math.round(field.avgReceiveIntervalMs)),
        field.avgChangeIntervalMs == null ? "" : String(Math.round(field.avgChangeIntervalMs)),
        field.recentValues
          .map((sample) => `${sample.changed ? "*" : "="}${sample.valueText}@${sample.seenAt}`)
          .join(" | "),
        ...EMPTY_TRAY_SNAPSHOT_CELLS,
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  for (const sample of session.samples) {
    rows.push(
      [
        "sample_log",
        session.startedAt,
        session.seededFromObservedAt ?? "",
        session.lastCapturedAt ?? "",
        classifyDiagnosticField(sample.fieldPath),
        sample.fieldPath,
        sample.observedAt,
        sample.valueText,
        sample.changeKind,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ...EMPTY_TRAY_SNAPSHOT_CELLS,
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  return rows.join("\n");
}
