import { useMemo } from "react";
import { formatPlacementLabel } from "./display_format";
import { useI18n } from "./i18n";
import {
  formatInventoryDisplayTitle,
  formatInventoryOwnershipLabel,
  formatInventoryStatusLabel,
  inventoryOwnershipTone,
  inventoryStatusTone,
  type InventorySpool,
} from "./inventory_list_model";
import { resolveSpoolTareWeight } from "./spool_weight";

type InventorySelectedSpoolViewModelInput = {
  assignedSlot?: { printerName: string } | null;
  qrCompanionShellUrl?: string | null;
  selectedSpool: InventorySpool | null;
  slotLabelById: Map<string, string>;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventorySelectedSpoolViewModel({
  assignedSlot,
  qrCompanionShellUrl,
  selectedSpool,
  slotLabelById,
  t,
}: InventorySelectedSpoolViewModelInput) {
  const selectedSpoolResolvedTare = useMemo(
    () =>
      selectedSpool
        ? resolveSpoolTareWeight(selectedSpool.spoolTareWeightGrams, selectedSpool.vendor)
        : 0,
    [selectedSpool],
  );

  const selectedSpoolMeasuredTotal = useMemo(() => {
    if (!selectedSpool) {
      return 0;
    }
    return Math.max(0, (selectedSpool.remainingGrams ?? 0) + selectedSpoolResolvedTare);
  }, [selectedSpool, selectedSpoolResolvedTare]);

  const selectedSpoolStatusLabel = useMemo(
    () => (selectedSpool ? formatInventoryStatusLabel(t, selectedSpool.status) : ""),
    [selectedSpool, t],
  );

  const selectedSpoolStatusTone = useMemo(
    () => (selectedSpool ? inventoryStatusTone(selectedSpool.status) : "neutral"),
    [selectedSpool],
  );

  const selectedSpoolOwnershipLabel = useMemo(
    () =>
      selectedSpool ? formatInventoryOwnershipLabel(t, selectedSpool.ownershipType) : "",
    [selectedSpool, t],
  );

  const selectedSpoolOwnershipTone = useMemo(
    () =>
      selectedSpool ? inventoryOwnershipTone(selectedSpool.ownershipType) : "neutral",
    [selectedSpool],
  );

  const selectedSpoolDisplayTitle = useMemo(
    () =>
      selectedSpool
        ? formatInventoryDisplayTitle(
            selectedSpool.material,
            selectedSpool.filamentName,
            selectedSpool.colorName,
          )
        : "",
    [selectedSpool],
  );

  const selectedSpoolLocationValue = useMemo(() => {
    if (!selectedSpool) {
      return "";
    }
    if (assignedSlot) {
      return assignedSlot.printerName;
    }
    return formatPlacementLabel(t, selectedSpool.location, slotLabelById);
  }, [assignedSlot, selectedSpool, slotLabelById, t]);

  return {
    selectedSpoolDisplayTitle,
    selectedSpoolLocationValue,
    selectedSpoolMeasuredTotal,
    selectedSpoolOwnershipLabel,
    selectedSpoolOwnershipTone,
    selectedSpoolQrCompanionAvailable: Boolean(qrCompanionShellUrl?.trim()),
    selectedSpoolResolvedTare,
    selectedSpoolStatusLabel,
    selectedSpoolStatusTone,
  };
}
