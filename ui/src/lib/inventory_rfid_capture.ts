import { neutralChipClass, semanticChipClass } from "./chip_styles";
import type { Locale } from "./i18n";
import type { BambuLiveIntegrationSettings, PrinterOverviewRow } from "./tauri_client";

export type RfidCaptureField = {
  path: string;
  label: string;
  valueText: string;
  lastSeenAt: string;
  receiveCount: number;
  changeCount: number;
};

export type RfidCaptureSummary = {
  rfidTag?: string | null;
  tagUid?: string | null;
  trayUuid?: string | null;
  chipId?: string | null;
  trayInfoIdx?: string | null;
  trayIdName?: string | null;
  material?: string | null;
  filamentName?: string | null;
  colorHex?: string | null;
  trayWeightG?: string | null;
  trayColorRaw?: string | null;
  trayReadDoneBits?: string | null;
  trayIsBblBits?: string | null;
  amsRfidStatus?: string | null;
};

export type RfidCaptureMatchConfidence = "EXACT" | "PARTIAL" | "NONE";

export type RfidObservedTraySnapshot = {
  observedAt: string | null;
  fields: RfidCaptureField[];
};

export type IdentityFreshness = "FRESH" | "AGED" | "MISSING";

export type RfidCaptureHostSlotLike = {
  amsId: string;
  slotId: string;
  slotIndex: number;
  liveLoaded?: boolean | null;
  liveObservedRfidTag?: string | null;
  liveTrayUuid?: string | null;
  liveChipId?: string | null;
  liveTrayInfoIdx?: string | null;
  liveTrayIdName?: string | null;
  liveFilamentType?: string | null;
  liveFilamentName?: string | null;
  liveColorHex?: string | null;
  liveTrayWeightG?: number | null;
  liveRemainingPercent?: number | null;
  liveLastIdentitySeenAt?: string | null;
  livePrinterLastSeenAt?: string | null;
  liveAmsReadDoneBits?: string | null;
  liveAmsBambuBits?: string | null;
};

export function formatCaptureTimestamp(raw: string, locale: Locale): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}

export function getIdentityFreshness(
  rfidTag: string | null | undefined,
  observedAt: string | null | undefined,
): IdentityFreshness {
  if (!(rfidTag?.trim()) || !(observedAt?.trim())) {
    return "MISSING";
  }
  const parsed = new Date(observedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "AGED";
  }
  const ageMs = Date.now() - parsed.getTime();
  return ageMs <= 1000 * 60 * 60 * 24 * 7 ? "FRESH" : "AGED";
}

export function formatObservedAge(raw: string | null | undefined, locale: Locale): string {
  if (!(raw?.trim())) {
    return "—";
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 60_000) {
    return locale === "nb" ? "nå nettopp" : "just now";
  }
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) {
    return locale === "nb" ? `${diffMinutes} min siden` : `${diffMinutes} min ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) {
    return locale === "nb" ? `${diffHours} t siden` : `${diffHours} h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return locale === "nb" ? `${diffDays} dager siden` : `${diffDays} days ago`;
}

export function identityFreshnessCopy(
  freshness: IdentityFreshness,
  t: (key: string, fallback: string) => string,
): { label: string; className: string } {
  switch (freshness) {
    case "FRESH":
      return {
        label: t("inventory.rfidFresh", "Fresh"),
        className: semanticChipClass("success"),
      };
    case "AGED":
      return {
        label: t("inventory.rfidAged", "Aged"),
        className: semanticChipClass("warning"),
      };
    default:
      return {
        label: t("inventory.rfidMissing", "Missing"),
        className: neutralChipClass(false),
      };
  }
}

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
    trayReadDoneBits: fieldMap.get("ams.tray_read_done_bits")?.trim() || null,
    trayIsBblBits: fieldMap.get("ams.tray_is_bbl_bits")?.trim() || null,
    amsRfidStatus: fieldMap.get("ams_rfid_status")?.trim() || null,
  };
}

export function buildObservedTrayCaptureSnapshot(
  liveIntegration: BambuLiveIntegrationSettings | null | undefined,
  slotIndex: number,
): RfidObservedTraySnapshot | null {
  const observedState = liveIntegration?.observed_state;
  if (!observedState) {
    return null;
  }
  const tray = observedState.trays.find((entry) => entry.tray_index === Math.max(0, slotIndex - 1));
  if (!tray) {
    return null;
  }
  const observedAt =
    tray.last_identity_seen_at?.trim() || tray.last_empty_seen_at?.trim() || observedState.last_seen_at?.trim() || null;
  const fields: RfidCaptureField[] = [];
  const pushField = (path: string, label: string, valueText: string | number | null | undefined) => {
    if (valueText == null) {
      return;
    }
    const normalized = String(valueText).trim();
    if (!normalized) {
      return;
    }
    fields.push({
      path,
      label,
      valueText: normalized,
      lastSeenAt: observedAt ?? new Date().toISOString(),
      receiveCount: 1,
      changeCount: 1,
    });
  };

  pushField("ams.ams[0].chip_id", "ams.ams[0].chip_id", tray.chip_id);
  pushField("ams.tray_read_done_bits", "ams.tray_read_done_bits", observedState.ams_read_done_bits);
  pushField("ams.tray_is_bbl_bits", "ams.tray_is_bbl_bits", observedState.ams_bambu_bits);

  const trayPrefix = `ams.ams[0].tray[${Math.max(0, slotIndex - 1)}]`;
  pushField(`${trayPrefix}.tag_uid`, "tag_uid", tray.observed_rfid_tag);
  pushField(`${trayPrefix}.tray_uuid`, "tray_uuid", tray.tray_uuid);
  pushField(`${trayPrefix}.tray_info_idx`, "tray_info_idx", tray.tray_info_idx);
  pushField(`${trayPrefix}.tray_id_name`, "tray_id_name", tray.tray_id_name);
  pushField(`${trayPrefix}.tray_type`, "tray_type", tray.filament_type);
  pushField(`${trayPrefix}.tray_sub_brands`, "tray_sub_brands", tray.filament_name);
  pushField(`${trayPrefix}.tray_color`, "tray_color", tray.color_hex);
  pushField(`${trayPrefix}.remain`, "remain", tray.remaining_percent);
  pushField(`${trayPrefix}.remaining_grams`, "remaining_grams", tray.remaining_grams);

  if (fields.length === 0) {
    return null;
  }
  return { observedAt, fields };
}

export function buildObservedTrayCaptureSnapshotFromHostSlot(
  slot: RfidCaptureHostSlotLike | null | undefined,
): RfidObservedTraySnapshot | null {
  if (!slot || slot.amsId.endsWith("_ext")) {
    return null;
  }
  const observedAt = slot.liveLastIdentitySeenAt?.trim() || slot.livePrinterLastSeenAt?.trim() || null;
  const fields: RfidCaptureField[] = [];
  const pushField = (path: string, label: string, valueText: string | number | null | undefined) => {
    if (valueText == null) {
      return;
    }
    const normalized = String(valueText).trim();
    if (!normalized) {
      return;
    }
    fields.push({
      path,
      label,
      valueText: normalized,
      lastSeenAt: observedAt ?? new Date().toISOString(),
      receiveCount: 1,
      changeCount: 1,
    });
  };

  pushField("ams.ams[0].chip_id", "ams.ams[0].chip_id", slot.liveChipId);
  pushField("ams.tray_read_done_bits", "ams.tray_read_done_bits", slot.liveAmsReadDoneBits);
  pushField("ams.tray_is_bbl_bits", "ams.tray_is_bbl_bits", slot.liveAmsBambuBits);

  const trayPrefix = `ams.ams[0].tray[${Math.max(0, slot.slotIndex - 1)}]`;
  pushField(`${trayPrefix}.tag_uid`, "tag_uid", slot.liveObservedRfidTag);
  pushField(`${trayPrefix}.tray_uuid`, "tray_uuid", slot.liveTrayUuid);
  pushField(`${trayPrefix}.tray_info_idx`, "tray_info_idx", slot.liveTrayInfoIdx);
  pushField(`${trayPrefix}.tray_id_name`, "tray_id_name", slot.liveTrayIdName);
  pushField(`${trayPrefix}.tray_type`, "tray_type", slot.liveFilamentType);
  pushField(`${trayPrefix}.tray_sub_brands`, "tray_sub_brands", slot.liveFilamentName);
  pushField(`${trayPrefix}.tray_color`, "tray_color", slot.liveColorHex);
  pushField(`${trayPrefix}.tray_weight`, "tray_weight", slot.liveTrayWeightG);
  pushField(`${trayPrefix}.remain`, "remain", slot.liveRemainingPercent);

  if (fields.length === 0) {
    return null;
  }
  return { observedAt, fields };
}

export function hasHostRfidCaptureData(slot: RfidCaptureHostSlotLike | null | undefined): boolean {
  if (!slot || slot.amsId.endsWith("_ext")) {
    return false;
  }
  return Boolean(
    slot.liveObservedRfidTag?.trim() ||
      slot.liveTrayUuid?.trim() ||
      slot.liveChipId?.trim() ||
      slot.liveTrayInfoIdx?.trim() ||
      slot.liveTrayIdName?.trim() ||
      slot.liveFilamentType?.trim() ||
      slot.liveFilamentName?.trim() ||
      slot.liveColorHex?.trim() ||
      slot.liveLastIdentitySeenAt?.trim() ||
      slot.livePrinterLastSeenAt?.trim() ||
      slot.liveLoaded != null,
  );
}

export function mergeRfidCaptureFields(
  baselineFields: RfidCaptureField[],
  capturedFields: RfidCaptureField[],
): RfidCaptureField[] {
  const merged = new Map<string, RfidCaptureField>();
  for (const field of baselineFields) {
    merged.set(field.path, field);
  }
  for (const field of capturedFields) {
    const existing = merged.get(field.path);
    if (!existing) {
      merged.set(field.path, field);
      continue;
    }
    const existingStamp = Date.parse(existing.lastSeenAt);
    const nextStamp = Date.parse(field.lastSeenAt);
    merged.set(
      field.path,
      Number.isNaN(nextStamp) || (!Number.isNaN(existingStamp) && existingStamp > nextStamp)
        ? existing
        : field,
    );
  }
  return Array.from(merged.values()).sort((left, right) =>
    left.label.localeCompare(right.label, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

export function buildBaselineCaptureFieldsBySlotId(
  printers: PrinterOverviewRow[],
  integrations: Record<string, BambuLiveIntegrationSettings>,
): Record<string, RfidCaptureField[]> {
  const next: Record<string, RfidCaptureField[]> = {};
  for (const printer of printers) {
    const integration = integrations[printer.printer.id];
    if (!integration?.enabled) {
      continue;
    }
    for (const slot of printer.slots) {
      if (slot.ams_id.endsWith("_ext")) {
        continue;
      }
      const snapshot = buildObservedTrayCaptureSnapshot(integration, slot.slot_index);
      if (snapshot?.fields.length) {
        next[slot.slot_id] = snapshot.fields;
      }
    }
  }
  return next;
}

export function latestRfidCaptureSeenAt(fields: RfidCaptureField[]): string | null {
  return [...fields].map((field) => field.lastSeenAt).sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}
