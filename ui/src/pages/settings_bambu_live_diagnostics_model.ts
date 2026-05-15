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
import { toSwatchColor } from "../lib/color_utils";
import {
  buildInventoryMatchResult,
  translateObservedMatchNote,
} from "../lib/inventory_match";
import type { BambuLiveIntegrationSettings, SpoolWithMasterRow } from "../lib/tauri_client";

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
  const diagnosticTrayCards = displayTrays.map((tray) => {
    const capturedTraySnapshot =
      captureTrayByIndex.get(tray.tray_index) ??
      (tray.tray_index > 0 ? captureTrayByIndex.get(tray.tray_index - 1) : null) ??
      null;
    const observedRfid =
      capturedTraySnapshot?.trayUuid?.trim() && !/^0+$/.test(capturedTraySnapshot.trayUuid.trim())
        ? capturedTraySnapshot.trayUuid.trim()
        : null;
    const inventoryMatch = buildInventoryMatchResult(spoolRows, {
      rfid: observedRfid,
      material: tray.filament_type ?? capturedTraySnapshot?.filamentType ?? null,
      filamentName: tray.filament_name ?? capturedTraySnapshot?.filamentName ?? null,
      colorHex: tray.color_hex ?? capturedTraySnapshot?.colorHex ?? null,
    });
    const primaryInventoryMatch = inventoryMatch.candidates[0] ?? null;
    const hasReview =
      !amsReadInProgress &&
      tray.match_status &&
      tray.match_status !== "clear_match" &&
      tray.match_status !== "unknown_from_printer";
    const matchDescription =
      inventoryMatch.kind === "rfid_exact"
        ? t(
            "settings.bambuLiveInventoryRfidMatch",
            "Exact tray identity match against inventory.",
          )
        : inventoryMatch.kind === "metadata_single"
          ? t(
              "settings.bambuLiveInventoryLikelyMatch",
              "Single likely inventory match from material/name/color.",
            )
          : inventoryMatch.kind === "metadata_multiple"
            ? t(
                "settings.bambuLiveInventoryMultipleMatches",
                "Multiple inventory rolls could match this filament.",
              )
            : observedRfid
              ? t(
                  "settings.bambuLiveInventoryNoRfidMatch",
                  "Observed tray identity did not match anything in inventory.",
                )
              : t("settings.bambuLiveInventoryNoMatch", "No clear inventory match yet.");

    return {
      candidateCountText:
        inventoryMatch.kind === "metadata_multiple"
          ? `${inventoryMatch.candidates.length} ${t("settings.bambuLiveCandidateCount", "candidates")}`
          : null,
      candidates: inventoryMatch.candidates.slice(0, 3).map((candidate) => ({
        key: candidate.spool.id,
        subtitle: candidate.spool.rfid_tag?.trim()
          ? `${t("settings.bambuLiveCandidateRfidSaved", "RFID saved")} · ${candidate.spool.id}`
          : `${t("settings.bambuLiveCandidateNoRfidSaved", "No RFID saved")} · ${candidate.spool.id}`,
        swatchColor: toSwatchColor(candidate.master.hex_color),
        title: `${candidate.master.filament_name} · ${candidate.master.color_name}`,
      })),
      detailText:
        [
          tray.filament_type,
          tray.remaining_percent != null ? `${tray.remaining_percent}%` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
      hasMoreCandidates: inventoryMatch.candidates.length > 3,
      hasReview: Boolean(hasReview),
      key: `live-tray-${tray.tray_index}`,
      matchDescription,
      matchKind: inventoryMatch.kind,
      matchLabel: primaryInventoryMatch
        ? `${primaryInventoryMatch.master.filament_name} · ${primaryInventoryMatch.master.color_name}`
        : t("settings.bambuLiveNoInventoryMatch", "No clear inventory match"),
      matchNote:
        tray.match_note && !amsReadInProgress
          ? translateObservedMatchNote(tray.match_note, (key, fallback) => t(key, fallback ?? ""))
          : null,
      matchSwatchColor: primaryInventoryMatch
        ? toSwatchColor(primaryInventoryMatch.master.hex_color)
        : toSwatchColor(tray.color_hex ?? capturedTraySnapshot?.colorHex),
      mqttTrayLabel: `${t("settings.bambuLiveMqttTrayLabel", "MQTT tray")} ${tray.tray_index}`,
      observedRfidLabel: observedRfid
        ? `${t("settings.bambuLiveObservedPrefix", "Observed")}: ${observedRfid}`
        : null,
      reviewTitle: tray.match_note ?? "",
      slotLabel: `${t("settings.bambuLiveSlotLabel", "Slot")} ${tray.tray_index + 1}`,
      statusText: tray.loaded
        ? tray.filament_name || tray.filament_type || t("settings.bambuLiveTrayLoaded", "Loaded")
        : t("settings.bambuLiveTrayEmptyUnknown", "Empty / unknown"),
    };
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

export type SettingsBambuLiveDiagnosticTrayCard = ReturnType<
  typeof buildSettingsBambuLiveDiagnosticsModel
>["diagnosticTrayCards"][number];
