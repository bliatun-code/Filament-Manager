import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { useI18n } from "./i18n";
import type { RfidCaptureField } from "./inventory_rfid_capture";
import type { InventoryDetailVisualFixture } from "./inventory_visual_fixture";
import type {
  BambuLiveIntegrationSettings,
  MasterCatalogRow,
  PrinterOverviewRow,
  SpoolHistoryEventRow,
  SpoolUsagePointRow,
} from "./tauri_client";
import type { InventorySpool } from "./inventory_list_model";

type InventoryDetailVisualFixtureInput = {
  detailVisualFixture: InventoryDetailVisualFixture | null;
  resetFilters: () => void;
  setBambuLiveIntegrations: Dispatch<SetStateAction<Record<string, BambuLiveIntegrationSettings>>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setHistoryLoading: Dispatch<SetStateAction<boolean>>;
  setHistoryRows: Dispatch<SetStateAction<SpoolHistoryEventRow[]>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setMasters: Dispatch<SetStateAction<MasterCatalogRow[]>>;
  setPrinterOverview: Dispatch<SetStateAction<PrinterOverviewRow[]>>;
  setRfidCaptureFieldsBySlotId: Dispatch<SetStateAction<Record<string, RfidCaptureField[]>>>;
  setSelectedRfidCaptureSlotId: Dispatch<SetStateAction<string | null>>;
  setSelectedSpoolId: Dispatch<SetStateAction<string | null>>;
  setShowRollModal: Dispatch<SetStateAction<boolean>>;
  setSpools: Dispatch<SetStateAction<InventorySpool[]>>;
  setUsageLoading: Dispatch<SetStateAction<boolean>>;
  setUsagePoints: Dispatch<SetStateAction<SpoolUsagePointRow[]>>;
  switchToManageMode: () => void;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryDetailVisualFixture({
  detailVisualFixture,
  resetFilters,
  setBambuLiveIntegrations,
  setError,
  setHistoryLoading,
  setHistoryRows,
  setInfoMessage,
  setLoading,
  setMasters,
  setPrinterOverview,
  setRfidCaptureFieldsBySlotId,
  setSelectedRfidCaptureSlotId,
  setSelectedSpoolId,
  setShowRollModal,
  setSpools,
  setUsageLoading,
  setUsagePoints,
  switchToManageMode,
  t,
}: InventoryDetailVisualFixtureInput) {
  useEffect(() => {
    if (!detailVisualFixture) {
      return;
    }

    setSpools(detailVisualFixture.spools);
    setMasters(detailVisualFixture.masters);
    setPrinterOverview(detailVisualFixture.printerOverview);
    setBambuLiveIntegrations(detailVisualFixture.bambuLiveIntegrations);
    setRfidCaptureFieldsBySlotId(detailVisualFixture.rfidCaptureFieldsBySlotId);
    setHistoryRows(detailVisualFixture.historyRows);
    setUsagePoints(detailVisualFixture.usagePoints);
    setSelectedSpoolId(detailVisualFixture.selectedSpoolId);
    setSelectedRfidCaptureSlotId(detailVisualFixture.selectedRfidCaptureSlotId);
    setShowRollModal(true);
    switchToManageMode();
    resetFilters();
    setLoading(false);
    setHistoryLoading(false);
    setUsageLoading(false);
    setError(null);
    setInfoMessage(t("inventory.visualFixtureLoaded", "Inventory detail fixture loaded."));
  }, [
    detailVisualFixture,
    resetFilters,
    setBambuLiveIntegrations,
    setError,
    setHistoryLoading,
    setHistoryRows,
    setInfoMessage,
    setLoading,
    setMasters,
    setPrinterOverview,
    setRfidCaptureFieldsBySlotId,
    setSelectedRfidCaptureSlotId,
    setSelectedSpoolId,
    setShowRollModal,
    setSpools,
    setUsageLoading,
    setUsagePoints,
    switchToManageMode,
    t,
  ]);
}
