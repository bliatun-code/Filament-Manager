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
  amsIndex?: number | null;
  trayIndex: number;
  loaded: boolean;
  filamentType?: string | null;
  filamentName?: string | null;
  colorHex?: string | null;
  trayWeightG?: number | null;
  remainingPercent?: number | null;
  remainingGrams?: number | null;
  trayPresentInAms?: boolean | null;
  trayReadDone?: boolean | null;
  trayIsBambu?: boolean | null;
  trayExistBits?: string | null;
  trayReadDoneBits?: string | null;
  trayIsBambuBits?: string | null;
  tagUid?: string | null;
  trayUuid?: string | null;
  trayInfoIdx?: string | null;
  trayIdName?: string | null;
  nozzleTempMinC?: number | null;
  nozzleTempMaxC?: number | null;
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
  activeAmsIndex: number | null;
  activeTrayIndex: number | null;
  amsHumidityIndex: number | null;
  jobStateCode: number | null;
  amsStatusCode: number | null;
  amsStatusMain: number | null;
  amsStatusSub: number | null;
};

export {
  buildDiagnosticChartFieldOptions,
  buildDiagnosticChartPoints,
  isDiagnosticChartFieldCandidate,
} from "./diagnostic_capture_chart_model";
export { exportDiagnosticCaptureSessionCsv } from "./diagnostic_capture_csv";
export {
  buildDiagnosticDisplayTrays,
  countReviewDiagnosticTrays,
  diagnosticTraySnapshotKey,
  extractDiagnosticTraySnapshots,
  normalizeDiagnosticHexColor,
} from "./diagnostic_capture_trays";

function pushObservedDiagnosticField(
  fields: Array<{ path: string; valueText: string }>,
  path: string,
  value: boolean | number | string | null | undefined,
) {
  if (value == null) {
    return;
  }
  const valueText = typeof value === "string" ? value.trim() : String(value);
  if (!valueText) {
    return;
  }
  fields.push({ path, valueText });
}

function buildObservedStateDiagnosticFields(
  observedState: BambuLiveIntegrationEntry["config"]["observed_state"] | null | undefined,
  options: { includeObservedTrays: boolean } = { includeObservedTrays: true },
): Array<{ path: string; valueText: string }> {
  if (!observedState) {
    return [];
  }

  const fields: Array<{ path: string; valueText: string }> = [];
  pushObservedDiagnosticField(fields, "_bfm_job.progress_percent", observedState.progress_percent);
  pushObservedDiagnosticField(fields, "_bfm_job.remaining_minutes", observedState.remaining_minutes);
  pushObservedDiagnosticField(fields, "_bfm_job.prepare_percent", observedState.prepare_percent);
  pushObservedDiagnosticField(fields, "_bfm_job.print_stage", observedState.print_stage);
  pushObservedDiagnosticField(fields, "_bfm_job.print_error_code", observedState.print_error_code);
  pushObservedDiagnosticField(fields, "_bfm_job.job_state_code", observedState.job_state_code);
  pushObservedDiagnosticField(fields, "_bfm_job.gcode_state", observedState.gcode_state);
  pushObservedDiagnosticField(fields, "_bfm_job.print_type", observedState.print_type);
  pushObservedDiagnosticField(fields, "_bfm_job.subtask_id", observedState.subtask_id);
  pushObservedDiagnosticField(fields, "_bfm_job.subtask_name", observedState.subtask_name);
  pushObservedDiagnosticField(fields, "_bfm_job.active_ams_index", observedState.active_ams_index);
  pushObservedDiagnosticField(fields, "_bfm_job.active_tray_index", observedState.active_tray_index);
  pushObservedDiagnosticField(fields, "_bfm_job.nozzle_temp_c", observedState.nozzle_temp_c);
  pushObservedDiagnosticField(fields, "_bfm_job.bed_temp_c", observedState.bed_temp_c);
  pushObservedDiagnosticField(fields, "_bfm_ams_status.ams_humidity_index", observedState.ams_humidity_index);
  pushObservedDiagnosticField(fields, "_bfm_ams_status.ams_temperature_c", observedState.ams_temperature_c);
  pushObservedDiagnosticField(fields, "_bfm_ams_status.ams_status_code", observedState.ams_status_code);
  pushObservedDiagnosticField(fields, "_bfm_ams_status.ams_status_main", observedState.ams_status_main);
  pushObservedDiagnosticField(fields, "_bfm_ams_status.ams_status_sub", observedState.ams_status_sub);
  pushObservedDiagnosticField(fields, "_bfm_ams_bits.tray_reading_bits", observedState.ams_reading_bits);
  pushObservedDiagnosticField(fields, "_bfm_ams_bits.tray_exist_bits", observedState.ams_exist_bits);
  pushObservedDiagnosticField(fields, "_bfm_ams_bits.tray_read_done_bits", observedState.ams_read_done_bits);
  pushObservedDiagnosticField(fields, "_bfm_ams_bits.tray_is_bbl_bits", observedState.ams_bambu_bits);

  if (!options.includeObservedTrays) {
    return fields;
  }

  for (const tray of observedState.trays ?? []) {
    if (!Number.isFinite(tray.tray_index) || tray.tray_index < 0 || tray.tray_index >= 128) {
      continue;
    }
    const amsIndex = Number.isFinite(tray.ams_index ?? 0) ? (tray.ams_index ?? 0) : 0;
    const prefix = `ams.ams[${amsIndex}].tray[${tray.tray_index}]`;
    pushObservedDiagnosticField(fields, `${prefix}.tag_uid`, tray.observed_rfid_tag);
    pushObservedDiagnosticField(fields, `${prefix}.tray_uuid`, tray.tray_uuid);
    pushObservedDiagnosticField(fields, `${prefix}.tray_info_idx`, tray.tray_info_idx);
    pushObservedDiagnosticField(fields, `${prefix}.tray_id_name`, tray.tray_id_name);
    pushObservedDiagnosticField(fields, `${prefix}.tray_type`, tray.filament_type);
    pushObservedDiagnosticField(fields, `${prefix}.tray_sub_brands`, tray.filament_name);
    pushObservedDiagnosticField(fields, `${prefix}.tray_color`, tray.color_hex);
    pushObservedDiagnosticField(fields, `${prefix}.tray_weight`, tray.tray_weight_g);
    pushObservedDiagnosticField(fields, `${prefix}.remain`, tray.remaining_percent);
    pushObservedDiagnosticField(fields, `${prefix}.remaining_grams`, tray.remaining_grams);
  }

  return fields;
}

function buildFlattenedDiagnosticFields(
  observedState: BambuLiveIntegrationEntry["config"]["observed_state"] | null | undefined,
): Array<{ path: string; valueText: string }> {
  const rawFields = observedState?.raw_payload_json
    ? flattenDiagnosticFields(observedState.raw_payload_json)
    : [];
  const rawPaths = new Set(rawFields.map((field) => field.path));
  const observedFields = buildObservedStateDiagnosticFields(observedState, {
    includeObservedTrays: rawFields.length === 0,
  }).filter((field) => !rawPaths.has(field.path));
  return [...rawFields, ...observedFields];
}

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
  const flattened = buildFlattenedDiagnosticFields(observedState);

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
    seededFromObservedAt: flattened.length > 0 ? observedAt : null,
    lastCapturedAt: flattened.length > 0 ? observedAt : null,
    fields,
    samples,
  };
}

export function updateDiagnosticCaptureSessionFromObservedState(input: {
  session: DiagnosticCaptureSession | null | undefined;
  observedState: BambuLiveIntegrationEntry["config"]["observed_state"] | null | undefined;
}): DiagnosticCaptureSession | null {
  const flattened = buildFlattenedDiagnosticFields(input.observedState);
  if (flattened.length === 0) {
    return null;
  }

  return updateDiagnosticCaptureSessionFromFlattenedFields({
    session: input.session,
    flattened,
    observedAt: input.observedState?.last_seen_at ?? new Date().toISOString(),
  });
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

  return updateDiagnosticCaptureSessionFromFlattenedFields({
    session: input.session,
    flattened,
    observedAt: input.observedAt,
  });
}

function updateDiagnosticCaptureSessionFromFlattenedFields(input: {
  session: DiagnosticCaptureSession | null | undefined;
  flattened: Array<{ path: string; valueText: string }>;
  observedAt: string;
}): DiagnosticCaptureSession | null {
  const existingSession = input.session ?? buildDiagnosticCaptureSession(null);
  const previousFields = new Map(existingSession.fields.map((field) => [field.path, field]));
  const nextSamples = [...existingSession.samples];

  for (const { path, valueText } of input.flattened) {
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
  if (normalized.startsWith("_bfm_ams") || normalized.includes("ams_status")) {
    return "ams";
  }
  if (normalized.startsWith("tray") || normalized.includes(".tray[")) {
    return "tray";
  }
  if (
    normalized.startsWith("mc_") ||
    normalized.startsWith("gcode_") ||
    normalized.startsWith("_bfm_job") ||
    normalized.includes("job_state") ||
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

function firstDiagnosticFieldNumber(
  fields: DiagnosticCaptureField[],
  paths: string[],
): number | null {
  for (const path of paths) {
    const value = diagnosticFieldNumber(fields, path);
    if (value != null) {
      return value;
    }
  }
  return null;
}

function splitDiagnosticAmsStatusCode(statusCode: number | null): {
  main: number;
  sub: number;
} | null {
  if (statusCode == null || !Number.isFinite(statusCode) || statusCode < 0) {
    return null;
  }
  const normalized = Math.trunc(statusCode);
  return {
    main: normalized >> 8,
    sub: normalized & 0xff,
  };
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
      /(tag_uid|tray_uuid|chip_id|tray_info_idx|tray_id_name|tray_sub_brands|tray_type|tray_color|tray_weight|remaining_grams|nozzle_temp_min|nozzle_temp_max)/.test(
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
      label: "Stable AMS metadata",
      description: "RFID, filament settings, material and tray metadata observed from AMS.",
      fields: stableMetadata,
    },
    {
      label: "Event-driven AMS signals",
      description: "AMS read and sync status fields that tend to appear around events.",
      fields: eventDrivenIdentity,
    },
    {
      label: "Continuous telemetry",
      description: "Fields that look like normal status/telemetry updates during operation.",
      fields: continuousTelemetry,
    },
  ].filter((bucket) => bucket.fields.length > 0);
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
  return fields.filter((field) => /(tag_uid|tray_uuid|chip_id)/.test(field.path)).length;
}

export function isDiagnosticAmsReadInProgress(fields: DiagnosticCaptureField[]): boolean {
  const amsTrayReadingBits = diagnosticFieldValue(fields, "ams.tray_reading_bits");
  return Boolean(amsTrayReadingBits && amsTrayReadingBits.trim() && !/^0+$/i.test(amsTrayReadingBits.trim()));
}

export function decodeBambuTrayCoordinate(rawTrayIndex: number | null): {
  activeAmsIndex: number | null;
  activeTrayIndex: number | null;
} {
  if (rawTrayIndex == null) {
    return { activeAmsIndex: null, activeTrayIndex: null };
  }
  if (rawTrayIndex === 255 || rawTrayIndex === 254) {
    return { activeAmsIndex: null, activeTrayIndex: rawTrayIndex };
  }
  if (rawTrayIndex >= 0x80 && rawTrayIndex <= 0x87) {
    return { activeAmsIndex: rawTrayIndex, activeTrayIndex: rawTrayIndex & 0x3 };
  }
  return { activeAmsIndex: rawTrayIndex >> 2, activeTrayIndex: rawTrayIndex & 0x3 };
}

export function buildDiagnosticFallbackSummary(fields: DiagnosticCaptureField[]): DiagnosticFallbackSummary {
  const amsStatusCode = firstDiagnosticFieldNumber(fields, [
    "_bfm_ams_status.ams_status_code",
    "ams.ams_status",
    "print.ams.ams_status",
    "ams_status",
  ]);
  const splitAmsStatus = splitDiagnosticAmsStatusCode(amsStatusCode);
  const activeTrayCoordinate = decodeBambuTrayCoordinate(
    diagnosticFieldNumber(fields, "ams.tray_now") ?? diagnosticFieldNumber(fields, "tray_now"),
  );
  return {
    progressPercent:
      diagnosticFieldNumber(fields, "mc_percent") ??
      diagnosticFieldNumber(fields, "_bfm_job.progress_percent"),
    remainingMinutes:
      diagnosticFieldNumber(fields, "mc_remaining_time") ??
      diagnosticFieldNumber(fields, "_bfm_job.remaining_minutes"),
    activeAmsIndex:
      activeTrayCoordinate.activeAmsIndex ??
      diagnosticFieldNumber(fields, "_bfm_job.active_ams_index"),
    activeTrayIndex:
      activeTrayCoordinate.activeTrayIndex ??
      diagnosticFieldNumber(fields, "_bfm_job.active_tray_index"),
    amsHumidityIndex:
      diagnosticFieldNumber(fields, "ams.ams[0].humidity") ??
      diagnosticFieldNumber(fields, "humidity") ??
      diagnosticFieldNumber(fields, "_bfm_ams_status.ams_humidity_index"),
    jobStateCode: firstDiagnosticFieldNumber(fields, [
      "_bfm_job.job_state_code",
      "job.job_state",
      "print.job.job_state",
      "job_state",
    ]),
    amsStatusCode,
    amsStatusMain:
      firstDiagnosticFieldNumber(fields, ["_bfm_ams_status.ams_status_main"]) ??
      splitAmsStatus?.main ??
      null,
    amsStatusSub:
      firstDiagnosticFieldNumber(fields, ["_bfm_ams_status.ams_status_sub"]) ??
      splitAmsStatus?.sub ??
      null,
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
