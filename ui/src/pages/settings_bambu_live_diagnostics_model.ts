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
import type { BambuLiveIntegrationSettings } from "../lib/tauri_client";

type TranslateFn = (key: string, fallback: string) => string;
type FormatDateTimeFn = (value: string) => string;

type BuildSettingsBambuLiveDiagnosticsModelInput = {
  diagnosticFilter: DiagnosticFilterKey;
  diagnosticSession: DiagnosticCaptureSession | null;
  diagnosticSort: DiagnosticSortKey;
  formatDateTime: FormatDateTimeFn;
  liveConfig: BambuLiveIntegrationSettings | null;
  selectedChartFieldPath?: string | null;
  t: TranslateFn;
};

export function buildSettingsBambuLiveDiagnosticsModel({
  diagnosticFilter,
  diagnosticSession,
  diagnosticSort,
  formatDateTime,
  liveConfig,
  selectedChartFieldPath,
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
  const captureTrayByIndex = new Map(
    captureTraySnapshots.map((tray) => [tray.trayIndex, tray]),
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
  const signalQualityBuckets = buildDiagnosticSignalQualityBuckets(diagnosticFields).map((bucket) => {
    if (bucket.label === "Stable metadata") {
      return {
        ...bucket,
        description: t(
          "settings.bambuLiveSignalStableDesc",
          "Identity and tray metadata that appears stable when observed.",
        ),
        label: t("settings.bambuLiveSignalStable", "Stable metadata"),
      };
    }
    if (bucket.label === "Event-driven identity") {
      return {
        ...bucket,
        description: t(
          "settings.bambuLiveSignalEventDrivenDesc",
          "Fields that tend to appear or change around AMS read/sync events.",
        ),
        label: t("settings.bambuLiveSignalEventDriven", "Event-driven identity"),
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
  const fallbackSummary = buildDiagnosticFallbackSummary(diagnosticFields);
  const fallbackSummaryParts = [
    fallbackSummary.progressPercent != null ? `${fallbackSummary.progressPercent}%` : null,
    fallbackSummary.remainingMinutes != null ? `${fallbackSummary.remainingMinutes} min` : null,
    fallbackSummary.activeTrayIndex != null
      ? `${t("settings.bambuLiveSummaryTray", "Tray")} ${fallbackSummary.activeTrayIndex}`
      : null,
    fallbackSummary.amsHumidityIndex != null
      ? `${t("settings.bambuLiveSummaryAmsHumidity", "AMS humidity")} ${fallbackSummary.amsHumidityIndex}`
      : null,
  ].filter(Boolean);
  const observedSummaryParts = [
    observedState?.progress_percent != null ? `${observedState.progress_percent}%` : null,
    observedState?.remaining_minutes != null ? `${observedState.remaining_minutes} min` : null,
    observedState?.active_tray_index != null
      ? `${t("settings.bambuLiveSummaryTray", "Tray")} ${observedState.active_tray_index}`
      : null,
    observedState?.ams_humidity_index != null
      ? `${t("settings.bambuLiveSummaryAmsHumidity", "AMS humidity")} ${observedState.ams_humidity_index}`
      : null,
  ].filter(Boolean);
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
  const reviewTrayCount = countReviewDiagnosticTrays(observedState?.trays ?? []);
  const diagnosticMetricCards = [
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

  return {
    amsReadInProgress,
    captureSessionLastSeenAt,
    captureSessionSeededAt,
    captureSessionStartedAt,
    captureTrayByIndex,
    changedFieldCount,
    diagnosticChartFields,
    diagnosticChartPoints,
    diagnosticFields,
    diagnosticGroups,
    diagnosticMetricCards,
    displayTrays,
    fallbackSummaryParts,
    identityFieldCount,
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
