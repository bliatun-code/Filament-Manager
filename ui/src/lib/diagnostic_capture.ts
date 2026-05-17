import type { BambuLiveIntegrationEntry, BambuLiveObservedTray } from "./tauri_client";

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

export type DiagnosticFieldGroup = {
  key: DiagnosticGroupKey;
  fields: DiagnosticCaptureField[];
};

export type DiagnosticFallbackSummary = {
  progressPercent: number | null;
  remainingMinutes: number | null;
  activeTrayIndex: number | null;
  amsHumidityIndex: number | null;
};

export {
  buildDiagnosticChartFieldOptions,
  buildDiagnosticChartPoints,
  isDiagnosticChartFieldCandidate,
} from "./diagnostic_capture_chart_model";
export { exportDiagnosticCaptureSessionCsv } from "./diagnostic_capture_csv";

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

export function updateDiagnosticCaptureSessionFromPayload(input: {
  session: DiagnosticCaptureSession | null | undefined;
  rawPayload: unknown;
  observedAt: string;
}): DiagnosticCaptureSession | null {
  const flattened = flattenDiagnosticFields(input.rawPayload);
  if (flattened.length === 0) {
    return null;
  }

  const existingSession = input.session ?? buildDiagnosticCaptureSession(null);
  const previousFields = new Map(existingSession.fields.map((field) => [field.path, field]));
  const nextSamples = [...existingSession.samples];

  for (const { path, valueText } of flattened) {
    const existing = previousFields.get(path);
    if (!existing) {
      previousFields.set(path, {
        path,
        valueText,
        firstSeenAt: input.observedAt,
        lastSeenAt: input.observedAt,
        lastChangedAt: input.observedAt,
        receiveCount: 1,
        changeCount: 1,
        avgReceiveIntervalMs: null,
        avgChangeIntervalMs: null,
        recentValues: [
          {
            valueText,
            seenAt: input.observedAt,
            changed: true,
          },
        ],
      });
      nextSamples.push({
        fieldPath: path,
        observedAt: input.observedAt,
        valueText,
        changeKind: existingSession.seededFromObservedAt == null ? "first_seen" : "changed",
      });
      continue;
    }

    const receiveIntervalMs = diffMs(input.observedAt, existing.lastSeenAt);
    if (existing.valueText === valueText) {
      previousFields.set(path, {
        ...existing,
        lastSeenAt: input.observedAt,
        receiveCount: existing.receiveCount + 1,
        avgReceiveIntervalMs:
          receiveIntervalMs == null
            ? existing.avgReceiveIntervalMs
            : averageIntervalMs(
                existing.avgReceiveIntervalMs,
                Math.max(0, existing.receiveCount - 1),
                receiveIntervalMs,
              ),
        recentValues: pushRecentDiagnosticValue(existing.recentValues, {
          valueText,
          seenAt: input.observedAt,
          changed: false,
        }),
      });
      nextSamples.push({
        fieldPath: path,
        observedAt: input.observedAt,
        valueText,
        changeKind: "refresh",
      });
      continue;
    }

    const changeIntervalMs = diffMs(input.observedAt, existing.lastChangedAt);
    previousFields.set(path, {
      path,
      valueText,
      firstSeenAt: existing.firstSeenAt,
      lastSeenAt: input.observedAt,
      lastChangedAt: input.observedAt,
      receiveCount: existing.receiveCount + 1,
      changeCount: existing.changeCount + 1,
      avgReceiveIntervalMs:
        receiveIntervalMs == null
          ? existing.avgReceiveIntervalMs
          : averageIntervalMs(
              existing.avgReceiveIntervalMs,
              Math.max(0, existing.receiveCount - 1),
              receiveIntervalMs,
            ),
      avgChangeIntervalMs:
        changeIntervalMs == null
          ? existing.avgChangeIntervalMs
          : averageIntervalMs(
              existing.avgChangeIntervalMs,
              Math.max(0, existing.changeCount - 1),
              changeIntervalMs,
            ),
      recentValues: pushRecentDiagnosticValue(existing.recentValues, {
        valueText,
        seenAt: input.observedAt,
        changed: true,
      }),
    });
    nextSamples.push({
      fieldPath: path,
      observedAt: input.observedAt,
      valueText,
      changeKind: "changed",
    });
  }

  return {
    ...existingSession,
    lastCapturedAt: input.observedAt,
    fields: Array.from(previousFields.values()).sort((left, right) =>
      left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: "base" }),
    ),
    samples: nextSamples,
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

export function buildDiagnosticDisplayTrays(
  observedTrays: BambuLiveObservedTray[],
  fields: DiagnosticCaptureField[],
): BambuLiveObservedTray[] {
  if (observedTrays.length > 0) {
    return observedTrays;
  }
  return extractDiagnosticTraySnapshots(fields).map((tray) => ({
    tray_index: tray.trayIndex,
    loaded: tray.loaded,
    filament_type: tray.filamentType ?? null,
    filament_name: tray.filamentName ?? null,
    color_hex: tray.colorHex ?? null,
    remaining_percent: tray.remainingPercent ?? null,
    match_status: null,
    match_note:
      [tray.tagUid, tray.trayUuid, tray.trayInfoIdx, tray.trayIdName].filter(Boolean).join(" · ") || null,
  }));
}

export function latestDiagnosticCaptureSeenAt(
  session: DiagnosticCaptureSession | null,
  fields: DiagnosticCaptureField[],
): string | null {
  return (
    session?.lastCapturedAt ??
    fields.map((field) => field.lastSeenAt).sort((left, right) => Date.parse(right) - Date.parse(left))[0] ??
    null
  );
}

export function countChangedDiagnosticFields(fields: DiagnosticCaptureField[]): number {
  return fields.filter((field) => field.changeCount > 1).length;
}

export function countDiagnosticIdentitySignals(fields: DiagnosticCaptureField[]): number {
  return fields.filter((field) => /(tag_uid|tray_uuid|chip_id|tray_info_idx|tray_id_name)/.test(field.path)).length;
}

export function isDiagnosticAmsReadInProgress(fields: DiagnosticCaptureField[]): boolean {
  const amsTrayReadingBits = diagnosticFieldValue(fields, "ams.tray_reading_bits");
  return Boolean(amsTrayReadingBits && amsTrayReadingBits.trim() && !/^0+$/i.test(amsTrayReadingBits.trim()));
}

export function buildDiagnosticFallbackSummary(fields: DiagnosticCaptureField[]): DiagnosticFallbackSummary {
  return {
    progressPercent: diagnosticFieldNumber(fields, "mc_percent"),
    remainingMinutes: diagnosticFieldNumber(fields, "mc_remaining_time"),
    activeTrayIndex: diagnosticFieldNumber(fields, "ams.tray_now") ?? diagnosticFieldNumber(fields, "tray_now"),
    amsHumidityIndex:
      diagnosticFieldNumber(fields, "ams.ams[0].humidity") ?? diagnosticFieldNumber(fields, "humidity"),
  };
}

export function filterDiagnosticFields(
  fields: DiagnosticCaptureField[],
  filterKey: DiagnosticFilterKey,
  nowIso = new Date().toISOString(),
): DiagnosticCaptureField[] {
  return fields.filter((field) => {
    if (filterKey === "changed") {
      return field.changeCount > 1;
    }
    if (filterKey === "recent") {
      const diff = diffMs(nowIso, field.lastSeenAt);
      return diff != null && diff <= 60_000;
    }
    if (filterKey === "high_frequency") {
      return field.avgReceiveIntervalMs != null && field.avgReceiveIntervalMs <= 5_000;
    }
    return true;
  });
}

export function sortDiagnosticFields(
  fields: DiagnosticCaptureField[],
  sortKey: DiagnosticSortKey,
): DiagnosticCaptureField[] {
  return [...fields].sort((left, right) => {
    if (sortKey === "last_seen_desc") {
      return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt);
    }
    if (sortKey === "avg_seen_interval") {
      return (left.avgReceiveIntervalMs ?? Number.POSITIVE_INFINITY)
        - (right.avgReceiveIntervalMs ?? Number.POSITIVE_INFINITY);
    }
    if (sortKey === "change_count") {
      return right.changeCount - left.changeCount;
    }
    if (sortKey === "avg_change_interval") {
      return (left.avgChangeIntervalMs ?? Number.POSITIVE_INFINITY)
        - (right.avgChangeIntervalMs ?? Number.POSITIVE_INFINITY);
    }
    return left.path.localeCompare(right.path, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function groupDiagnosticFields(fields: DiagnosticCaptureField[]): DiagnosticFieldGroup[] {
  return (["print", "ams", "tray", "other"] as const)
    .map((groupKey) => ({
      key: groupKey,
      fields: fields.filter((field) => classifyDiagnosticField(field.path) === groupKey),
    }))
    .filter((group) => group.fields.length > 0);
}

export function countReviewDiagnosticTrays(observedTrays: BambuLiveObservedTray[]): number {
  return (
    observedTrays.filter(
      (tray) =>
        tray.match_status &&
        tray.match_status !== "clear_match" &&
        tray.match_status !== "unknown_from_printer",
    ).length ?? 0
  );
}
