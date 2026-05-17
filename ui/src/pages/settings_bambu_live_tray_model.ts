import type { DiagnosticTraySnapshot } from "../lib/diagnostic_capture";
import { toSwatchColor } from "../lib/color_utils";
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
  captureTrayByIndex: Map<number, DiagnosticTraySnapshot>;
  displayTrays: BambuLiveObservedTray[];
  spoolRows: SpoolWithMasterRow[];
  t: TranslateFn;
};

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

export function buildSettingsBambuLiveObservedRfid(
  capturedTraySnapshot: DiagnosticTraySnapshot | null,
): string | null {
  const trayUuid = capturedTraySnapshot?.trayUuid?.trim() ?? "";
  return trayUuid && !/^0+$/.test(trayUuid) ? trayUuid : null;
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
      ? toSwatchColor(primaryInventoryMatch.master.hex_color)
      : toSwatchColor(tray.color_hex ?? capturedTraySnapshot?.colorHex),
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

export function buildSettingsBambuLiveTrayLabels({
  observedRfid,
  t,
  tray,
}: {
  observedRfid: string | null;
  t: TranslateFn;
  tray: BambuLiveObservedTray;
}) {
  return {
    key: `live-tray-${tray.tray_index}`,
    mqttTrayLabel: `${t("settings.bambuLiveMqttTrayLabel", "MQTT tray")} ${tray.tray_index}`,
    observedRfidLabel: observedRfid
      ? `${t("settings.bambuLiveObservedPrefix", "Observed")}: ${observedRfid}`
      : null,
    slotLabel: `${t("settings.bambuLiveSlotLabel", "Slot")} ${tray.tray_index + 1}`,
  };
}

export function resolveSettingsBambuLiveCapturedTraySnapshot({
  captureTrayByIndex,
  tray,
}: {
  captureTrayByIndex: Map<number, DiagnosticTraySnapshot>;
  tray: BambuLiveObservedTray;
}): DiagnosticTraySnapshot | null {
  return (
    captureTrayByIndex.get(tray.tray_index) ??
    (tray.tray_index > 0 ? captureTrayByIndex.get(tray.tray_index - 1) : null) ??
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
    observedRfidLabel,
    reviewTitle,
    slotLabel,
    statusText,
  };
}

export function buildSettingsBambuLiveDiagnosticTrayCards({
  amsReadInProgress,
  captureTrayByIndex,
  displayTrays,
  spoolRows,
  t,
}: BuildSettingsBambuLiveDiagnosticTrayCardsInput) {
  return displayTrays.map((tray) => {
    const capturedTraySnapshot = resolveSettingsBambuLiveCapturedTraySnapshot({
      captureTrayByIndex,
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
