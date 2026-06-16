import {
  buildDiagnosticCaptureSession,
  buildDiagnosticChartFieldOptions,
  buildDiagnosticChartPoints,
  buildDiagnosticDisplayTrays,
  buildDiagnosticFallbackSummary,
  buildDiagnosticSignalQualityBuckets,
  countChangedDiagnosticFields,
  countDiagnosticIdentitySignals,
  countReviewDiagnosticTrays,
  diagnosticTraySnapshotKey,
  extractDiagnosticTraySnapshots,
  filterDiagnosticFields,
  groupDiagnosticFields,
  isDiagnosticAmsReadInProgress,
  latestDiagnosticCaptureSeenAt,
  sortDiagnosticFields,
  type DiagnosticCaptureSession,
  type DiagnosticFieldGroup,
  type DiagnosticFilterKey,
  type DiagnosticSortKey,
} from "../lib/diagnostic_capture";
import type {
  BambuLiveIntegrationSettings,
  BambuLiveObservedState,
  SpoolWithMasterRow,
} from "../lib/tauri_client";
import {
  buildSettingsBambuLiveDiagnosticTrayCards,
  formatSettingsBambuLiveSummaryTrayIndexLabel,
} from "./settings_bambu_live_tray_model";
export {
  buildSettingsBambuLiveAmsWeightLabel,
  buildSettingsBambuLiveDiagnosticTrayCard,
  buildSettingsBambuLiveDiagnosticTrayCards,
  buildSettingsBambuLiveInventoryCandidateCards,
  buildSettingsBambuLiveInventoryMatchDescription,
  buildSettingsBambuLiveInventoryMatchPresentation,
  buildSettingsBambuLiveNozzleRangeLabel,
  buildSettingsBambuLiveObservedRfid,
  parseSettingsBambuLivePresetName,
  buildSettingsBambuLivePresetSignalLabel,
  buildSettingsBambuLiveTrayDisplayText,
  buildSettingsBambuLiveTrayLabels,
  buildSettingsBambuLiveTrayReviewState,
  formatSettingsBambuLiveMqttTrayIndexLabel,
  formatSettingsBambuLiveSlotIndexLabel,
  formatSettingsBambuLiveSummaryTrayIndexLabel,
  resolveSettingsBambuLiveCapturedTraySnapshot,
} from "./settings_bambu_live_tray_model";

type TranslateFn = (key: string, fallback: string) => string;
type FormatDateTimeFn = (value: string) => string;

type BuildSettingsBambuLiveDiagnosticsModelInput = {
  diagnosticFilter: DiagnosticFilterKey;
  diagnosticSession: DiagnosticCaptureSession | null;
  diagnosticSort: DiagnosticSortKey;
  formatDateTime: FormatDateTimeFn;
  liveConfig: BambuLiveIntegrationSettings | null;
  selectedChartFieldPath?: string | null;
  spoolRows: SpoolWithMasterRow[];
  t: TranslateFn;
};

type SettingsBambuLiveSummarySource = {
  activeAmsIndex?: number | null;
  activeTrayIndex?: number | null;
  amsHumidityIndex?: number | null;
  amsStatusCode?: number | null;
  amsStatusMain?: number | null;
  amsStatusSub?: number | null;
  jobStateCode?: number | null;
  progressPercent?: number | null;
  remainingMinutes?: number | null;
};

type BuildSettingsBambuLiveDiagnosticMetricCardsInput = {
  captureSessionLastSeenAt: string | null;
  captureSessionSeededAt: string | null;
  captureSessionStartedAt: string | null;
  changedFieldCount: number;
  formatDateTime: FormatDateTimeFn;
  identityFieldCount: number;
  t: TranslateFn;
};

function buildSettingsBambuLiveSummaryParts(
  source: SettingsBambuLiveSummarySource,
  t: TranslateFn,
): string[] {
  const parts: string[] = [];
  if (source.progressPercent != null) {
    parts.push(`${source.progressPercent}%`);
  }
  if (source.remainingMinutes != null) {
    parts.push(`${source.remainingMinutes} min`);
  }
  if (source.activeTrayIndex != null) {
    parts.push(
      formatSettingsBambuLiveSummaryTrayIndexLabel(
        source.activeTrayIndex,
        t,
        source.activeAmsIndex,
      ),
    );
  }
  if (source.amsHumidityIndex != null) {
    parts.push(
      `${t("settings.bambuLiveSummaryAmsHumidity", "AMS humidity")} ${source.amsHumidityIndex}`,
    );
  }
  if (source.jobStateCode != null) {
    parts.push(`${t("settings.bambuLiveSummaryJobState", "Job state")} ${source.jobStateCode}`);
  }
  if (source.amsStatusCode != null) {
    const statusValue =
      source.amsStatusMain != null && source.amsStatusSub != null
        ? `${source.amsStatusMain}/${source.amsStatusSub}`
        : String(source.amsStatusCode);
    parts.push(`${t("settings.bambuLiveSummaryAmsStatus", "AMS status")} ${statusValue}`);
  }
  return parts;
}

export function buildSettingsBambuLiveFallbackSummaryParts(
  diagnosticFields: DiagnosticCaptureSession["fields"],
  t: TranslateFn,
): string[] {
  const fallbackSummary = buildDiagnosticFallbackSummary(diagnosticFields);
  return buildSettingsBambuLiveSummaryParts(
    {
      activeTrayIndex: fallbackSummary.activeTrayIndex,
      activeAmsIndex: fallbackSummary.activeAmsIndex,
      amsHumidityIndex: fallbackSummary.amsHumidityIndex,
      progressPercent: fallbackSummary.progressPercent,
      remainingMinutes: fallbackSummary.remainingMinutes,
    },
    t,
  );
}

export function buildSettingsBambuLiveObservedSummaryParts(
  observedState: BambuLiveObservedState | null,
  t: TranslateFn,
): string[] {
  return buildSettingsBambuLiveSummaryParts(
    {
      activeTrayIndex: observedState?.active_tray_index,
      activeAmsIndex: observedState?.active_ams_index,
      amsHumidityIndex: observedState?.ams_humidity_index,
      amsStatusCode: observedState?.ams_status_code,
      amsStatusMain: observedState?.ams_status_main,
      amsStatusSub: observedState?.ams_status_sub,
      jobStateCode: observedState?.job_state_code,
      progressPercent: observedState?.progress_percent,
      remainingMinutes: observedState?.remaining_minutes,
    },
    t,
  );
}

export function buildSettingsBambuLiveDiagnosticMetricCards({
  captureSessionLastSeenAt,
  captureSessionSeededAt,
  captureSessionStartedAt,
  changedFieldCount,
  formatDateTime,
  identityFieldCount,
  t,
}: BuildSettingsBambuLiveDiagnosticMetricCardsInput) {
  return [
    {
      key: "started",
      label: t("settings.bambuLiveCaptureStarted", "Capture started"),
      value: captureSessionStartedAt ? formatDateTime(captureSessionStartedAt) : "—",
    },
    {
      key: "lastSeen",
      label: t("settings.bambuLiveCaptureLastUpdate", "Last captured"),
      value: captureSessionLastSeenAt ? formatDateTime(captureSessionLastSeenAt) : "—",
    },
    {
      key: "seededFrom",
      label: t("settings.bambuLiveCaptureSeededFrom", "Seeded from live state"),
      value: captureSessionSeededAt ? formatDateTime(captureSessionSeededAt) : "—",
    },
    {
      key: "changedFields",
      label: t("settings.bambuLiveChangedFields", "Changed fields"),
      value: String(changedFieldCount),
    },
    {
      key: "identitySignals",
      label: t("settings.bambuLiveIdentitySignals", "Identity signals"),
      value: String(identityFieldCount),
    },
  ];
}

export function buildSettingsBambuLiveSignalQualityBuckets(
  diagnosticFields: DiagnosticCaptureSession["fields"],
  t: TranslateFn,
) {
  return buildDiagnosticSignalQualityBuckets(diagnosticFields).map((bucket) => {
    if (bucket.label === "Stable AMS metadata") {
      return {
        ...bucket,
        description: t(
          "settings.bambuLiveSignalStableDesc",
          "RFID, filament settings, material and tray metadata observed from AMS.",
        ),
        label: t("settings.bambuLiveSignalStable", "Stable AMS metadata"),
      };
    }
    if (bucket.label === "Event-driven AMS signals") {
      return {
        ...bucket,
        description: t(
          "settings.bambuLiveSignalEventDrivenDesc",
          "AMS read and sync status fields that tend to appear around events.",
        ),
        label: t("settings.bambuLiveSignalEventDriven", "Event-driven AMS signals"),
      };
    }
    return {
      ...bucket,
      description: t(
        "settings.bambuLiveSignalContinuousDesc",
        "Fields that look like normal status/telemetry updates during operation.",
      ),
      label: t("settings.bambuLiveSignalContinuous", "Continuous telemetry"),
    };
  });
}

export function buildSettingsBambuLiveDiagnosticGroups({
  diagnosticFields,
  diagnosticFilter,
  diagnosticSort,
  t,
}: {
  diagnosticFields: DiagnosticCaptureSession["fields"];
  diagnosticFilter: DiagnosticFilterKey;
  diagnosticSort: DiagnosticSortKey;
  t: TranslateFn;
}) {
  const filteredDiagnosticFields = filterDiagnosticFields(diagnosticFields, diagnosticFilter);
  const sortedDiagnosticFields = sortDiagnosticFields(filteredDiagnosticFields, diagnosticSort);
  const diagnosticGroups: Array<DiagnosticFieldGroup & { label: string }> = groupDiagnosticFields(
    sortedDiagnosticFields,
  ).map((group) => ({
    ...group,
    label:
      group.key === "print"
        ? t("settings.bambuLiveGroupPrint", "Print & status")
        : group.key === "ams"
          ? t("settings.bambuLiveGroupAms", "AMS")
          : group.key === "tray"
            ? t("settings.bambuLiveGroupTray", "Tray & chip")
            : t("settings.bambuLiveGroupOther", "Other"),
  }));

  return {
    diagnosticGroups,
    sortedDiagnosticFields,
  };
}

export function buildSettingsBambuLiveDiagnosticsModel({
  diagnosticFilter,
  diagnosticSession,
  diagnosticSort,
  formatDateTime,
  liveConfig,
  selectedChartFieldPath,
  spoolRows,
  t,
}: BuildSettingsBambuLiveDiagnosticsModelInput) {
  const observedState = liveConfig?.observed_state ?? null;
  const diagnosticFields = diagnosticSession?.fields ?? [];
  const diagnosticChartFields = buildDiagnosticChartFieldOptions(diagnosticFields);
  const selectedDiagnosticChartField =
    diagnosticChartFields.find((option) => option.path === selectedChartFieldPath)?.path ??
    diagnosticChartFields[0]?.path ??
    null;
  const diagnosticChartPoints = buildDiagnosticChartPoints(
    diagnosticSession,
    selectedDiagnosticChartField,
  );
  const captureTraySnapshots = extractDiagnosticTraySnapshots(diagnosticFields);
  const captureTrayByKey = new Map(
    captureTraySnapshots.map((tray) => [
      diagnosticTraySnapshotKey(tray.amsIndex, tray.trayIndex),
      tray,
    ]),
  );
  const displayTrays = buildDiagnosticDisplayTrays(observedState?.trays ?? [], diagnosticFields);
  const captureSessionStartedAt = diagnosticSession?.startedAt ?? null;
  const captureSessionSeededAt = diagnosticSession?.seededFromObservedAt ?? null;
  const captureSessionLastSeenAt = latestDiagnosticCaptureSeenAt(
    diagnosticSession,
    diagnosticFields,
  );
  const changedFieldCount = countChangedDiagnosticFields(diagnosticFields);
  const identityFieldCount = countDiagnosticIdentitySignals(diagnosticFields);
  const amsReadInProgress = isDiagnosticAmsReadInProgress(diagnosticFields);
  const signalQualityBuckets = buildSettingsBambuLiveSignalQualityBuckets(diagnosticFields, t);
  const fallbackSummaryParts = buildSettingsBambuLiveFallbackSummaryParts(diagnosticFields, t);
  const observedSummaryParts = buildSettingsBambuLiveObservedSummaryParts(observedState, t);
  const { diagnosticGroups, sortedDiagnosticFields } = buildSettingsBambuLiveDiagnosticGroups({
    diagnosticFields,
    diagnosticFilter,
    diagnosticSort,
    t,
  });
  const reviewTrayCount = countReviewDiagnosticTrays(observedState?.trays ?? []);
  const diagnosticMetricCards = buildSettingsBambuLiveDiagnosticMetricCards({
    captureSessionLastSeenAt,
    captureSessionSeededAt,
    captureSessionStartedAt,
    changedFieldCount,
    formatDateTime,
    identityFieldCount,
    t,
  });
  const diagnosticTrayCards = buildSettingsBambuLiveDiagnosticTrayCards({
    amsReadInProgress,
    captureTrayByKey,
    displayTrays,
    spoolRows,
    t,
  });

  return {
    amsReadInProgress,
    diagnosticChartFields,
    diagnosticChartPoints,
    diagnosticFields,
    diagnosticGroups,
    diagnosticMetricCards,
    diagnosticTrayCards,
    fallbackSummaryParts,
    observedState,
    observedSummaryParts,
    reviewTrayCount,
    selectedDiagnosticChartField,
    signalQualityBuckets,
    sortedDiagnosticFields,
  };
}

export function createSettingsBambuLiveCaptureSession(
  liveConfig: BambuLiveIntegrationSettings | null,
): DiagnosticCaptureSession {
  return buildDiagnosticCaptureSession(liveConfig?.observed_state ?? null);
}

export type SettingsBambuLiveDiagnosticsModel = ReturnType<
  typeof buildSettingsBambuLiveDiagnosticsModel
>;

export type SettingsBambuLiveDiagnosticTrayCard = ReturnType<
  typeof buildSettingsBambuLiveDiagnosticsModel
>["diagnosticTrayCards"][number];

export type SettingsBambuLiveDiagnosticMetricCard = ReturnType<
  typeof buildSettingsBambuLiveDiagnosticsModel
>["diagnosticMetricCards"][number];

export type SettingsBambuLiveSignalQualityBucket = ReturnType<
  typeof buildSettingsBambuLiveDiagnosticsModel
>["signalQualityBuckets"][number];

export type SettingsBambuLiveDiagnosticGroup = ReturnType<
  typeof buildSettingsBambuLiveDiagnosticsModel
>["diagnosticGroups"][number];
