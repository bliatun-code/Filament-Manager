import {
  classifyDiagnosticField,
  type DiagnosticCaptureSession,
} from "./diagnostic_capture";

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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
    ].join(","),
  ];

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
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  return rows.join("\n");
}
