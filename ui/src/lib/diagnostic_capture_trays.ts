import type { BambuLiveObservedTray } from "./tauri_client";
import type { DiagnosticCaptureField, DiagnosticTraySnapshot } from "./diagnostic_capture";
import { formatBambuSettingsProfileSignal } from "./bambu_settings_profiles";

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

export function extractDiagnosticTraySnapshots(
  fields: DiagnosticCaptureField[],
): DiagnosticTraySnapshot[] {
  const trayCoordinates = Array.from(
    new Set(
      fields
        .map((field) => {
          const indexedMatch = field.path.match(/ams\.ams\[(\d+)\]\.tray\[(\d+)\]\./);
          if (indexedMatch) {
            const amsIndex = Number.parseInt(indexedMatch[1] ?? "", 10);
            const trayIndex = Number.parseInt(indexedMatch[2] ?? "", 10);
            return Number.isFinite(amsIndex) && Number.isFinite(trayIndex)
              ? diagnosticTraySnapshotKey(amsIndex, trayIndex)
              : null;
          }
          const legacyMatch = field.path.match(/ams\.tray\[(\d+)\]\./);
          if (legacyMatch) {
            const trayIndex = Number.parseInt(legacyMatch[1] ?? "", 10);
            return Number.isFinite(trayIndex)
              ? diagnosticTraySnapshotKey(null, trayIndex)
              : null;
          }
          return null;
        })
        .filter((value): value is string => value != null),
    ),
  )
    .map((key) => {
      const [amsPart, trayPart] = key.split(":");
      const trayIndex = Number.parseInt(trayPart ?? "", 10);
      const amsIndex = amsPart === "legacy" ? null : Number.parseInt(amsPart ?? "", 10);
      return { amsIndex, key, trayIndex };
    })
    .sort((left, right) => {
      const leftAms = left.amsIndex ?? -1;
      const rightAms = right.amsIndex ?? -1;
      return leftAms - rightAms || left.trayIndex - right.trayIndex;
    });

  return trayCoordinates.map(({ amsIndex, trayIndex }) => {
    const prefix =
      amsIndex == null ? `ams.tray[${trayIndex}]` : `ams.ams[${amsIndex}].tray[${trayIndex}]`;
    const fieldFor = (name: string) =>
      fields.find((field) => field.path === `${prefix}.${name}`) ?? null;
    const filamentType = fieldFor("tray_type")?.valueText ?? null;
    const filamentName = fieldFor("tray_sub_brands")?.valueText ?? null;
    const colorRaw = fieldFor("tray_color")?.valueText ?? null;
    const trayWeightG = parseDiagnosticNumber(fieldFor("tray_weight")?.valueText ?? null);
    const remainingRaw = fieldFor("remain")?.valueText ?? null;
    const remainingPercent =
      remainingRaw != null && Number.isFinite(Number.parseFloat(remainingRaw))
        ? Number.parseInt(remainingRaw, 10)
        : null;
    const explicitRemainingGrams = parseDiagnosticNumber(
      fieldFor("remaining_grams")?.valueText ?? null,
    );
    const remainingGrams =
      explicitRemainingGrams ??
      (trayWeightG != null && remainingPercent != null
        ? Math.round((trayWeightG * remainingPercent) / 100)
        : null);
    const lastSeenAt =
      [
        fieldFor("tray_type")?.lastSeenAt,
        fieldFor("tray_sub_brands")?.lastSeenAt,
        fieldFor("tray_color")?.lastSeenAt,
        fieldFor("tray_weight")?.lastSeenAt,
        fieldFor("remain")?.lastSeenAt,
        fieldFor("remaining_grams")?.lastSeenAt,
        fieldFor("tray_uuid")?.lastSeenAt,
      ]
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;

    return {
      amsIndex,
      trayIndex,
      loaded: Boolean(
        (filamentType && filamentType.trim()) ||
          (filamentName && filamentName.trim()) ||
          (fieldFor("tray_uuid")?.valueText && !/^0+$/.test(fieldFor("tray_uuid")?.valueText ?? "")),
      ),
      filamentType,
      filamentName,
      colorHex: normalizeDiagnosticHexColor(colorRaw),
      trayWeightG,
      remainingPercent,
      remainingGrams,
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

function formatDiagnosticAmsEstimate(
  remainingGrams: number | null | undefined,
  trayWeightG: number | null | undefined,
  remainingPercent: number | null | undefined,
): string | null {
  if (remainingGrams != null && trayWeightG != null) {
    const percentNote = remainingPercent != null ? ` · ${remainingPercent}%` : "";
    return `AMS estimate: ${remainingGrams} g / ${trayWeightG} g${percentNote}`;
  }
  if (remainingGrams != null) {
    return `AMS estimate: ${remainingGrams} g`;
  }
  if (remainingPercent != null) {
    return `AMS estimate: ${remainingPercent}%`;
  }
  if (trayWeightG != null) {
    return `AMS spool basis: ${trayWeightG} g`;
  }
  return null;
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
    const amsEstimateNote = formatDiagnosticAmsEstimate(
      tray.remainingGrams,
      tray.trayWeightG,
      tray.remainingPercent,
    );

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
