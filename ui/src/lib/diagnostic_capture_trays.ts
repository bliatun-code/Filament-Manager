import type { BambuLiveObservedTray } from "./tauri_client";
import type { DiagnosticCaptureField, DiagnosticTraySnapshot } from "./diagnostic_capture";

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

export function extractDiagnosticTraySnapshots(
  fields: DiagnosticCaptureField[],
): DiagnosticTraySnapshot[] {
  const trayIndices = Array.from(
    new Set(
      fields
        .map((field) => {
          const match = field.path.match(/ams\.ams\[\d+\]\.tray\[(\d+)\]\./);
          return match ? Number.parseInt(match[1] ?? "", 10) : null;
        })
        .filter((value): value is number => value != null && Number.isFinite(value)),
    ),
  ).sort((left, right) => left - right);

  return trayIndices.map((trayIndex) => {
    const prefix = `ams.ams[0].tray[${trayIndex}]`;
    const fieldFor = (name: string) =>
      fields.find((field) => field.path === `${prefix}.${name}`) ?? null;
    const filamentType = fieldFor("tray_type")?.valueText ?? null;
    const filamentName = fieldFor("tray_sub_brands")?.valueText ?? null;
    const colorRaw = fieldFor("tray_color")?.valueText ?? null;
    const remainingRaw = fieldFor("remain")?.valueText ?? null;
    const remainingPercent =
      remainingRaw != null && Number.isFinite(Number.parseFloat(remainingRaw))
        ? Number.parseInt(remainingRaw, 10)
        : null;
    const lastSeenAt =
      [
        fieldFor("tray_type")?.lastSeenAt,
        fieldFor("tray_sub_brands")?.lastSeenAt,
        fieldFor("tray_color")?.lastSeenAt,
        fieldFor("remain")?.lastSeenAt,
        fieldFor("tray_uuid")?.lastSeenAt,
      ]
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;

    return {
      trayIndex,
      loaded: Boolean(
        (filamentType && filamentType.trim()) ||
          (filamentName && filamentName.trim()) ||
          (fieldFor("tray_uuid")?.valueText && !/^0+$/.test(fieldFor("tray_uuid")?.valueText ?? "")),
      ),
      filamentType,
      filamentName,
      colorHex: normalizeDiagnosticHexColor(colorRaw),
      remainingPercent,
      tagUid: fieldFor("tag_uid")?.valueText ?? null,
      trayUuid: fieldFor("tray_uuid")?.valueText ?? null,
      trayInfoIdx: fieldFor("tray_info_idx")?.valueText ?? null,
      trayIdName: fieldFor("tray_id_name")?.valueText ?? null,
      lastSeenAt,
    };
  });
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
    const presetNote = [tray.trayInfoIdx, tray.trayIdName].filter(Boolean).join(" · ");

    return {
      tray_index: tray.trayIndex,
      loaded: tray.loaded,
      filament_type: tray.filamentType ?? null,
      filament_name: tray.filamentName ?? null,
      color_hex: tray.colorHex ?? null,
      remaining_percent: tray.remainingPercent ?? null,
      match_status: null,
      match_note:
        [
          identityNote ? `RFID: ${identityNote}` : null,
          presetNote ? `Preset: ${presetNote}` : null,
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
