import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { InventorySpool } from "./inventory_list_model";
import type { OwnershipType } from "./inventory_list_model";
import type { RfidCaptureField } from "./inventory_rfid_capture";
import type { InventoryDetailVisualFixture } from "./inventory_visual_fixture";
import { resolveSpoolTareWeight } from "./spool_weight";
import type { SpoolHistoryEventRow, SpoolUsagePointRow } from "./tauri_client";

type InventorySelectedSpoolDetailStateInput = {
  closeRfidCaptureModal: () => void;
  closeRollModal: () => void;
  detailVisualFixture: InventoryDetailVisualFixture | null;
  reloadSpoolDetail: (spoolId: string) => Promise<void>;
  selectedSpool: InventorySpool | null;
  setHistoryRows: Dispatch<SetStateAction<SpoolHistoryEventRow[]>>;
  setRfidCaptureFieldsBySlotId: Dispatch<SetStateAction<Record<string, RfidCaptureField[]>>>;
  setRfidCaptureError: Dispatch<SetStateAction<string | null>>;
  setRfidCaptureLoading: Dispatch<SetStateAction<boolean>>;
  setSelectedRfidCaptureSlotId: Dispatch<SetStateAction<string | null>>;
  setShowRfidCaptureModal: Dispatch<SetStateAction<boolean>>;
  setShowRollModal: Dispatch<SetStateAction<boolean>>;
  setUsagePoints: Dispatch<SetStateAction<SpoolUsagePointRow[]>>;
};

export function useInventorySelectedSpoolDetailState({
  closeRfidCaptureModal,
  closeRollModal,
  detailVisualFixture,
  reloadSpoolDetail,
  selectedSpool,
  setHistoryRows,
  setRfidCaptureFieldsBySlotId,
  setRfidCaptureError,
  setRfidCaptureLoading,
  setSelectedRfidCaptureSlotId,
  setShowRfidCaptureModal,
  setShowRollModal,
  setUsagePoints,
}: InventorySelectedSpoolDetailStateInput) {
  const [masterEditUnlocked, setMasterEditUnlocked] = useState(false);
  const [editMasterVendor, setEditMasterVendor] = useState("");
  const [editMasterMaterial, setEditMasterMaterial] = useState("");
  const [editMasterFilamentName, setEditMasterFilamentName] = useState("");
  const [editMasterColorName, setEditMasterColorName] = useState("");
  const [editMasterHexColor, setEditMasterHexColor] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [selectedSpoolTareDraft, setSelectedSpoolTareDraft] = useState("");
  const [selectedSpoolLocationDraft, setSelectedSpoolLocationDraft] = useState("");
  const [selectedSpoolOwnershipDraft, setSelectedSpoolOwnershipDraft] =
    useState<OwnershipType>("OWNED");
  const [selectedSpoolOwnerNameDraft, setSelectedSpoolOwnerNameDraft] = useState("");
  const [selectedSpoolOwnerContactDraft, setSelectedSpoolOwnerContactDraft] = useState("");
  const [selectedSpoolOwnershipNoteDraft, setSelectedSpoolOwnershipNoteDraft] = useState("");
  const [showRfidCapturedFields, setShowRfidCapturedFields] = useState(false);
  const [showRollHistory, setShowRollHistory] = useState(false);

  useEffect(() => {
    if (!selectedSpool) {
      setMasterEditUnlocked(false);
      setEditMasterVendor("");
      setEditMasterMaterial("");
      setEditMasterFilamentName("");
      setEditMasterColorName("");
      setEditMasterHexColor("");
      setHistoryRows([]);
      setUsagePoints([]);
      setConfirmDelete(false);
      setConfirmPurge(false);
      setSelectedSpoolLocationDraft("");
      setSelectedSpoolTareDraft("");
      setSelectedSpoolOwnershipDraft("OWNED");
      setSelectedSpoolOwnerNameDraft("");
      setSelectedSpoolOwnerContactDraft("");
      setSelectedSpoolOwnershipNoteDraft("");
      closeRfidCaptureModal();
      setSelectedRfidCaptureSlotId(null);
      setRfidCaptureError(null);
      setRfidCaptureLoading(false);
      closeRollModal();
      return;
    }

    setMasterEditUnlocked(false);
    setEditMasterVendor(selectedSpool.vendor);
    setEditMasterMaterial(selectedSpool.material);
    setEditMasterFilamentName(selectedSpool.filamentName);
    setEditMasterColorName(selectedSpool.colorName);
    setEditMasterHexColor(selectedSpool.hexColor ?? "");
    setSelectedSpoolLocationDraft(selectedSpool.homeLocation ?? "");
    setSelectedSpoolTareDraft(
      String(resolveSpoolTareWeight(selectedSpool.spoolTareWeightGrams, selectedSpool.vendor)),
    );
    setSelectedSpoolOwnershipDraft(selectedSpool.ownershipType);
    setSelectedSpoolOwnerNameDraft(selectedSpool.ownerName ?? "");
    setSelectedSpoolOwnerContactDraft(selectedSpool.ownerContact ?? "");
    setSelectedSpoolOwnershipNoteDraft(selectedSpool.ownershipNote ?? "");
    closeRfidCaptureModal();
    setSelectedRfidCaptureSlotId(null);
    setRfidCaptureError(null);
    setRfidCaptureLoading(false);
    setConfirmDelete(false);
    setConfirmPurge(false);
    void reloadSpoolDetail(selectedSpool.id);
  }, [
    closeRfidCaptureModal,
    closeRollModal,
    reloadSpoolDetail,
    selectedSpool,
    setHistoryRows,
    setRfidCaptureError,
    setRfidCaptureLoading,
    setSelectedRfidCaptureSlotId,
    setUsagePoints,
  ]);

  useEffect(() => {
    if (!detailVisualFixture || selectedSpool?.id !== detailVisualFixture.selectedSpoolId) {
      return;
    }

    setHistoryRows(detailVisualFixture.historyRows);
    setUsagePoints(detailVisualFixture.usagePoints);
    setRfidCaptureFieldsBySlotId(detailVisualFixture.rfidCaptureFieldsBySlotId);
    setSelectedRfidCaptureSlotId(detailVisualFixture.selectedRfidCaptureSlotId);
    setShowRollModal(true);
    setShowRfidCaptureModal(true);
    setShowRfidCapturedFields(true);
    setMasterEditUnlocked(true);
    setRfidCaptureError(null);
  }, [
    detailVisualFixture,
    selectedSpool,
    setHistoryRows,
    setRfidCaptureFieldsBySlotId,
    setRfidCaptureError,
    setSelectedRfidCaptureSlotId,
    setShowRfidCaptureModal,
    setShowRollModal,
    setUsagePoints,
  ]);

  return {
    confirmDelete,
    confirmPurge,
    editMasterColorName,
    editMasterFilamentName,
    editMasterHexColor,
    editMasterMaterial,
    editMasterVendor,
    masterEditUnlocked,
    selectedSpoolLocationDraft,
    selectedSpoolOwnershipDraft,
    selectedSpoolOwnerContactDraft,
    selectedSpoolOwnerNameDraft,
    selectedSpoolOwnershipNoteDraft,
    selectedSpoolTareDraft,
    setConfirmDelete,
    setConfirmPurge,
    setEditMasterColorName,
    setEditMasterFilamentName,
    setEditMasterHexColor,
    setEditMasterMaterial,
    setEditMasterVendor,
    setMasterEditUnlocked,
    setSelectedSpoolLocationDraft,
    setSelectedSpoolOwnershipDraft,
    setSelectedSpoolOwnerContactDraft,
    setSelectedSpoolOwnerNameDraft,
    setSelectedSpoolOwnershipNoteDraft,
    setSelectedSpoolTareDraft,
    setShowRfidCapturedFields,
    setShowRollHistory,
    showRfidCapturedFields,
    showRollHistory,
  };
}
