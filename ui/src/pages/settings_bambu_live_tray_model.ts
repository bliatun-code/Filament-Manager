import {
  diagnosticTraySnapshotKey,
  type DiagnosticTraySnapshot,
} from "../lib/diagnostic_capture";
import {
  buildBambuUnknownRfidInventoryDecision,
  translateObservedMatchNote,
  type InventoryMatchResult,
} from "../lib/inventory_match";
import {
  buildBambuLiveCatalogMatchResult,
  type BambuLiveCatalogMatchResult,
} from "../lib/bambu_live_catalog_match";
import { buildBambuLiveObservedInventoryMatchInput } from "../lib/bambu_live_observed_match";
import { liveTrayMatchesSlot } from "../lib/printer_live_display";
import {
  formatBambuSettingsProfileSignal,
  parseBambuSettingsProfileName,
  type BambuSettingsProfileNameParts,
} from "../lib/bambu_settings_profiles";
import { saneNozzleSettingTemp } from "../lib/bambu_nozzle_settings";
import {
  deriveAmsRemainingGrams,
  formatAmsWeightEstimate,
  saneAmsRemainingGrams,
  saneAmsRemainingPercent,
  saneAmsSpoolWeight,
} from "../lib/ams_weight_estimate";
import type {
  BambuLiveObservedTray,
  MasterCatalogRow,
  PrinterAmsSlotRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";

type TranslateFn = (key: string, fallback: string) => string;

type BuildSettingsBambuLiveDiagnosticTrayCardInput = {
  amsReadInProgress: boolean;
  catalogRows?: MasterCatalogRow[];
  capturedTraySnapshot: DiagnosticTraySnapshot | null;
  printerSlots?: PrinterAmsSlotRow[];
  spoolRows: SpoolWithMasterRow[];
  t: TranslateFn;
  tray: BambuLiveObservedTray;
};

type BuildSettingsBambuLiveDiagnosticTrayCardsInput = {
  amsReadInProgress: boolean;
  catalogRows?: MasterCatalogRow[];
  captureTrayByKey: Map<string, DiagnosticTraySnapshot>;
  displayTrays: BambuLiveObservedTray[];
  printerSlots?: PrinterAmsSlotRow[];
  spoolRows: SpoolWithMasterRow[];
  t: TranslateFn;
};

const BAMBU_LIVE_SECONDARY_EXTERNAL_TRAY_INDEX = 254;
const BAMBU_LIVE_EXTERNAL_TRAY_INDEX = 255;

type SettingsBambuLiveDiagnosticMatchKind =
  | InventoryMatchResult["kind"]
  | BambuLiveCatalogMatchResult["kind"];

export function buildSettingsBambuLiveInventoryMatchDescription({
  matchKind,
  observedRfid,
  t,
}: {
  matchKind: SettingsBambuLiveDiagnosticMatchKind;
  observedRfid: string | null;
  t: TranslateFn;
}): string {
  if (matchKind === "rfid_exact") {
    return t(
      "settings.bambuLiveInventoryRfidMatch",
      "Exact RFID/AMS identity match against inventory.",
    );
  }
  if (matchKind === "metadata_single") {
    return t(
      "settings.bambuLiveInventoryLikelyMatch",
      "Single likely inventory match from material and live color.",
    );
  }
  if (matchKind === "metadata_multiple") {
    return t(
      "settings.bambuLiveInventoryMultipleMatches",
      "Multiple inventory rolls could match this filament.",
    );
  }
  if (matchKind === "catalog_single") {
    return t(
      "settings.bambuLiveCatalogLikelyMatch",
      "Single likely Bambu catalog match from material and live color.",
    );
  }
  if (matchKind === "catalog_multiple") {
    return t(
      "settings.bambuLiveCatalogMultipleMatches",
      "Multiple Bambu catalog entries could match this filament.",
    );
  }
  if (observedRfid) {
    return t(
      "settings.bambuLiveInventoryNoRfidMatch",
      "Observed RFID/AMS identity did not match anything in inventory.",
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
  return candidates.slice(0, 3).map((candidate) => {
    const rfidLabel = candidate.spool.rfid_tag?.trim()
      ? t("settings.bambuLiveCandidateRfidSaved", "RFID saved")
      : t("settings.bambuLiveCandidateNoRfidSaved", "No RFID saved");
    const ownershipType = (candidate.spool.ownership_type ?? "").trim().toUpperCase();
    const ownerName = candidate.spool.owner_name?.trim();
    const ownershipLabel =
      ownershipType === "BORROWED_IN"
        ? ownerName
          ? `${t("inventory.borrowedIn", "Borrowed in")} · ${ownerName}`
          : t("inventory.borrowedIn", "Borrowed in")
        : null;

    return {
      key: candidate.spool.id,
      subtitle: [rfidLabel, ownershipLabel, candidate.spool.id].filter(Boolean).join(" · "),
      swatchColor: candidate.master.hex_color,
      title: `${candidate.master.filament_name} · ${candidate.master.color_name}`,
    };
  });
}

export function buildSettingsBambuLiveCatalogCandidateCards({
  candidates,
  t,
}: {
  candidates: MasterCatalogRow[];
  t: TranslateFn;
}) {
  return candidates.slice(0, 3).map((candidate) => ({
    key: candidate.id,
    subtitle: candidate.is_discontinued
      ? `${t("common.discontinued", "Discontinued")} · ${candidate.id}`
      : `${t("settings.bambuLiveCatalogCandidate", "Bambu catalog")} · ${candidate.id}`,
    swatchColor: candidate.hex_color,
    title: `${candidate.filament_name} · ${candidate.color_name}`,
  }));
}

export function buildSettingsBambuLiveObservedRfid(
  capturedTraySnapshot: DiagnosticTraySnapshot | null,
  tray?: Pick<BambuLiveObservedTray, "observed_rfid_tag" | "tray_uuid"> | null,
): string | null {
  const candidates = [
    tray?.tray_uuid,
    tray?.observed_rfid_tag,
    capturedTraySnapshot?.trayUuid,
    capturedTraySnapshot?.tagUid,
  ];
  for (const candidate of candidates) {
    const observedRfid = candidate?.trim() ?? "";
    if (observedRfid && !/^0+$/.test(observedRfid)) {
      return observedRfid;
    }
  }
  return null;
}

export type SettingsBambuLivePresetNameParts = BambuSettingsProfileNameParts;

export const parseSettingsBambuLivePresetName = parseBambuSettingsProfileName;

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
  const presetSignal = formatBambuSettingsProfileSignal(trayInfoIdx, trayIdName, {
    nozzleSuffix: t("settings.bambuLivePresetNozzleSuffix", "mm nozzle"),
  });
  if (!presetSignal) {
    return null;
  }
  return `${t("settings.bambuLivePresetSignal", "Filament settings preset")}: ${presetSignal}`;
}

function formatNozzleTemperature(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function buildSettingsBambuLiveAmsWeightLabel({
  capturedTraySnapshot,
  t,
  tray,
}: {
  capturedTraySnapshot: DiagnosticTraySnapshot | null;
  t: TranslateFn;
  tray: BambuLiveObservedTray;
}): string | null {
  const liveTrayWeightG = saneAmsSpoolWeight(tray.tray_weight_g);
  const capturedTrayWeightG = saneAmsSpoolWeight(capturedTraySnapshot?.trayWeightG);
  const liveRemainingPercent = saneAmsRemainingPercent(tray.remaining_percent);
  const capturedRemainingPercent = saneAmsRemainingPercent(
    capturedTraySnapshot?.remainingPercent,
  );
  const liveRemainingGrams = saneAmsRemainingGrams(tray.remaining_grams);
  const capturedRemainingGrams = saneAmsRemainingGrams(capturedTraySnapshot?.remainingGrams);

  const remainingGrams = liveRemainingGrams ?? capturedRemainingGrams;
  const trayWeightG =
    remainingGrams === liveRemainingGrams
      ? liveTrayWeightG ?? capturedTrayWeightG
      : capturedTrayWeightG ?? liveTrayWeightG;
  const remainingPercent =
    remainingGrams === liveRemainingGrams
      ? liveRemainingPercent ?? capturedRemainingPercent
      : capturedRemainingPercent ?? liveRemainingPercent;
  const derivedRemainingGrams =
    remainingGrams ?? deriveAmsRemainingGrams(remainingPercent, trayWeightG);

  return formatAmsWeightEstimate({
    basisLabel: t("settings.bambuLiveAmsWeightBasis", "AMS spool basis"),
    estimateLabel: t("settings.bambuLiveAmsWeightEstimate", "AMS estimate"),
    remainingGrams: derivedRemainingGrams,
    remainingPercent,
    trayWeightG,
  });
}

export function buildSettingsBambuLiveNozzleRangeLabel({
  capturedTraySnapshot,
  t,
  tray,
}: {
  capturedTraySnapshot: DiagnosticTraySnapshot | null;
  t: TranslateFn;
  tray?: Pick<BambuLiveObservedTray, "nozzle_temp_max_c" | "nozzle_temp_min_c"> | null;
}): string | null {
  const min = saneNozzleSettingTemp(tray?.nozzle_temp_min_c) ??
    saneNozzleSettingTemp(capturedTraySnapshot?.nozzleTempMinC);
  const max = saneNozzleSettingTemp(tray?.nozzle_temp_max_c) ??
    saneNozzleSettingTemp(capturedTraySnapshot?.nozzleTempMaxC);
  const hasMin = min != null;
  const hasMax = max != null;
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
  const remainingPercent = saneAmsRemainingPercent(tray.remaining_percent);
  return {
    detailText:
      [
        tray.filament_type,
        remainingPercent != null ? `${remainingPercent}%` : null,
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
  primaryCatalogMatch,
  primaryInventoryMatch,
  t,
  tray,
}: {
  capturedTraySnapshot: DiagnosticTraySnapshot | null;
  primaryCatalogMatch?: MasterCatalogRow | null;
  primaryInventoryMatch: SpoolWithMasterRow | null;
  t: TranslateFn;
  tray: BambuLiveObservedTray;
}) {
  return {
    matchLabel: primaryInventoryMatch
      ? `${primaryInventoryMatch.master.filament_name} · ${primaryInventoryMatch.master.color_name}`
      : primaryCatalogMatch
        ? `${primaryCatalogMatch.filament_name} · ${primaryCatalogMatch.color_name}`
      : t("settings.bambuLiveNoInventoryMatch", "No clear inventory match"),
    matchSwatchColor: primaryInventoryMatch
      ? primaryInventoryMatch.master.hex_color
      : primaryCatalogMatch
        ? primaryCatalogMatch.hex_color
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
      ? `${t("settings.bambuLiveObservedRfidIdentity", "Observed RFID/AMS identity")}: ${observedRfid}`
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
  catalogRows = [],
  capturedTraySnapshot,
  printerSlots = [],
  spoolRows,
  t,
  tray,
}: BuildSettingsBambuLiveDiagnosticTrayCardInput) {
  const observedRfid = buildSettingsBambuLiveObservedRfid(capturedTraySnapshot, tray);
  const preferredSlot = printerSlots.find((slot) => liveTrayMatchesSlot(slot, tray));
  const observedMatchInput =
    buildBambuLiveObservedInventoryMatchInput(tray, {
      rfid: observedRfid,
      material: capturedTraySnapshot?.filamentType ?? null,
      filamentName: capturedTraySnapshot?.filamentName ?? null,
      colorHex: capturedTraySnapshot?.colorHex ?? null,
    }) ?? {
      rfid: observedRfid,
      material: null,
      filamentName: null,
      colorHex: null,
    };
  const inventoryDecision = buildBambuUnknownRfidInventoryDecision(spoolRows, observedMatchInput, {
    enableMetadataCandidates: Boolean(observedRfid),
    preferredSpoolId: preferredSlot?.spool_id ?? null,
  });
  const inventoryMatch = inventoryDecision.suggestedInventoryMatch;
  const primaryInventoryMatch = inventoryMatch.candidates[0] ?? null;
  const catalogTray: BambuLiveObservedTray = {
    ...tray,
    color_hex: tray.color_hex ?? capturedTraySnapshot?.colorHex ?? null,
    filament_name: tray.filament_name ?? capturedTraySnapshot?.filamentName ?? null,
    filament_type: tray.filament_type ?? capturedTraySnapshot?.filamentType ?? null,
  };
  const catalogMatch =
    observedRfid && inventoryMatch.candidates.length === 0
      ? buildBambuLiveCatalogMatchResult(catalogRows, catalogTray)
      : { kind: "none" as const, candidates: [] };
  const primaryCatalogMatch = catalogMatch.candidates[0] ?? null;
  const activeMatchKind =
    inventoryMatch.kind !== "none" ? inventoryMatch.kind : catalogMatch.kind;
  const matchDescription = buildSettingsBambuLiveInventoryMatchDescription({
    matchKind: activeMatchKind,
    observedRfid,
    t,
  });
  const presetSignalLabel = buildSettingsBambuLivePresetSignalLabel({
    capturedTraySnapshot,
    t,
    tray,
  });
  const amsWeightLabel = buildSettingsBambuLiveAmsWeightLabel({
    capturedTraySnapshot,
    t,
    tray,
  });
  const nozzleRangeLabel = buildSettingsBambuLiveNozzleRangeLabel({
    capturedTraySnapshot,
    t,
    tray,
  });
  const { detailText, statusText } = buildSettingsBambuLiveTrayDisplayText({ t, tray });
  const { matchLabel, matchSwatchColor } = buildSettingsBambuLiveInventoryMatchPresentation({
    capturedTraySnapshot,
    primaryCatalogMatch,
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
        : catalogMatch.kind === "catalog_multiple"
          ? `${catalogMatch.candidates.length} ${t("settings.bambuLiveCatalogCandidateCount", "catalog entries")}`
        : null,
    candidates:
      inventoryMatch.kind !== "none"
        ? buildSettingsBambuLiveInventoryCandidateCards({
            candidates: inventoryMatch.candidates,
            t,
          })
        : buildSettingsBambuLiveCatalogCandidateCards({
            candidates: catalogMatch.candidates,
            t,
          }),
    detailText,
    hasMoreCandidates:
      inventoryMatch.kind !== "none"
        ? inventoryMatch.candidates.length > 3
        : catalogMatch.candidates.length > 3,
    hasReview,
    key,
    matchDescription,
    matchKind: activeMatchKind,
    showCandidateCards:
      inventoryMatch.kind === "metadata_single" ||
      inventoryMatch.kind === "metadata_multiple" ||
      catalogMatch.kind === "catalog_single" ||
      catalogMatch.kind === "catalog_multiple",
    matchLabel,
    matchNote,
    matchSwatchColor,
    amsWeightLabel,
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
  catalogRows = [],
  captureTrayByKey,
  displayTrays,
  printerSlots,
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
      catalogRows,
      capturedTraySnapshot,
      printerSlots,
      spoolRows,
      t,
      tray,
    });
  });
}
