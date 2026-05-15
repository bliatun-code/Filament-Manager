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
  type InventoryMatchResult,
} from "../lib/inventory_match";
import type {
  BambuLiveIntegrationSettings,
  BambuLiveObservedState,
  SpoolWithMasterRow,
} from "../lib/tauri_client";

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
  activeTrayIndex?: number | null;
  amsHumidityIndex?: number | null;
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
    parts.push(`${t("settings.bambuLiveSummaryTray", "Tray")} ${source.activeTrayIndex}`);
  }
  if (source.amsHumidityIndex != null) {
    parts.push(
      `${t("settings.bambuLiveSummaryAmsHumidity", "AMS humidity")} ${source.amsHumidityIndex}`,
    );
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
      amsHumidityIndex: observedState?.ams_humidity_index,
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

export function buildSettingsBambuLiveInventoryMatchDescription({
  inventoryMatchKind,
  observedRfid,
  t,
}: {
  inventoryMatchKind: InventoryMatchResult["kind"];
  observedRfid: string | null;
  t: TranslateFn;
}): string {
  if (inventoryMatchKind === "rfid_exact") {
    return t(
      "settings.bambuLiveInventoryRfidMatch",
      "Exact tray identity match against inventory.",
    );
  }
  if (inventoryMatchKind === "metadata_single") {
    return t(
      "settings.bambuLiveInventoryLikelyMatch",
      "Single likely inventory match from material/name/color.",
    );
  }
  if (inventoryMatchKind === "metadata_multiple") {
    return t(
      "settings.bambuLiveInventoryMultipleMatches",
      "Multiple inventory rolls could match this filament.",
    );
  }
  if (observedRfid) {
    return t(
      "settings.bambuLiveInventoryNoRfidMatch",
      "Observed tray identity did not match anything in inventory.",
    );
  }
  return t("settings.bambuLiveInventoryNoMatch", "No clear inventory match yet.");
}

export function buildSettingsBambuLiveInventoryCandidateCards({
  candidates,
  t,
}: {
  candidates: SpoolWithMasterRow[];
  t: TranslateFn;
}) {
  return candidates.slice(0, 3).map((candidate) => ({
    key: candidate.spool.id,
    subtitle: candidate.spool.rfid_tag?.trim()
      ? `${t("settings.bambuLiveCandidateRfidSaved", "RFID saved")} · ${candidate.spool.id}`
      : `${t("settings.bambuLiveCandidateNoRfidSaved", "No RFID saved")} · ${candidate.spool.id}`,
    swatchColor: toSwatchColor(candidate.master.hex_color),
    title: `${candidate.master.filament_name} · ${candidate.master.color_name}`,
  }));
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
    const matchDescription = buildSettingsBambuLiveInventoryMatchDescription({
      inventoryMatchKind: inventoryMatch.kind,
      observedRfid,
      t,
    });

    return {
      candidateCountText:
        inventoryMatch.kind === "metadata_multiple"
          ? `${inventoryMatch.candidates.length} ${t("settings.bambuLiveCandidateCount", "candidates")}`
          : null,
      candidates: buildSettingsBambuLiveInventoryCandidateCards({
        candidates: inventoryMatch.candidates,
        t,
      }),
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
