import {
  diagnosticTraySnapshotKey,
  type DiagnosticTraySnapshot,
} from "../lib/diagnostic_capture";
import {
  buildInventoryMatchResult,
  translateObservedMatchNote,
  type InventoryMatchResult,
} from "../lib/inventory_match";
import type {
  BambuLiveObservedTray,
  SpoolWithMasterRow,
} from "../lib/tauri_client";

type TranslateFn = (key: string, fallback: string) => string;

type BuildSettingsBambuLiveDiagnosticTrayCardInput = {
  amsReadInProgress: boolean;
  capturedTraySnapshot: DiagnosticTraySnapshot | null;
  spoolRows: SpoolWithMasterRow[];
  t: TranslateFn;
  tray: BambuLiveObservedTray;
};

type BuildSettingsBambuLiveDiagnosticTrayCardsInput = {
  amsReadInProgress: boolean;
  captureTrayByKey: Map<string, DiagnosticTraySnapshot>;
  displayTrays: BambuLiveObservedTray[];
  spoolRows: SpoolWithMasterRow[];
  t: TranslateFn;
};

const BAMBU_LIVE_SECONDARY_EXTERNAL_TRAY_INDEX = 254;
const BAMBU_LIVE_EXTERNAL_TRAY_INDEX = 255;

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
    swatchColor: candidate.master.hex_color,
    title: `${candidate.master.filament_name} · ${candidate.master.color_name}`,
  }));
}

export function buildSettingsBambuLiveObservedRfid(
  capturedTraySnapshot: DiagnosticTraySnapshot | null,
): string | null {
  const trayUuid = capturedTraySnapshot?.trayUuid?.trim() ?? "";
  return trayUuid && !/^0+$/.test(trayUuid) ? trayUuid : null;
}

export type SettingsBambuLivePresetNameParts = {
  filamentProfile: string;
  nozzleDiameterMm: string | null;
  printerProfile: string | null;
  rawName: string;
};

export function parseSettingsBambuLivePresetName(
  rawName: string | null | undefined,
): SettingsBambuLivePresetNameParts | null {
  const normalized = rawName?.trim() ?? "";
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/^(.+?)\s+@BBL\s+(.+?)(?:\s+(\d+(?:\.\d+)?)\s+nozzle)?$/i);
  if (!match) {
    return {
      filamentProfile: normalized,
      nozzleDiameterMm: null,
      printerProfile: null,
      rawName: normalized,
    };
  }
  return {
    filamentProfile: (match[1] ?? "").trim(),
    nozzleDiameterMm: match[3]?.trim() || null,
    printerProfile: (match[2] ?? "").trim() || null,
    rawName: normalized,
  };
}

function formatSettingsBambuLivePresetNameParts(
  rawName: string,
  t: TranslateFn,
): string[] {
  const parsed = parseSettingsBambuLivePresetName(rawName);
  if (!parsed) {
    return [];
  }
  return [
    parsed.filamentProfile,
    parsed.printerProfile,
    parsed.nozzleDiameterMm
      ? `${parsed.nozzleDiameterMm} ${t("settings.bambuLivePresetNozzleSuffix", "mm nozzle")}`
      : null,
  ].filter((value): value is string => Boolean(value));
}

export function buildSettingsBambuLivePresetSignalLabel({
  capturedTraySnapshot,
  t,
  tray,
}: {
  capturedTraySnapshot: DiagnosticTraySnapshot | null;
  t: TranslateFn;
  tray: BambuLiveObservedTray;
}): string | null {
  const trayInfoIdx =
    tray.tray_info_idx?.trim() || capturedTraySnapshot?.trayInfoIdx?.trim() || "";
  const trayIdName =
    tray.tray_id_name?.trim() || capturedTraySnapshot?.trayIdName?.trim() || "";
  const presetParts = [
    trayInfoIdx,
    ...(trayIdName ? formatSettingsBambuLivePresetNameParts(trayIdName, t) : []),
  ].filter(Boolean);
  if (presetParts.length === 0) {
    return null;
  }
  return `${t("settings.bambuLivePresetSignal", "Filament settings preset")}: ${presetParts.join(" · ")}`;
}

function formatNozzleTemperature(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function buildSettingsBambuLiveNozzleRangeLabel({
  capturedTraySnapshot,
  t,
}: {
  capturedTraySnapshot: DiagnosticTraySnapshot | null;
  t: TranslateFn;
}): string | null {
  const min = capturedTraySnapshot?.nozzleTempMinC;
  const max = capturedTraySnapshot?.nozzleTempMaxC;
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  if (!hasMin && !hasMax) {
    return null;
  }

  const label = t("settings.bambuLiveNozzleRange", "Nozzle range");
  if (hasMin && hasMax) {
    return `${label}: ${formatNozzleTemperature(min)}-${formatNozzleTemperature(max)} C`;
  }
  if (hasMin) {
    return `${label}: min ${formatNozzleTemperature(min)} C`;
  }
  if (hasMax && max != null) {
    return `${label}: max ${formatNozzleTemperature(max)} C`;
  }
  return null;
}

export function buildSettingsBambuLiveTrayDisplayText({
  t,
  tray,
}: {
  t: TranslateFn;
  tray: BambuLiveObservedTray;
}) {
  return {
    detailText:
      [
        tray.filament_type,
        tray.remaining_percent != null ? `${tray.remaining_percent}%` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    statusText: tray.loaded
      ? tray.filament_name || tray.filament_type || t("settings.bambuLiveTrayLoaded", "Loaded")
      : t("settings.bambuLiveTrayEmptyUnknown", "Empty / unknown"),
  };
}

export function buildSettingsBambuLiveInventoryMatchPresentation({
  capturedTraySnapshot,
  primaryInventoryMatch,
  t,
  tray,
}: {
  capturedTraySnapshot: DiagnosticTraySnapshot | null;
  primaryInventoryMatch: SpoolWithMasterRow | null;
  t: TranslateFn;
  tray: BambuLiveObservedTray;
}) {
  return {
    matchLabel: primaryInventoryMatch
      ? `${primaryInventoryMatch.master.filament_name} · ${primaryInventoryMatch.master.color_name}`
      : t("settings.bambuLiveNoInventoryMatch", "No clear inventory match"),
    matchSwatchColor: primaryInventoryMatch
      ? primaryInventoryMatch.master.hex_color
      : tray.color_hex ?? capturedTraySnapshot?.colorHex,
  };
}

export function buildSettingsBambuLiveTrayReviewState({
  amsReadInProgress,
  t,
  tray,
}: {
  amsReadInProgress: boolean;
  t: TranslateFn;
  tray: BambuLiveObservedTray;
}) {
  const hasReview =
    !amsReadInProgress &&
    tray.match_status &&
    tray.match_status !== "clear_match" &&
    tray.match_status !== "unknown_from_printer";

  return {
    hasReview: Boolean(hasReview),
    matchNote:
      tray.match_note && !amsReadInProgress
        ? translateObservedMatchNote(tray.match_note, (key, fallback) => t(key, fallback ?? ""))
        : null,
    reviewTitle: tray.match_note ?? "",
  };
}

export function formatSettingsBambuLiveMqttTrayIndexLabel(
  trayIndex: number,
  t: TranslateFn,
): string {
  if (trayIndex === BAMBU_LIVE_EXTERNAL_TRAY_INDEX) {
    return t("settings.bambuLiveMqttExternalTrayLabel", "MQTT external tray");
  }
  if (trayIndex === BAMBU_LIVE_SECONDARY_EXTERNAL_TRAY_INDEX) {
    return t(
      "settings.bambuLiveMqttSecondaryExternalTrayLabel",
      "MQTT secondary external tray",
    );
  }
  return `${t("settings.bambuLiveMqttTrayLabel", "MQTT tray")} ${trayIndex}`;
}

export function formatSettingsBambuLiveSlotIndexLabel(
  trayIndex: number,
  t: TranslateFn,
): string {
  if (trayIndex === BAMBU_LIVE_EXTERNAL_TRAY_INDEX) {
    return t("settings.bambuLiveExternalSlotLabel", "External slot");
  }
  if (trayIndex === BAMBU_LIVE_SECONDARY_EXTERNAL_TRAY_INDEX) {
    return t("settings.bambuLiveSecondaryExternalSlotLabel", "Secondary external slot");
  }
  return `${t("settings.bambuLiveSlotLabel", "Slot")} ${trayIndex + 1}`;
}

export function formatSettingsBambuLiveSummaryTrayIndexLabel(
  trayIndex: number,
  t: TranslateFn,
  amsIndex?: number | null,
): string {
  if (trayIndex === BAMBU_LIVE_EXTERNAL_TRAY_INDEX) {
    return t("settings.bambuLiveSummaryExternalTray", "External tray");
  }
  if (trayIndex === BAMBU_LIVE_SECONDARY_EXTERNAL_TRAY_INDEX) {
    return t("settings.bambuLiveSummarySecondaryExternalTray", "Secondary external tray");
  }
  if (typeof amsIndex === "number") {
    return `${t("settings.bambuLiveAmsLabel", "AMS")} ${amsIndex + 1} · ${formatSettingsBambuLiveSlotIndexLabel(
      trayIndex,
      t,
    )}`;
  }
  return `${t("settings.bambuLiveSummaryTray", "Tray")} ${trayIndex}`;
}

export function buildSettingsBambuLiveTrayLabels({
  observedRfid,
  t,
  tray,
}: {
  observedRfid: string | null;
  t: TranslateFn;
  tray: BambuLiveObservedTray;
}) {
  const trayKeyPrefix = typeof tray.ams_index === "number" ? `ams-${tray.ams_index}` : "legacy";
  return {
    key: `live-tray-${trayKeyPrefix}-${tray.tray_index}`,
    mqttTrayLabel: formatSettingsBambuLiveMqttTrayIndexLabel(tray.tray_index, t),
    observedRfidLabel: observedRfid
      ? `${t("settings.bambuLiveObservedPrefix", "Observed")}: ${observedRfid}`
      : null,
    slotLabel:
      typeof tray.ams_index === "number"
        ? `${t("settings.bambuLiveAmsLabel", "AMS")} ${tray.ams_index + 1} · ${formatSettingsBambuLiveSlotIndexLabel(
            tray.tray_index,
            t,
          )}`
        : formatSettingsBambuLiveSlotIndexLabel(tray.tray_index, t),
  };
}

export function resolveSettingsBambuLiveCapturedTraySnapshot({
  captureTrayByKey,
  tray,
}: {
  captureTrayByKey: Map<string, DiagnosticTraySnapshot>;
  tray: BambuLiveObservedTray;
}): DiagnosticTraySnapshot | null {
  const exactKey = diagnosticTraySnapshotKey(tray.ams_index, tray.tray_index);
  const sameAmsPreviousKey =
    tray.tray_index > 0 ? diagnosticTraySnapshotKey(tray.ams_index, tray.tray_index - 1) : null;
  const firstAmsKey =
    tray.ams_index == null ? diagnosticTraySnapshotKey(0, tray.tray_index) : null;
  const firstAmsPreviousKey =
    tray.ams_index == null && tray.tray_index > 0
      ? diagnosticTraySnapshotKey(0, tray.tray_index - 1)
      : null;
  const legacyKey = diagnosticTraySnapshotKey(null, tray.tray_index);
  const legacyPreviousKey =
    tray.tray_index > 0 ? diagnosticTraySnapshotKey(null, tray.tray_index - 1) : null;
  return (
    captureTrayByKey.get(exactKey) ??
    (sameAmsPreviousKey ? captureTrayByKey.get(sameAmsPreviousKey) : null) ??
    (firstAmsKey ? captureTrayByKey.get(firstAmsKey) : null) ??
    (firstAmsPreviousKey ? captureTrayByKey.get(firstAmsPreviousKey) : null) ??
    captureTrayByKey.get(legacyKey) ??
    (legacyPreviousKey ? captureTrayByKey.get(legacyPreviousKey) : null) ??
    null
  );
}

export function buildSettingsBambuLiveDiagnosticTrayCard({
  amsReadInProgress,
  capturedTraySnapshot,
  spoolRows,
  t,
  tray,
}: BuildSettingsBambuLiveDiagnosticTrayCardInput) {
  const observedRfid = buildSettingsBambuLiveObservedRfid(capturedTraySnapshot);
  const inventoryMatch = buildInventoryMatchResult(spoolRows, {
    rfid: observedRfid,
    material: tray.filament_type ?? capturedTraySnapshot?.filamentType ?? null,
    filamentName: tray.filament_name ?? capturedTraySnapshot?.filamentName ?? null,
    colorHex: tray.color_hex ?? capturedTraySnapshot?.colorHex ?? null,
  });
  const primaryInventoryMatch = inventoryMatch.candidates[0] ?? null;
  const matchDescription = buildSettingsBambuLiveInventoryMatchDescription({
    inventoryMatchKind: inventoryMatch.kind,
    observedRfid,
    t,
  });
  const presetSignalLabel = buildSettingsBambuLivePresetSignalLabel({
    capturedTraySnapshot,
    t,
    tray,
  });
  const nozzleRangeLabel = buildSettingsBambuLiveNozzleRangeLabel({
    capturedTraySnapshot,
    t,
  });
  const { detailText, statusText } = buildSettingsBambuLiveTrayDisplayText({ t, tray });
  const { matchLabel, matchSwatchColor } = buildSettingsBambuLiveInventoryMatchPresentation({
    capturedTraySnapshot,
    primaryInventoryMatch,
    t,
    tray,
  });
  const { hasReview, matchNote, reviewTitle } = buildSettingsBambuLiveTrayReviewState({
    amsReadInProgress,
    t,
    tray,
  });
  const { key, mqttTrayLabel, observedRfidLabel, slotLabel } = buildSettingsBambuLiveTrayLabels({
    observedRfid,
    t,
    tray,
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
    detailText,
    hasMoreCandidates: inventoryMatch.candidates.length > 3,
    hasReview,
    key,
    matchDescription,
    matchKind: inventoryMatch.kind,
    matchLabel,
    matchNote,
    matchSwatchColor,
    mqttTrayLabel,
    nozzleRangeLabel,
    observedRfidLabel,
    presetSignalLabel,
    reviewTitle,
    slotLabel,
    statusText,
  };
}

export function buildSettingsBambuLiveDiagnosticTrayCards({
  amsReadInProgress,
  captureTrayByKey,
  displayTrays,
  spoolRows,
  t,
}: BuildSettingsBambuLiveDiagnosticTrayCardsInput) {
  return displayTrays.map((tray) => {
    const capturedTraySnapshot = resolveSettingsBambuLiveCapturedTraySnapshot({
      captureTrayByKey,
      tray,
    });
    return buildSettingsBambuLiveDiagnosticTrayCard({
      amsReadInProgress,
      capturedTraySnapshot,
      spoolRows,
      t,
      tray,
    });
  });
}
