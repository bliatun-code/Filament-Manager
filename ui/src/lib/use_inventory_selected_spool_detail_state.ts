import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { InventorySpool } from "./inventory_list_model";
import type { OwnershipType } from "./inventory_list_model";
import type { RfidCaptureField } from "./inventory_rfid_capture";
import type { InventoryDetailVisualFixture } from "./inventory_visual_fixture";
import {
  buildInventorySpoolDetailDraftBaseline,
  inventorySpoolCommonDetailsDraftChanged,
  inventorySpoolMasterMetadataDraftChanged,
  type InventorySpoolDetailDraftBaseline,
} from "./inventory_spool_detail_draft_model";
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
  const [draftBaseline, setDraftBaseline] =
    useState<InventorySpoolDetailDraftBaseline | null>(null);
  const detailSpoolIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedSpool) {
      detailSpoolIdRef.current = null;
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
      setDraftBaseline(null);
      closeRfidCaptureModal();
      setSelectedRfidCaptureSlotId(null);
      setRfidCaptureError(null);
      setRfidCaptureLoading(false);
      closeRollModal();
      return;
    }

    if (detailSpoolIdRef.current === selectedSpool.id) {
      return;
    }

    const nextBaseline = buildInventorySpoolDetailDraftBaseline(selectedSpool);
    setHistoryRows([]);
    setUsagePoints([]);
    detailSpoolIdRef.current = selectedSpool.id;
    setDraftBaseline(nextBaseline);
    setMasterEditUnlocked(false);
    setEditMasterVendor(nextBaseline.master.vendor);
    setEditMasterMaterial(nextBaseline.master.material);
    setEditMasterFilamentName(nextBaseline.master.filamentName);
    setEditMasterColorName(nextBaseline.master.colorName);
    setEditMasterHexColor(nextBaseline.master.hexColor);
    setSelectedSpoolLocationDraft(nextBaseline.common.homeLocation);
    setSelectedSpoolTareDraft(nextBaseline.common.tareWeight);
    setSelectedSpoolOwnershipDraft(nextBaseline.common.ownershipType);
    setSelectedSpoolOwnerNameDraft(nextBaseline.common.ownerName);
    setSelectedSpoolOwnerContactDraft(nextBaseline.common.ownerContact);
    setSelectedSpoolOwnershipNoteDraft(nextBaseline.common.ownershipNote);
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

  const commonDraft = useMemo(
    () => ({
      homeLocation: selectedSpoolLocationDraft,
      ownershipType: selectedSpoolOwnershipDraft,
      ownerName: selectedSpoolOwnerNameDraft,
      ownerContact: selectedSpoolOwnerContactDraft,
      ownershipNote: selectedSpoolOwnershipNoteDraft,
      tareWeight: selectedSpoolTareDraft,
    }),
    [
      selectedSpoolLocationDraft,
      selectedSpoolOwnerContactDraft,
      selectedSpoolOwnerNameDraft,
      selectedSpoolOwnershipDraft,
      selectedSpoolOwnershipNoteDraft,
      selectedSpoolTareDraft,
    ],
  );
  const masterDraft = useMemo(
    () => ({
      vendor: editMasterVendor,
      material: editMasterMaterial,
      filamentName: editMasterFilamentName,
      colorName: editMasterColorName,
      hexColor: editMasterHexColor,
    }),
    [
      editMasterColorName,
      editMasterFilamentName,
      editMasterHexColor,
      editMasterMaterial,
      editMasterVendor,
    ],
  );
  const commonDetailsDirty = Boolean(
    draftBaseline &&
      selectedSpool?.id === draftBaseline.spoolId &&
      inventorySpoolCommonDetailsDraftChanged(draftBaseline.common, commonDraft),
  );
  const masterMetadataDirty = Boolean(
    draftBaseline &&
      selectedSpool?.id === draftBaseline.spoolId &&
      inventorySpoolMasterMetadataDraftChanged(draftBaseline.master, masterDraft),
  );

  const markCommonDetailsSaved = useCallback(() => {
    setDraftBaseline((current) =>
      current ? { ...current, common: commonDraft } : current,
    );
  }, [commonDraft]);

  const markMasterMetadataSaved = useCallback(() => {
    setDraftBaseline((current) =>
      current ? { ...current, master: masterDraft } : current,
    );
  }, [masterDraft]);

  const resetDetailDrafts = useCallback(() => {
    if (!draftBaseline) {
      return;
    }
    setEditMasterVendor(draftBaseline.master.vendor);
    setEditMasterMaterial(draftBaseline.master.material);
    setEditMasterFilamentName(draftBaseline.master.filamentName);
    setEditMasterColorName(draftBaseline.master.colorName);
    setEditMasterHexColor(draftBaseline.master.hexColor);
    setSelectedSpoolLocationDraft(draftBaseline.common.homeLocation);
    setSelectedSpoolTareDraft(draftBaseline.common.tareWeight);
    setSelectedSpoolOwnershipDraft(draftBaseline.common.ownershipType);
    setSelectedSpoolOwnerNameDraft(draftBaseline.common.ownerName);
    setSelectedSpoolOwnerContactDraft(draftBaseline.common.ownerContact);
    setSelectedSpoolOwnershipNoteDraft(draftBaseline.common.ownershipNote);
    setMasterEditUnlocked(false);
  }, [draftBaseline]);

  return {
    confirmDelete,
    confirmPurge,
    commonDetailsDirty,
    editMasterColorName,
    editMasterFilamentName,
    editMasterHexColor,
    editMasterMaterial,
    editMasterVendor,
    markCommonDetailsSaved,
    markMasterMetadataSaved,
    masterEditUnlocked,
    masterMetadataDirty,
    resetDetailDrafts,
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
