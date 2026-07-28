import type { InventorySpool } from "./inventory_list_model";
import type {
  BambuLiveIntegrationSettings,
  MasterCatalogRow,
  PrinterOverviewRow,
  SpoolHistoryEventRow,
  SpoolUsagePointRow,
} from "./tauri_client";
import type { RfidCaptureField } from "./inventory_rfid_capture";

export const INVENTORY_DETAIL_FIXTURE_QUERY_KEY = "bfm_inventory_fixture";
export const INVENTORY_DETAIL_FIXTURE_QUERY_VALUE = "detail";

export type InventoryDetailVisualFixture = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationSettings>;
  historyRows: SpoolHistoryEventRow[];
  masters: MasterCatalogRow[];
  printerOverview: PrinterOverviewRow[];
  rfidCaptureFieldsBySlotId: Record<string, RfidCaptureField[]>;
  selectedRfidCaptureSlotId: string;
  selectedSpoolId: string;
  spools: InventorySpool[];
  usagePoints: SpoolUsagePointRow[];
};

function isDevRuntime(): boolean {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  return Boolean(env?.DEV);
}

export function isInventoryDetailVisualFixtureEnabled(
  search = typeof window !== "undefined" ? window.location.search : "",
  devRuntime = isDevRuntime(),
): boolean {
  if (!devRuntime) {
    return false;
  }
  return (
    new URLSearchParams(search).get(INVENTORY_DETAIL_FIXTURE_QUERY_KEY) ===
    INVENTORY_DETAIL_FIXTURE_QUERY_VALUE
  );
}

export function buildInventoryDetailVisualFixture(
  now = new Date("2026-05-15T10:30:00.000Z"),
): InventoryDetailVisualFixture {
  const observedAt = new Date(now.getTime() - 7 * 60_000).toISOString();
  const previousAt = new Date(now.getTime() - 4 * 60 * 60_000).toISOString();
  const selectedSpoolId = "spool-fixture-abs-yellow";
  const selectedRfidCaptureSlotId = "printer-fixture-x1c-ams-1-slot-2";

  const spools: InventorySpool[] = [
    {
      id: selectedSpoolId,
      masterId: "master-fixture-abs-yellow",
      vendor: "Bambu",
      material: "ABS",
      filamentName: "Tangerine Yellow",
      colorName: "Tangerine Yellow",
      hexColor: "#F2C94C",
      initialWeightGrams: 1000,
      status: "ASSIGNED",
      ownershipType: "OWNED",
      remainingGrams: 742,
      spoolTareWeightGrams: 250,
      location: "printer:fixture-x1c:ams:1:slot:2",
      homeLocation: "QA Shelf 5",
      qrCode: "BFM:1:spool-fixture-abs-yellow",
      rfidTag: "RFID-FIXTURE-001",
      rfidObservedAt: observedAt,
    },
    {
      id: "spool-fixture-petg-blue",
      masterId: "master-fixture-petg-blue",
      vendor: "eSUN",
      material: "PETG",
      filamentName: "Transparent",
      colorName: "Blue",
      hexColor: "#3B82F6",
      initialWeightGrams: 1000,
      status: "IN_STOCK",
      ownershipType: "OWNED",
      remainingGrams: 165,
      spoolTareWeightGrams: 235,
      location: "QA Shelf 2",
      homeLocation: "QA Shelf 2",
      qrCode: "BFM:1:spool-fixture-petg-blue",
    },
    {
      id: "spool-fixture-borrowed-pla",
      masterId: "master-fixture-pla-grey",
      vendor: "Prusament",
      material: "PLA",
      filamentName: "Galaxy",
      colorName: "Silver",
      hexColor: "#9CA3AF",
      initialWeightGrams: 1000,
      status: "IN_STOCK",
      ownershipType: "BORROWED_IN",
      ownerName: "Sample workshop",
      ownerContact: null,
      ownershipNote: "Synthetic QA record.",
      remainingGrams: 612,
      spoolTareWeightGrams: 201,
      location: "QA Project box",
      homeLocation: "QA Return shelf",
      qrCode: "BFM:1:spool-fixture-borrowed-pla",
    },
  ];

  const masters: MasterCatalogRow[] = [
    {
      id: "master-fixture-abs-yellow",
      vendor: "Bambu",
      material: "ABS",
      filament_name: "Tangerine Yellow",
      color_name: "Tangerine Yellow",
      hex_color: "#F2C94C",
      product_url: null,
      default_weight: 1000,
      is_discontinued: false,
      discontinued_at: null,
    },
    {
      id: "master-fixture-petg-blue",
      vendor: "eSUN",
      material: "PETG",
      filament_name: "Transparent",
      color_name: "Blue",
      hex_color: "#3B82F6",
      product_url: null,
      default_weight: 1000,
      is_discontinued: false,
      discontinued_at: null,
    },
  ];

  const printerOverview: PrinterOverviewRow[] = [
    {
      printer: {
        id: "fixture-x1c",
        name: "X1 Carbon fixture",
        model: "Bambu Lab X1 Carbon",
        created_at: previousAt,
        updated_at: observedAt,
      },
      usage: {
        total_jobs: 42,
        successful_jobs: 40,
        failed_jobs: 2,
        total_used_g: 12840,
        last_job_at: previousAt,
      },
      slots: [
        {
          slot_id: "printer-fixture-x1c-ams-1-slot-1",
          ams_id: "1",
          slot_index: 0,
          spool_id: "spool-fixture-petg-blue",
          spool_status: "IN_STOCK",
          spool_ownership_type: "OWNED",
          spool_remaining_g: 165,
          spool_material: "PETG",
          spool_filament_name: "Transparent",
          spool_color_name: "Blue",
          spool_hex_color: "#3B82F6",
          live_loaded: true,
          live_filament_type: "PETG",
          live_filament_name: "Transparent Blue",
          live_color_hex: "#3B82F6",
          live_remaining_percent: 16,
          live_printer_last_seen_at: observedAt,
          live_mqtt_connected: true,
        },
        {
          slot_id: selectedRfidCaptureSlotId,
          ams_id: "1",
          slot_index: 1,
          spool_id: selectedSpoolId,
          spool_status: "ASSIGNED",
          spool_ownership_type: "OWNED",
          spool_remaining_g: 742,
          spool_rfid_tag: "RFID-FIXTURE-001",
          spool_material: "ABS",
          spool_filament_name: "Tangerine Yellow",
          spool_color_name: "Tangerine Yellow",
          spool_hex_color: "#F2C94C",
          live_loaded: true,
          live_observed_rfid_tag: "RFID-FIXTURE-001",
          live_tray_uuid: "tray-fixture-yellow-uuid",
          live_chip_id: "chip-fixture-yellow",
          live_tray_info_idx: "GFL99",
          live_tray_id_name: "Bambu ABS Tangerine Yellow",
          live_filament_type: "ABS",
          live_filament_name: "Tangerine Yellow",
          live_color_hex: "#F2C94C",
          live_tray_weight_g: 992,
          live_remaining_percent: 74,
          live_last_identity_seen_at: observedAt,
          live_printer_last_seen_at: observedAt,
          live_mqtt_connected: true,
          live_ams_exist_bits: "0010",
          live_ams_read_done_bits: "0010",
          live_ams_bambu_bits: "0010",
        },
      ],
    },
  ];

  const rfidCaptureFieldsBySlotId: Record<string, RfidCaptureField[]> = {
    [selectedRfidCaptureSlotId]: [
      {
        path: "ams.tray[1].tag_uid",
        label: "tag_uid",
        valueText: "RFID-FIXTURE-001",
        lastSeenAt: observedAt,
        receiveCount: 7,
        changeCount: 1,
      },
      {
        path: "ams.tray[1].tray_uuid",
        label: "tray_uuid",
        valueText: "tray-fixture-yellow-uuid",
        lastSeenAt: observedAt,
        receiveCount: 7,
        changeCount: 1,
      },
      {
        path: "ams.tray[1].tray_info_idx",
        label: "tray_info_idx",
        valueText: "GFL99",
        lastSeenAt: observedAt,
        receiveCount: 6,
        changeCount: 0,
      },
      {
        path: "ams.tray[1].tray_id_name",
        label: "tray_id_name",
        valueText: "Bambu ABS Tangerine Yellow",
        lastSeenAt: observedAt,
        receiveCount: 6,
        changeCount: 0,
      },
      {
        path: "ams.tray[1].cols",
        label: "cols",
        valueText: "#F2C94C",
        lastSeenAt: observedAt,
        receiveCount: 6,
        changeCount: 0,
      },
    ],
  };

  return {
    bambuLiveIntegrations: {
      "fixture-x1c": {
        enabled: true,
        host: "192.0.2.42",
        access_code_configured: true,
        tls_trust_state: "TRUSTED",
        tls_certificate_fingerprint:
          "SHA256:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF",
        tls_spki_fingerprint:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        printer_serial: "FIXTURE-X1C",
        observed_state: {
          online: true,
          mqtt_connected: true,
          last_seen_at: observedAt,
          active_tray_index: 1,
          progress_percent: 38,
          remaining_minutes: 47,
          ams_exist_bits: "0010",
          ams_read_done_bits: "0010",
          ams_bambu_bits: "0010",
          trays: [
            {
              tray_index: 1,
              loaded: true,
              filament_type: "ABS",
              filament_name: "Tangerine Yellow",
              color_hex: "#F2C94C",
              tray_weight_g: 992,
              remaining_percent: 74,
              remaining_grams: 742,
              observed_rfid_tag: "RFID-FIXTURE-001",
              tray_uuid: "tray-fixture-yellow-uuid",
              chip_id: "chip-fixture-yellow",
              tray_info_idx: "GFL99",
              tray_id_name: "Bambu ABS Tangerine Yellow",
              last_identity_seen_at: observedAt,
              matched_inventory_spool_id: selectedSpoolId,
              matched_inventory_mode: "rfid_exact",
              match_status: "EXACT",
            },
          ],
        },
      },
    },
    historyRows: [
      {
        id: "history-fixture-rfid",
        spool_id: selectedSpoolId,
        event_type: "RFID_TAG_UPDATED",
        payload_json: { rfid_tag: "RFID-FIXTURE-001", observed_at: observedAt },
        created_at: observedAt,
      },
      {
        id: "history-fixture-weight",
        spool_id: selectedSpoolId,
        event_type: "WEIGHT_UPDATED",
        payload_json: { remaining_g: 742, previous_remaining_g: 815 },
        created_at: previousAt,
      },
    ],
    masters,
    printerOverview,
    rfidCaptureFieldsBySlotId,
    selectedRfidCaptureSlotId,
    selectedSpoolId,
    spools,
    usagePoints: [
      { captured_at: previousAt, grams: 895, source: "MEASURED" },
      { captured_at: observedAt, grams: 742, source: "MEASURED" },
    ],
  };
}
