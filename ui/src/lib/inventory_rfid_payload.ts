import type { RfidCaptureField, RfidCaptureSummary } from "./inventory_rfid_capture";

export function flattenCaptureFields(value: unknown, prefix = ""): Array<{ path: string; valueText: string }> {
  if (value == null) {
    return prefix ? [{ path: prefix, valueText: "null" }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      flattenCaptureFields(entry, prefix ? `${prefix}[${index}]` : `[${index}]`),
    );
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entryValue]) =>
      flattenCaptureFields(entryValue, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [{ path: prefix, valueText: typeof value === "string" ? value : String(value) }];
}

export function normalizeCapturedRfidTag(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || /^0+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function normalizeCapturedHexColor(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^#/, "") ?? "";
  if (/^[0-9a-f]{8}$/i.test(normalized)) {
    return `#${normalized.slice(0, 6).toUpperCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return `#${normalized.toUpperCase()}`;
  }
  return null;
}

export function decodeTrayExistBitsSlotPresence(
  value: string | null | undefined,
  slotIndex: number,
): boolean | null {
  const normalized = value?.trim().replace(/^0x/i, "") ?? "";
  if (!normalized || !/^[0-9a-f]+$/i.test(normalized)) {
    return null;
  }
  if (!Number.isFinite(slotIndex)) {
    return null;
  }
  const bitIndex = Math.max(0, Math.trunc(slotIndex) - 1);
  const mask = BigInt(`0x${normalized}`);
  return ((mask >> BigInt(bitIndex)) & 1n) === 1n;
}

export function extractRfidCaptureFields(
  rawPayload: unknown,
  slotIndex: number,
): Array<{ path: string; label: string; valueText: string }> {
  const trayZeroIndex = Math.max(0, slotIndex - 1);
  const trayPrefix = `ams.ams[0].tray[${trayZeroIndex}]`;
  return flattenCaptureFields(rawPayload)
    .filter(({ path }) =>
      path.startsWith(`${trayPrefix}.`) ||
      path === "ams.ams[0].chip_id" ||
      path === "ams_rfid_status" ||
      path === "ams_status" ||
      path === "ams.tray_is_bbl_bits" ||
      path === "ams.tray_read_done_bits" ||
      path === "ams.tray_reading_bits" ||
      path === "ams.tray_exist_bits" ||
      path === "ams.ams_exist_bits",
    )
    .map(({ path, valueText }) => ({
      path,
      valueText,
      label: path.startsWith(`${trayPrefix}.`) ? path.slice(trayPrefix.length + 1) : path,
    }));
}

export function summarizeRfidCapture(fields: RfidCaptureField[], slotIndex: number): RfidCaptureSummary {
  const trayZeroIndex = Math.max(0, slotIndex - 1);
  const trayPrefix = `ams.ams[0].tray[${trayZeroIndex}]`;
  const fieldMap = new Map(fields.map((field) => [field.path, field.valueText]));
  const trayValue = (name: string): string | null => fieldMap.get(`${trayPrefix}.${name}`)?.trim() || null;
  return {
    rfidTag: normalizeCapturedRfidTag(trayValue("tray_uuid")),
    tagUid: normalizeCapturedRfidTag(trayValue("tag_uid")),
    trayUuid: normalizeCapturedRfidTag(trayValue("tray_uuid")),
    chipId: normalizeCapturedRfidTag(fieldMap.get("ams.ams[0].chip_id") ?? null),
    trayInfoIdx: trayValue("tray_info_idx"),
    trayIdName: trayValue("tray_id_name"),
    material: trayValue("tray_type"),
    filamentName: trayValue("tray_sub_brands"),
    colorHex: normalizeCapturedHexColor(trayValue("tray_color")),
    trayWeightG: trayValue("tray_weight"),
    trayColorRaw: trayValue("tray_color"),
    trayExistBits: fieldMap.get("ams.tray_exist_bits")?.trim() || null,
    trayPresentInAms: decodeTrayExistBitsSlotPresence(
      fieldMap.get("ams.tray_exist_bits"),
      slotIndex,
    ),
    trayReadDoneBits: fieldMap.get("ams.tray_read_done_bits")?.trim() || null,
    trayIsBblBits: fieldMap.get("ams.tray_is_bbl_bits")?.trim() || null,
    amsRfidStatus: fieldMap.get("ams_rfid_status")?.trim() || null,
  };
}
