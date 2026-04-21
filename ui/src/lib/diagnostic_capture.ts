import type { BambuLiveIntegrationEntry } from "./tauri_client";

export type DiagnosticCaptureField = {
  path: string;
  valueText: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
  receiveCount: number;
  changeCount: number;
  avgReceiveIntervalMs: number | null;
  avgChangeIntervalMs: number | null;
  recentValues: Array<{
    valueText: string;
    seenAt: string;
    changed: boolean;
  }>;
};

export type DiagnosticCaptureSample = {
  fieldPath: string;
  observedAt: string;
  valueText: string;
  changeKind: "seeded" | "first_seen" | "changed" | "refresh";
};

export type DiagnosticCaptureSession = {
  startedAt: string;
  seededFromObservedAt: string | null;
  lastCapturedAt: string | null;
  fields: DiagnosticCaptureField[];
  samples: DiagnosticCaptureSample[];
};

export type DiagnosticChartFieldOption = {
  path: string;
  label: string;
};

export type DiagnosticSortKey =
  | "path"
  | "last_seen_desc"
  | "avg_seen_interval"
  | "change_count"
  | "avg_change_interval";

export type DiagnosticFilterKey = "all" | "changed" | "recent" | "high_frequency";

export type DiagnosticGroupKey = "print" | "ams" | "tray" | "other";

export type DiagnosticTraySnapshot = {
  trayIndex: number;
  loaded: boolean;
  filamentType?: string | null;
  filamentName?: string | null;
  colorHex?: string | null;
  remainingPercent?: number | null;
  tagUid?: string | null;
  trayUuid?: string | null;
  trayInfoIdx?: string | null;
  trayIdName?: string | null;
  lastSeenAt?: string | null;
};

export type DiagnosticSignalQualityBucket = {
  label: string;
  description: string;
  fields: DiagnosticCaptureField[];
};

export function flattenDiagnosticFields(
  value: unknown,
  prefix = "",
): Array<{ path: string; valueText: string }> {
  if (value == null) {
    return prefix ? [{ path: prefix, valueText: "null" }] : [];
  }

  if (Array.isArray(value)) {
    const nested = value.flatMap((entry, index) =>
      flattenDiagnosticFields(entry, prefix ? `${prefix}[${index}]` : `[${index}]`),
    );
    return nested.length > 0 ? nested : prefix ? [{ path: prefix, valueText: "[]" }] : [];
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const nested = entries.flatMap(([key, entryValue]) =>
      flattenDiagnosticFields(entryValue, prefix ? `${prefix}.${key}` : key),
    );
    return nested.length > 0 ? nested : prefix ? [{ path: prefix, valueText: "{}" }] : [];
  }

  return [
    {
      path: prefix,
      valueText: typeof value === "string" ? value : String(value),
    },
  ];
}

export function averageIntervalMs(
  previousAverage: number | null,
  sampleCount: number,
  nextSampleMs: number,
): number {
  if (sampleCount <= 0) {
    return nextSampleMs;
  }
  if (previousAverage == null) {
    return nextSampleMs;
  }
  return (previousAverage * sampleCount + nextSampleMs) / (sampleCount + 1);
}

export function diffMs(laterIso: string, earlierIso: string): number | null {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) {
    return null;
  }
  return Math.max(0, later - earlier);
}

export function formatIntervalMs(value: number | null): string {
  if (value == null) {
    return "—";
  }
  const seconds = value / 1000;
  if (seconds < 1) {
    return `${Math.round(value)} ms`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  }
  const minutes = seconds / 60;
  return `${minutes.toFixed(minutes < 10 ? 1 : 0)} min`;
}

export function exportDiagnosticCaptureSessionCsv(session: DiagnosticCaptureSession): string {
  const escapeCsv = (value: string): string => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

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

export function buildDiagnosticCaptureSession(
  observedState: BambuLiveIntegrationEntry["config"]["observed_state"] | null | undefined,
): DiagnosticCaptureSession {
  const startedAt = new Date().toISOString();
  const observedAt = observedState?.last_seen_at ?? startedAt;
  const flattened = observedState?.raw_payload_json
    ? flattenDiagnosticFields(observedState.raw_payload_json)
    : [];

  const fields = flattened
    .map(({ path, valueText }) => ({
      path,
      valueText,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      lastChangedAt: observedAt,
      receiveCount: 1,
      changeCount: 1,
      avgReceiveIntervalMs: null,
      avgChangeIntervalMs: null,
      recentValues: [
        {
          valueText,
          seenAt: observedAt,
          changed: true,
        },
      ],
    }))
    .sort((left, right) => left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: "base" }));

  const samples = flattened.map(({ path, valueText }) => ({
    fieldPath: path,
    observedAt,
    valueText,
    changeKind: "seeded" as const,
  }));

  return {
    startedAt,
    seededFromObservedAt: observedState?.raw_payload_json ? observedAt : null,
    lastCapturedAt: observedState?.raw_payload_json ? observedAt : null,
    fields,
    samples,
  };
}

export function classifyDiagnosticField(path: string): DiagnosticGroupKey {
  const normalized = path.trim().toLowerCase();
  if (!normalized) {
    return "other";
  }
  if (normalized.startsWith("ams.") || normalized.startsWith("ams[")) {
    if (normalized.includes(".tray[") || normalized.includes(".tray.")) {
      return "tray";
    }
    return "ams";
  }
  if (normalized.startsWith("tray") || normalized.includes(".tray[")) {
    return "tray";
  }
  if (
    normalized.startsWith("mc_") ||
    normalized.startsWith("gcode_") ||
    normalized.includes("temper") ||
    normalized.includes("print") ||
    normalized === "msg" ||
    normalized === "command" ||
    normalized === "sequence_id"
  ) {
    return "print";
  }
  return "other";
}

export function diagnosticFieldValue(fields: DiagnosticCaptureField[], path: string): string | null {
  return fields.find((field) => field.path === path)?.valueText ?? null;
}

export function diagnosticFieldNumber(fields: DiagnosticCaptureField[], path: string): number | null {
  const raw = diagnosticFieldValue(fields, path);
  if (raw == null) {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDiagnosticHexColor(value: string | null): string | null {
  const normalized = value?.trim().replace(/^#/, "") ?? "";
  if (/^[0-9a-f]{8}$/i.test(normalized)) {
    return `#${normalized.slice(0, 6).toUpperCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return `#${normalized.toUpperCase()}`;
  }
  return null;
}

export function extractDiagnosticTraySnapshots(fields: DiagnosticCaptureField[]): DiagnosticTraySnapshot[] {
  const trayIndices = Array.from(
    new Set(
      fields
        .map((field) => {
          const match = field.path.match(/ams\.ams\[\d+\]\.tray\[(\d+)\]\./);
          return match ? Number.parseInt(match[1] ?? "", 10) : null;
        })
        .filter((value): value is number => value != null && Number.isFinite(value)),
    ),
  ).sort((left, right) => left - right);

  return trayIndices.map((trayIndex) => {
    const prefix = `ams.ams[0].tray[${trayIndex}]`;
    const fieldFor = (name: string) => fields.find((field) => field.path === `${prefix}.${name}`) ?? null;
    const filamentType = fieldFor("tray_type")?.valueText ?? null;
    const filamentName = fieldFor("tray_sub_brands")?.valueText ?? null;
    const colorRaw = fieldFor("tray_color")?.valueText ?? null;
    const remainingRaw = fieldFor("remain")?.valueText ?? null;
    const remainingPercent =
      remainingRaw != null && Number.isFinite(Number.parseFloat(remainingRaw))
        ? Number.parseInt(remainingRaw, 10)
        : null;
    const lastSeenAt = [
      fieldFor("tray_type")?.lastSeenAt,
      fieldFor("tray_sub_brands")?.lastSeenAt,
      fieldFor("tray_color")?.lastSeenAt,
      fieldFor("remain")?.lastSeenAt,
      fieldFor("tray_uuid")?.lastSeenAt,
    ]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;

    return {
      trayIndex,
      loaded: Boolean(
        (filamentType && filamentType.trim()) ||
          (filamentName && filamentName.trim()) ||
          (fieldFor("tray_uuid")?.valueText && !/^0+$/.test(fieldFor("tray_uuid")?.valueText ?? "")),
      ),
      filamentType,
      filamentName,
      colorHex: normalizeDiagnosticHexColor(colorRaw),
      remainingPercent,
      tagUid: fieldFor("tag_uid")?.valueText ?? null,
      trayUuid: fieldFor("tray_uuid")?.valueText ?? null,
      trayInfoIdx: fieldFor("tray_info_idx")?.valueText ?? null,
      trayIdName: fieldFor("tray_id_name")?.valueText ?? null,
      lastSeenAt,
    };
  });
}

export function pushRecentDiagnosticValue(
  current: DiagnosticCaptureField["recentValues"],
  sample: { valueText: string; seenAt: string; changed: boolean },
): DiagnosticCaptureField["recentValues"] {
  const last = current[current.length - 1];
  if (last && last.valueText === sample.valueText && last.changed === sample.changed) {
    const updated = [...current];
    updated[updated.length - 1] = { ...last, seenAt: sample.seenAt };
    return updated;
  }
  return [...current, sample].slice(-6);
}

export function buildDiagnosticSignalQualityBuckets(
  fields: DiagnosticCaptureField[],
): DiagnosticSignalQualityBucket[] {
  const stableMetadata = fields.filter((field) => {
    const path = field.path.toLowerCase();
    return (
      /(tag_uid|tray_uuid|chip_id|tray_info_idx|tray_id_name|tray_sub_brands|tray_type|tray_color)/.test(
        path,
      ) &&
      field.changeCount <= 2
    );
  });

  const eventDrivenIdentity = fields.filter((field) => {
    const path = field.path.toLowerCase();
    return (
      /(rfid|read_done|reading_bits|exist_bits|tray_is_bbl_bits|tray_now|ams_status)/.test(path) &&
      (field.changeCount > 1 || field.avgReceiveIntervalMs == null || field.avgReceiveIntervalMs > 5000)
    );
  });

  const continuousTelemetry = fields.filter((field) => {
    const path = field.path.toLowerCase();
    return (
      /(temper|percent|remaining_time|wifi_signal|speed|mc_|bed_)/.test(path) &&
      field.receiveCount > 1 &&
      (field.avgReceiveIntervalMs == null || field.avgReceiveIntervalMs <= 10000)
    );
  });

  return [
    {
      label: "Stable metadata",
      description: "Identity and tray metadata that appears stable when observed.",
      fields: stableMetadata,
    },
    {
      label: "Event-driven identity",
      description: "Fields that tend to appear or change around AMS read/sync events.",
      fields: eventDrivenIdentity,
    },
    {
      label: "Continuous telemetry",
      description: "Fields that look like normal status/telemetry updates during operation.",
      fields: continuousTelemetry,
    },
  ].filter((bucket) => bucket.fields.length > 0);
}

export function isDiagnosticChartFieldCandidate(field: DiagnosticCaptureField): boolean {
  const path = field.path.trim().toLowerCase();
  const numericValue = Number.parseFloat(field.valueText);
  if (!Number.isFinite(numericValue) || field.receiveCount < 2 || field.changeCount < 2) {
    return false;
  }
  if (
    /(sequence_id|^msg$|^command$|_uuid|tag_uid|chip_id|tray_weight|total_len|tray_diameter|tray_time|bed_temp_type|nozzle_temp_min|nozzle_temp_max|tray_info_idx|tray_id_name|home_flag|\.id$|^id$)/.test(
      path,
    )
  ) {
    return false;
  }
  return /(temper|temp|percent|remaining_time|humidity_raw|speed|layer_num|remain|fan)/.test(path);
}

export function buildDiagnosticChartFieldOptions(
  fields: DiagnosticCaptureField[],
): DiagnosticChartFieldOption[] {
  return fields
    .filter(isDiagnosticChartFieldCandidate)
    .sort((left, right) => {
      if (right.changeCount !== left.changeCount) {
        return right.changeCount - left.changeCount;
      }
      if (right.receiveCount !== left.receiveCount) {
        return right.receiveCount - left.receiveCount;
      }
      return left.path.localeCompare(right.path, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    })
    .map((field) => ({
      path: field.path,
      label: field.path,
    }));
}

export function buildDiagnosticChartPoints(
  session: DiagnosticCaptureSession | null,
  fieldPath: string | null,
): Array<{ observedAt: string; value: number; valueText: string }> {
  if (!session || !fieldPath) {
    return [];
  }
  return session.samples
    .filter((sample) => sample.fieldPath === fieldPath)
    .map((sample) => {
      const value = Number.parseFloat(sample.valueText);
      return Number.isFinite(value)
        ? {
            observedAt: sample.observedAt,
            value,
            valueText: sample.valueText,
          }
        : null;
    })
    .filter((point): point is { observedAt: string; value: number; valueText: string } => point != null);
}
