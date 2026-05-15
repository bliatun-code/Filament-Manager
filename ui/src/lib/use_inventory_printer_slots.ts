import { useMemo } from "react";
import { formatPrinterSlotLabelForModel } from "./printer_profiles";
import type { useI18n } from "./i18n";
import type { RfidCapturePrinterSlotLike } from "./inventory_rfid_capture";
import type { PrinterOverviewRow } from "./tauri_client";

export type InventoryPrinterSlotOption = RfidCapturePrinterSlotLike & {
  printerName: string;
  printerModel: string;
  spoolId?: string | null;
  spoolRemaining?: number | null;
  spoolMaterial?: string | null;
  spoolFilamentName?: string | null;
  spoolColorName?: string | null;
  spoolHexColor?: string | null;
  liveMqttConnected?: boolean | null;
};

export function useInventoryPrinterSlots(
  printerOverview: PrinterOverviewRow[],
  t: ReturnType<typeof useI18n>["t"],
) {
  const printerSlotOptions = useMemo<InventoryPrinterSlotOption[]>(() => {
    const rows: InventoryPrinterSlotOption[] = [];
    for (const printer of printerOverview) {
      for (const slot of printer.slots) {
        rows.push({
          printerId: printer.printer.id,
          printerName: printer.printer.name,
          printerModel: printer.printer.model,
          amsId: slot.ams_id,
          slotId: slot.slot_id,
          slotIndex: slot.slot_index,
          spoolId: slot.spool_id ?? null,
          spoolRemaining: slot.spool_remaining_g ?? null,
          spoolMaterial: slot.spool_material ?? null,
          spoolFilamentName: slot.spool_filament_name ?? null,
          spoolColorName: slot.spool_color_name ?? null,
          spoolHexColor: slot.spool_hex_color ?? null,
          liveLoaded: slot.live_loaded ?? null,
          liveObservedRfidTag: slot.live_observed_rfid_tag ?? null,
          liveTrayUuid: slot.live_tray_uuid ?? null,
          liveChipId: slot.live_chip_id ?? null,
          liveTrayInfoIdx: slot.live_tray_info_idx ?? null,
          liveTrayIdName: slot.live_tray_id_name ?? null,
          liveFilamentType: slot.live_filament_type ?? null,
          liveFilamentName: slot.live_filament_name ?? null,
          liveColorHex: slot.live_color_hex ?? null,
          liveTrayWeightG: slot.live_tray_weight_g ?? null,
          liveRemainingPercent: slot.live_remaining_percent ?? null,
          liveLastIdentitySeenAt: slot.live_last_identity_seen_at ?? null,
          livePrinterLastSeenAt: slot.live_printer_last_seen_at ?? null,
          liveMqttConnected: slot.live_mqtt_connected ?? null,
          liveAmsReadDoneBits: slot.live_ams_read_done_bits ?? null,
          liveAmsBambuBits: slot.live_ams_bambu_bits ?? null,
        });
      }
    }
    return rows;
  }, [printerOverview]);

  const printerSlotBySpoolId = useMemo(() => {
    const map = new Map<string, InventoryPrinterSlotOption>();
    for (const slot of printerSlotOptions) {
      if (slot.spoolId) {
        map.set(slot.spoolId, slot);
      }
    }
    return map;
  }, [printerSlotOptions]);

  const printerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const printer of printerOverview) {
      map.set(printer.printer.id, printer.printer.name);
    }
    return map;
  }, [printerOverview]);

  const slotLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const printer of printerOverview) {
      for (const slot of printer.slots) {
        map.set(
          slot.slot_id,
          `${printer.printer.name} · ${formatPrinterSlotLabelForModel(t, printer.printer.model, {
            ams_id: slot.ams_id,
            slot_index: slot.slot_index,
          })}`,
        );
      }
    }
    return map;
  }, [printerOverview, t]);

  return {
    printerNameById,
    printerSlotBySpoolId,
    printerSlotOptions,
    slotLabelById,
  };
}
