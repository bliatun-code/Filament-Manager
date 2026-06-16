import type { BambuLiveIntegrationSettings } from "./tauri_client";
import { liveTrayMatchesSlot } from "./printer_live_display";
import type {
  RfidCaptureField,
  RfidCaptureHostSlotLike,
  RfidObservedTraySnapshot,
} from "./inventory_rfid_capture";

function pushCaptureField(
  fields: RfidCaptureField[],
  observedAt: string | null,
  path: string,
  label: string,
  valueText: string | number | null | undefined,
) {
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
}

export function buildObservedTrayCaptureSnapshot(
  liveIntegration: BambuLiveIntegrationSettings | null | undefined,
  slotIndex: number,
  amsId?: string | null,
): RfidObservedTraySnapshot | null {
  const observedState = liveIntegration?.observed_state;
  if (!observedState) {
    return null;
  }
  const trayZeroIndex = Math.max(0, slotIndex - 1);
  const tray = observedState.trays.find((entry) =>
    liveTrayMatchesSlot({ amsId: amsId ?? undefined, slotIndex }, entry),
  );
  if (!tray) {
    return null;
  }
  const observedAt =
    tray.last_identity_seen_at?.trim() || tray.last_empty_seen_at?.trim() || observedState.last_seen_at?.trim() || null;
  const fields: RfidCaptureField[] = [];
  const pushField = (path: string, label: string, valueText: string | number | null | undefined) =>
    pushCaptureField(fields, observedAt, path, label, valueText);

  pushField("ams.ams[0].chip_id", "ams.ams[0].chip_id", tray.chip_id);
  pushField("ams.tray_exist_bits", "ams.tray_exist_bits", observedState.ams_exist_bits);
  pushField("ams.tray_read_done_bits", "ams.tray_read_done_bits", observedState.ams_read_done_bits);
  pushField("ams.tray_is_bbl_bits", "ams.tray_is_bbl_bits", observedState.ams_bambu_bits);

  const amsIndex = tray.ams_index ?? 0;
  const trayPrefix = `ams.ams[${amsIndex}].tray[${trayZeroIndex}]`;
  pushField(`${trayPrefix}.tag_uid`, "tag_uid", tray.observed_rfid_tag);
  pushField(`${trayPrefix}.tray_uuid`, "tray_uuid", tray.tray_uuid);
  pushField(`${trayPrefix}.tray_info_idx`, "tray_info_idx", tray.tray_info_idx);
  pushField(`${trayPrefix}.tray_id_name`, "tray_id_name", tray.tray_id_name);
  pushField(`${trayPrefix}.tray_type`, "tray_type", tray.filament_type);
  pushField(`${trayPrefix}.tray_sub_brands`, "tray_sub_brands", tray.filament_name);
  pushField(`${trayPrefix}.tray_color`, "tray_color", tray.color_hex);
  pushField(`${trayPrefix}.tray_weight`, "tray_weight", tray.tray_weight_g);
  pushField(`${trayPrefix}.remain`, "remain", tray.remaining_percent);
  pushField(`${trayPrefix}.remaining_grams`, "remaining_grams", tray.remaining_grams);

  return fields.length > 0 ? { observedAt, fields } : null;
}

export function buildObservedTrayCaptureSnapshotFromHostSlot(
  slot: RfidCaptureHostSlotLike | null | undefined,
): RfidObservedTraySnapshot | null {
  if (!slot || slot.amsId.endsWith("_ext")) {
    return null;
  }
  const observedAt = slot.liveLastIdentitySeenAt?.trim() || slot.livePrinterLastSeenAt?.trim() || null;
  const fields: RfidCaptureField[] = [];
  const pushField = (path: string, label: string, valueText: string | number | null | undefined) =>
    pushCaptureField(fields, observedAt, path, label, valueText);

  pushField("ams.ams[0].chip_id", "ams.ams[0].chip_id", slot.liveChipId);
  pushField("ams.tray_exist_bits", "ams.tray_exist_bits", slot.liveAmsExistBits);
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

  return fields.length > 0 ? { observedAt, fields } : null;
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
      slot.liveAmsExistBits?.trim() ||
      slot.liveLastIdentitySeenAt?.trim() ||
      slot.livePrinterLastSeenAt?.trim() ||
      slot.liveLoaded != null,
  );
}
