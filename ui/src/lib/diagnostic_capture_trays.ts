import type { BambuLiveObservedTray } from "./tauri_client";
import type { DiagnosticCaptureField, DiagnosticTraySnapshot } from "./diagnostic_capture";
import { formatBambuSettingsProfileSignal } from "./bambu_settings_profiles";
import {
  deriveAmsRemainingGrams,
  formatAmsWeightEstimate,
  saneAmsRemainingGrams,
  saneAmsRemainingPercent,
  saneAmsSpoolWeight,
} from "./ams_weight_estimate";
import { decodeTrayExistBitsSlotPresence } from "./inventory_rfid_payload";

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

export function diagnosticTraySnapshotKey(
  amsIndex: number | null | undefined,
  trayIndex: number,
): string {
  return `${amsIndex ?? "legacy"}:${trayIndex}`;
}

function parseDiagnosticNumber(value: string | null): number | null {
  if (value == null) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function trimDiagnosticFieldValue(field: DiagnosticCaptureField | null): string | null {
  const trimmed = field?.valueText.trim() ?? "";
  return trimmed || null;
}

function parseDiagnosticTrayId(value: string | null | undefined): number | null {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function addUniquePrefix(entry: { prefixes: string[] }, prefix: string) {
  if (!entry.prefixes.includes(prefix)) {
    entry.prefixes.push(prefix);
  }
}

export function extractDiagnosticTraySnapshots(
  fields: DiagnosticCaptureField[],
): DiagnosticTraySnapshot[] {
  const rawTrayIdByPrefix = new Map<string, number>();
  for (const field of fields) {
    const indexedIdMatch = field.path.match(/^(ams\.ams\[(\d+)\]\.tray\[(\d+)\])\.id$/);
    if (indexedIdMatch) {
      const trayId = parseDiagnosticTrayId(field.valueText);
      if (trayId != null) {
        rawTrayIdByPrefix.set(indexedIdMatch[1] ?? "", trayId);
      }
      continue;
    }
    const legacyIdMatch = field.path.match(/^(ams\.tray\[(\d+)\])\.id$/);
    if (legacyIdMatch) {
      const trayId = parseDiagnosticTrayId(field.valueText);
      if (trayId != null) {
        rawTrayIdByPrefix.set(legacyIdMatch[1] ?? "", trayId);
      }
    }
  }

  const coordinateByKey = new Map<
    string,
    {
      amsIndex: number | null;
      key: string;
      prefixes: string[];
      trayIndex: number;
    }
  >();
  for (const field of fields) {
    const indexedMatch = field.path.match(/^(ams\.ams\[(\d+)\]\.tray\[(\d+)\])\./);
    if (indexedMatch) {
      const prefix = indexedMatch[1] ?? "";
      const amsIndex = Number.parseInt(indexedMatch[2] ?? "", 10);
      const pathTrayIndex = Number.parseInt(indexedMatch[3] ?? "", 10);
      if (!Number.isFinite(amsIndex) || !Number.isFinite(pathTrayIndex)) {
        continue;
      }
      const trayIndex = rawTrayIdByPrefix.get(prefix) ?? pathTrayIndex;
      const key = diagnosticTraySnapshotKey(amsIndex, trayIndex);
      const entry =
        coordinateByKey.get(key) ??
        {
          amsIndex,
          key,
          prefixes: [],
          trayIndex,
        };
      addUniquePrefix(entry, prefix);
      coordinateByKey.set(key, entry);
      continue;
    }

    const legacyMatch = field.path.match(/^(ams\.tray\[(\d+)\])\./);
    if (legacyMatch) {
      const prefix = legacyMatch[1] ?? "";
      const pathTrayIndex = Number.parseInt(legacyMatch[2] ?? "", 10);
      if (!Number.isFinite(pathTrayIndex)) {
        continue;
      }
      const trayIndex = rawTrayIdByPrefix.get(prefix) ?? pathTrayIndex;
      const key = diagnosticTraySnapshotKey(null, trayIndex);
      const entry =
        coordinateByKey.get(key) ??
        {
          amsIndex: null,
          key,
          prefixes: [],
          trayIndex,
        };
      addUniquePrefix(entry, prefix);
      coordinateByKey.set(key, entry);
    }
  }

  const trayCoordinates = Array.from(coordinateByKey.values())
    .sort((left, right) => {
      const leftAms = left.amsIndex ?? -1;
      const rightAms = right.amsIndex ?? -1;
      return leftAms - rightAms || left.trayIndex - right.trayIndex;
    });

  return trayCoordinates.map(({ amsIndex, prefixes, trayIndex }) => {
    const fieldFor = (name: string) =>
      prefixes
        .map((prefix) => fields.find((field) => field.path === `${prefix}.${name}`))
        .find(Boolean) ?? null;
    const bitFieldFor = (name: string) => {
      const candidates =
        amsIndex == null
          ? [`ams.${name}`, `_bfm_ams_bits.${name}`]
          : [
              `ams.ams[${amsIndex}].${name}`,
              ...(amsIndex === 0 ? [`ams.${name}`] : []),
              ...(amsIndex === 0 ? [`_bfm_ams_bits.${name}`] : []),
            ];
      return candidates.map((path) => fields.find((field) => field.path === path)).find(Boolean) ?? null;
    };
    const filamentType = fieldFor("tray_type")?.valueText ?? null;
    const filamentName = fieldFor("tray_sub_brands")?.valueText ?? null;
    const colorRaw = fieldFor("tray_color")?.valueText ?? null;
    const trayWeightG = saneAmsSpoolWeight(
      parseDiagnosticNumber(fieldFor("tray_weight")?.valueText ?? null),
    );
    const remainingRaw = fieldFor("remain")?.valueText ?? null;
    const remainingPercent = saneAmsRemainingPercent(
      remainingRaw != null && Number.isFinite(Number.parseFloat(remainingRaw))
        ? Number.parseInt(remainingRaw, 10)
        : null,
    );
    const explicitRemainingGrams = saneAmsRemainingGrams(
      parseDiagnosticNumber(fieldFor("remaining_grams")?.valueText ?? null),
    );
    const remainingGrams =
      explicitRemainingGrams ??
      deriveAmsRemainingGrams(remainingPercent, trayWeightG);
    const trayExistBits = trimDiagnosticFieldValue(bitFieldFor("tray_exist_bits"));
    const trayReadDoneBits = trimDiagnosticFieldValue(bitFieldFor("tray_read_done_bits"));
    const trayIsBambuBits = trimDiagnosticFieldValue(bitFieldFor("tray_is_bbl_bits"));
    const slotIndex = trayIndex + 1;
    const trayPresentInAms = decodeTrayExistBitsSlotPresence(trayExistBits, slotIndex);
    const trayReadDone = decodeTrayExistBitsSlotPresence(trayReadDoneBits, slotIndex);
    const trayIsBambu = decodeTrayExistBitsSlotPresence(trayIsBambuBits, slotIndex);
    const lastSeenAt =
      [
        fieldFor("tray_type")?.lastSeenAt,
        fieldFor("tray_sub_brands")?.lastSeenAt,
        fieldFor("tray_color")?.lastSeenAt,
        fieldFor("tray_weight")?.lastSeenAt,
        fieldFor("remain")?.lastSeenAt,
        fieldFor("remaining_grams")?.lastSeenAt,
        fieldFor("tray_uuid")?.lastSeenAt,
        bitFieldFor("tray_exist_bits")?.lastSeenAt,
        bitFieldFor("tray_read_done_bits")?.lastSeenAt,
        bitFieldFor("tray_is_bbl_bits")?.lastSeenAt,
      ]
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;

    return {
      amsIndex,
      trayIndex,
      loaded: Boolean(
        (filamentType && filamentType.trim()) ||
          (filamentName && filamentName.trim()) ||
          trayPresentInAms === true ||
          (fieldFor("tray_uuid")?.valueText && !/^0+$/.test(fieldFor("tray_uuid")?.valueText ?? "")),
      ),
      filamentType,
      filamentName,
      colorHex: normalizeDiagnosticHexColor(colorRaw),
      trayWeightG,
      remainingPercent,
      remainingGrams,
      trayPresentInAms,
      trayReadDone,
      trayIsBambu,
      trayExistBits,
      trayReadDoneBits,
      trayIsBambuBits,
      tagUid: fieldFor("tag_uid")?.valueText ?? null,
      trayUuid: fieldFor("tray_uuid")?.valueText ?? null,
      trayInfoIdx: fieldFor("tray_info_idx")?.valueText ?? null,
      trayIdName: fieldFor("tray_id_name")?.valueText ?? null,
      nozzleTempMinC: parseDiagnosticNumber(fieldFor("nozzle_temp_min")?.valueText ?? null),
      nozzleTempMaxC: parseDiagnosticNumber(fieldFor("nozzle_temp_max")?.valueText ?? null),
      lastSeenAt,
    };
  });
}

function formatDiagnosticNozzleRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null && max == null) {
    return null;
  }
  if (min != null && max != null) {
    return `${min}-${max} C`;
  }
  if (min != null) {
    return `min ${min} C`;
  }
  return `max ${max} C`;
}

function formatDiagnosticTrayBitEvidence(tray: DiagnosticTraySnapshot): string | null {
  const parts = [
    tray.trayPresentInAms == null ? null : tray.trayPresentInAms ? "slot present" : "slot absent",
    tray.trayReadDone == null ? null : tray.trayReadDone ? "RFID read done" : "RFID read pending",
    tray.trayIsBambu == null ? null : tray.trayIsBambu ? "Bambu tag bit" : "no Bambu tag bit",
  ].filter(Boolean);
  return parts.length > 0 ? `AMS bits: ${parts.join(", ")}` : null;
}

export function buildDiagnosticDisplayTrays(
  observedTrays: BambuLiveObservedTray[],
  fields: DiagnosticCaptureField[],
): BambuLiveObservedTray[] {
  if (observedTrays.length > 0) {
    return observedTrays;
  }
  return extractDiagnosticTraySnapshots(fields).map((tray) => {
    const identityNote = [tray.tagUid, tray.trayUuid].filter(Boolean).join(" · ");
    const presetNote = formatBambuSettingsProfileSignal(tray.trayInfoIdx, tray.trayIdName);
    const nozzleRangeNote = formatDiagnosticNozzleRange(
      tray.nozzleTempMinC,
      tray.nozzleTempMaxC,
    );
    const bitEvidenceNote = formatDiagnosticTrayBitEvidence(tray);
    const amsEstimateNote = formatAmsWeightEstimate({
      remainingGrams: tray.remainingGrams,
      remainingPercent: tray.remainingPercent,
      trayWeightG: tray.trayWeightG,
    });

    return {
      ams_index: tray.amsIndex,
      tray_index: tray.trayIndex,
      loaded: tray.loaded,
      filament_type: tray.filamentType ?? null,
      filament_name: tray.filamentName ?? null,
      color_hex: tray.colorHex ?? null,
      tray_weight_g: tray.trayWeightG ?? null,
      remaining_percent: tray.remainingPercent ?? null,
      remaining_grams: tray.remainingGrams ?? null,
      match_status: null,
      match_note:
        [
          identityNote ? `RFID: ${identityNote}` : null,
          bitEvidenceNote,
          amsEstimateNote,
          presetNote ? `Settings preset: ${presetNote}` : null,
          nozzleRangeNote ? `Nozzle range: ${nozzleRangeNote}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
    };
  });
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
