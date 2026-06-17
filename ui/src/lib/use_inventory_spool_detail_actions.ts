import type { Dispatch, SetStateAction } from "react";
import { isValidSwatchColor, normalizeSwatchValue } from "./color_utils";
import { commandErrorText } from "./error_text";
import type { useI18n } from "./i18n";
import type { InventorySpool, OwnershipType, SpoolStatus } from "./inventory_list_model";
import {
  deleteInventorySpool,
  purgeInventorySpool,
  updateInventorySpoolDetails,
  updateInventorySpoolOwnership,
  updateInventorySpoolStatus,
  updateInventorySpoolTareWeight,
  updateInventorySpoolWeight,
} from "./spool_writes";
import { writePrinterSlotAssignment } from "./printer_slot_writes";
import {
  recordPrintUsage,
  updateMasterCatalogEntry,
} from "./tauri_client";
import { buildMeasuredWeightUpdatePlan } from "./inventory_spool_weight_update_model";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";

type InventoryDetailReloads = {
  reloadActiveLoans: () => Promise<void>;
  reloadCatalog: () => Promise<void>;
  reloadPrinterOverview: () => Promise<void>;
  reloadSpoolDetail: (spoolId: string) => Promise<void>;
  reloadSpools: () => Promise<void>;
};

type InventorySpoolDetailActionsInput = InventoryDetailReloads & {
  canUseClientHostWrite: () => boolean;
  clearSelectedSpoolDetail: () => void;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  confirmDelete: boolean;
  confirmPurge: boolean;
  editMasterColorName: string;
  editMasterFilamentName: string;
  editMasterHexColor: string;
  editMasterMaterial: string;
  editMasterVendor: string;
  ensureLocalWriteAllowed: () => boolean;
  manageBusy: boolean;
  masterEditUnlocked: boolean;
  selectedSpool: InventorySpool | null;
  selectedSpoolAssignedSlot: InventoryPrinterSlotOption | null;
  selectedSpoolLocationDraft: string;
  selectedSpoolOwnerContactDraft: string;
  selectedSpoolOwnerNameDraft: string;
  selectedSpoolOwnershipDraft: OwnershipType;
  selectedSpoolOwnershipNoteDraft: string;
  selectedSpoolResolvedTare: number;
  selectedSpoolTareDraft: string;
  setConfirmDelete: Dispatch<SetStateAction<boolean>>;
  setConfirmPurge: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  setManageBusy: Dispatch<SetStateAction<boolean>>;
  setMasterEditUnlocked: Dispatch<SetStateAction<boolean>>;
  setSelectedSpoolOwnerContactDraft: Dispatch<SetStateAction<string>>;
  setSelectedSpoolOwnerNameDraft: Dispatch<SetStateAction<string>>;
  setSelectedSpoolOwnershipNoteDraft: Dispatch<SetStateAction<string>>;
  setSelectedSpoolTareDraft: Dispatch<SetStateAction<string>>;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

async function applyMeasuredWeightWithUsage(
  printerId: string,
  spoolId: string,
  previousRemaining: number | null | undefined,
  measuredTotalWeight: number,
  tareWeight: number,
  jobName?: string | null,
) {
  const plan = buildMeasuredWeightUpdatePlan({
    previousRemaining,
    measuredTotalWeight,
    tareWeight,
    jobName,
  });
  if (plan.kind === "usage") {
    await recordPrintUsage({
      printer_id: printerId,
      spool_id: spoolId,
      grams: plan.usedGrams,
      job_name: plan.jobName,
      success: true,
    });
    return;
  }
  if (plan.kind === "weight") {
    await updateInventorySpoolWeight(spoolId, plan.measuredTotalWeight);
    return;
  }
}

export function useInventorySpoolDetailActions({
  canUseClientHostWrite,
  clearSelectedSpoolDetail,
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  confirmDelete,
  confirmPurge,
  editMasterColorName,
  editMasterFilamentName,
  editMasterHexColor,
  editMasterMaterial,
  editMasterVendor,
  ensureLocalWriteAllowed,
  manageBusy,
  masterEditUnlocked,
  reloadActiveLoans,
  reloadCatalog,
  reloadPrinterOverview,
  reloadSpoolDetail,
  reloadSpools,
  selectedSpool,
  selectedSpoolAssignedSlot,
  selectedSpoolLocationDraft,
  selectedSpoolOwnerContactDraft,
  selectedSpoolOwnerNameDraft,
  selectedSpoolOwnershipDraft,
  selectedSpoolOwnershipNoteDraft,
  selectedSpoolResolvedTare,
  selectedSpoolTareDraft,
  setConfirmDelete,
  setConfirmPurge,
  setError,
  setInfoMessage,
  setManageBusy,
  setMasterEditUnlocked,
  setSelectedSpoolOwnerContactDraft,
  setSelectedSpoolOwnerNameDraft,
  setSelectedSpoolOwnershipNoteDraft,
  setSelectedSpoolTareDraft,
  tauriAvailable,
  t,
}: InventorySpoolDetailActionsInput) {
  const hostWriteTarget = { clientReadOnly, clientHostBaseUrl, clientLibraryId };

  async function reloadInventorySurfaces() {
    await reloadSpools();
    await reloadPrinterOverview();
    await reloadActiveLoans();
  }

  async function handleSaveMasterMetadata() {
    if (!ensureLocalWriteAllowed()) {
      return;
    }
    if (!tauriAvailable || !selectedSpool || manageBusy) {
      return;
    }
    if (!masterEditUnlocked) {
      setError(
        t(
          "inventory.error.unlockMetadataFirst",
          "Unlock roll metadata before editing catalog fields.",
        ),
      );
      return;
    }

    const vendor = editMasterVendor.trim() || "Manual";
    const material = editMasterMaterial.trim();
    const filamentName = editMasterFilamentName.trim();
    const colorName = editMasterColorName.trim();
    if (!material || !filamentName || !colorName) {
      setError(
        t(
          "inventory.error.masterFieldsRequired",
          "Material, filament name and color are required.",
        ),
      );
      return;
    }

    const rawHex = editMasterHexColor.trim();
    if (rawHex && !isValidSwatchColor(rawHex)) {
      setError(
        t(
          "inventory.error.invalidHex",
          "Invalid swatch. Use #RGB, #RRGGBB, multi(#RRGGBB,#RRGGBB) or gradient(#RRGGBB,#RRGGBB).",
        ),
      );
      return;
    }
    const hexColor = rawHex ? normalizeSwatchValue(rawHex, { uppercase: true }) : null;

    setManageBusy(true);
    setError(null);
    try {
      await updateMasterCatalogEntry({
        master_id: selectedSpool.masterId,
        vendor,
        material,
        filament_name: filamentName,
        color_name: colorName,
        hex_color: hexColor,
      });
      await reloadSpools();
      await reloadCatalog();
      await reloadActiveLoans();
      await reloadPrinterOverview();
      await reloadSpoolDetail(selectedSpool.id);
      setMasterEditUnlocked(false);
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(
          updateError,
          t("inventory.error.updateMetadata", "Failed to update roll metadata."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleSaveSpoolOwnership() {
    if (!tauriAvailable || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }

    const ownerName = selectedSpoolOwnerNameDraft.trim();
    const ownerContact = selectedSpoolOwnerContactDraft.trim();
    const ownershipNote = selectedSpoolOwnershipNoteDraft.trim();
    if (selectedSpoolOwnershipDraft === "BORROWED_IN" && !ownerName) {
      setError(
        t(
          "inventory.error.ownerNameRequired",
          "Borrowed-in rolls need an owner or counterparty name.",
        ),
      );
      return;
    }

    setConfirmDelete(false);
    setConfirmPurge(false);
    setManageBusy(true);
    setError(null);
    try {
      await updateInventorySpoolOwnership(
        {
          spool_id: selectedSpool.id,
          ownership_type: selectedSpoolOwnershipDraft,
          owner_name: selectedSpoolOwnershipDraft === "BORROWED_IN" ? ownerName : null,
          owner_contact: selectedSpoolOwnershipDraft === "BORROWED_IN" ? ownerContact || null : null,
          ownership_note: selectedSpoolOwnershipDraft === "BORROWED_IN" ? ownershipNote || null : null,
        },
        hostWriteTarget,
      );
      await reloadInventorySurfaces();
      await reloadSpoolDetail(selectedSpool.id);
      if (selectedSpoolOwnershipDraft === "OWNED") {
        setSelectedSpoolOwnerNameDraft("");
        setSelectedSpoolOwnerContactDraft("");
        setSelectedSpoolOwnershipNoteDraft("");
      }
      setInfoMessage(
        t("inventory.ownershipUpdated", "Roll ownership updated."),
      );
    } catch (ownershipError) {
      console.error(ownershipError);
      setError(
        commandErrorText(
          ownershipError,
          t("inventory.error.updateOwnership", "Failed to update roll ownership."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleDeleteSelected() {
    if (!tauriAvailable || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      setConfirmPurge(false);
      return;
    }
    setManageBusy(true);
    setError(null);
    try {
      await deleteInventorySpool(
        {
          spool_id: selectedSpool.id,
          reason: "manual removal",
        },
        hostWriteTarget,
      );
      clearSelectedSpoolDetail();
      await reloadInventorySurfaces();
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        commandErrorText(deleteError, t("inventory.error.deleteRoll", "Failed to delete roll.")),
      );
    } finally {
      setConfirmDelete(false);
      setManageBusy(false);
    }
  }

  async function handleMarkEmpty() {
    if (!tauriAvailable || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    setConfirmDelete(false);
    setConfirmPurge(false);
    setManageBusy(true);
    setError(null);
    try {
      if (selectedSpoolAssignedSlot) {
        await writePrinterSlotAssignment(hostWriteTarget, {
          printer_id: selectedSpoolAssignedSlot.printerId,
          slot_id: selectedSpoolAssignedSlot.slotId,
          spool_id: null,
        });
      }
      await updateInventorySpoolStatus(
        {
          spool_id: selectedSpool.id,
          qr_code: selectedSpool.qrCode ?? null,
          status: "EMPTY",
          location: selectedSpool.location ?? null,
        },
        hostWriteTarget,
      );
      await updateInventorySpoolWeight(selectedSpool.id, 0, hostWriteTarget);
      await reloadInventorySurfaces();
      await reloadSpoolDetail(selectedSpool.id);
    } catch (statusError) {
      console.error(statusError);
      setError(
        commandErrorText(
          statusError,
          t("inventory.error.markEmpty", "Failed to mark roll as empty."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleSaveSpoolLocation() {
    if (!tauriAvailable || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    const location = selectedSpoolLocationDraft.trim();
    setManageBusy(true);
    setError(null);
    try {
      await updateInventorySpoolDetails(
        {
          spool_id: selectedSpool.id,
          qr_code: selectedSpool.qrCode ?? null,
          status: selectedSpool.status,
          location: selectedSpool.location ?? null,
          home_location: location || null,
        },
        hostWriteTarget,
      );
      await reloadSpools();
      await reloadPrinterOverview();
      if (!clientReadOnly) {
        await reloadSpoolDetail(selectedSpool.id);
      }
      setInfoMessage(t("inventory.homeLocationSaved", "Home location saved."));
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(
          updateError,
          t("inventory.error.updateHomeLocation", "Failed to save home location."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleRefillSpool() {
    if (!tauriAvailable || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (selectedSpool.status !== "EMPTY") {
      return;
    }
    if ((selectedSpool.remainingGrams ?? 0) <= 0) {
      setError(
        t(
          "inventory.error.refillRequiresWeight",
          "Set measured total weight above empty spool weight before reactivating.",
        ),
      );
      return;
    }
    setManageBusy(true);
    setError(null);
    try {
      await updateInventorySpoolStatus(
        {
          spool_id: selectedSpool.id,
          qr_code: selectedSpool.qrCode ?? null,
          status: "IN_STOCK",
          location: selectedSpool.location ?? null,
        },
        hostWriteTarget,
      );
      await reloadInventorySurfaces();
      await reloadSpoolDetail(selectedSpool.id);
      setInfoMessage(t("inventory.refilled", "Roll reactivated and ready for use."));
    } catch (statusError) {
      console.error(statusError);
      setError(
        commandErrorText(
          statusError,
          t("inventory.error.refill", "Failed to reactivate roll."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleToggleLostStatus() {
    if (!tauriAvailable || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    const nextStatus: SpoolStatus = selectedSpool.status === "LOST" ? "IN_STOCK" : "LOST";
    setManageBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        if (nextStatus === "LOST" && selectedSpoolAssignedSlot) {
          setError(
            t(
              "inventory.clientAssignedStatusUnsupported",
              "Paired desktop status changes are not available while the roll is still loaded in a printer.",
            ),
          );
          return;
        }
      } else if (nextStatus === "LOST" && selectedSpoolAssignedSlot) {
        await writePrinterSlotAssignment(hostWriteTarget, {
          printer_id: selectedSpoolAssignedSlot.printerId,
          slot_id: selectedSpoolAssignedSlot.slotId,
          spool_id: null,
        });
      }
      await updateInventorySpoolStatus(
        {
          spool_id: selectedSpool.id,
          qr_code: selectedSpool.qrCode ?? null,
          status: nextStatus,
          location: selectedSpool.location ?? null,
        },
        hostWriteTarget,
      );
      await reloadInventorySurfaces();
      if (!clientReadOnly) {
        await reloadSpoolDetail(selectedSpool.id);
      }
      setInfoMessage(
        nextStatus === "LOST"
          ? t("inventory.markedLost", "Roll marked as lost.")
          : t("inventory.markedFound", "Roll restored to in stock."),
      );
    } catch (statusError) {
      console.error(statusError);
      setError(
        commandErrorText(
          statusError,
          t("inventory.error.toggleLost", "Failed to update lost status."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handlePurgeSelected() {
    if (!tauriAvailable || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!confirmPurge) {
      setConfirmPurge(true);
      setConfirmDelete(false);
      return;
    }
    setManageBusy(true);
    setError(null);
    try {
      await purgeInventorySpool(
        {
          spool_id: selectedSpool.id,
          reason: "manual purge",
        },
        hostWriteTarget,
      );
      clearSelectedSpoolDetail();
      await reloadInventorySurfaces();
    } catch (purgeError) {
      console.error(purgeError);
      setError(
        commandErrorText(purgeError, t("inventory.error.purgeRoll", "Failed to purge roll.")),
      );
    } finally {
      setConfirmPurge(false);
      setManageBusy(false);
    }
  }

  async function handleWeightSubmit(grams: number) {
    if (!selectedSpool || !tauriAvailable || manageBusy) {
      return;
    }
    if (!Number.isFinite(grams)) {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    setConfirmDelete(false);
    setConfirmPurge(false);
    const safeGrams = Math.max(0, Math.round(grams));
    setManageBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        if (selectedSpoolAssignedSlot) {
          setError(
            t(
              "inventory.clientAssignedWeightUnsupported",
              "Paired desktop weight updates are only available for rolls that are not currently loaded in a printer.",
            ),
          );
          return;
        }
        await updateInventorySpoolWeight(selectedSpool.id, safeGrams, hostWriteTarget);
        await reloadSpools();
        await reloadPrinterOverview();
        setInfoMessage(
          t(
            "inventory.clientWeightUpdated",
            "Weight updated on the host library.",
          ),
        );
        return;
      }
      if (selectedSpoolAssignedSlot) {
        await applyMeasuredWeightWithUsage(
          selectedSpoolAssignedSlot.printerId,
          selectedSpool.id,
          selectedSpool.remainingGrams,
          safeGrams,
          selectedSpoolResolvedTare,
          null,
        );
      } else {
        await updateInventorySpoolWeight(selectedSpool.id, safeGrams);
      }
      const calculatedRemaining = Math.max(0, safeGrams - selectedSpoolResolvedTare);
      if (selectedSpool.status === "EMPTY" && calculatedRemaining > 0) {
        await updateInventorySpoolStatus({
          spool_id: selectedSpool.id,
          qr_code: selectedSpool.qrCode ?? null,
          status: "IN_STOCK",
          location: selectedSpool.location ?? null,
        });
        setInfoMessage(t("inventory.refilledAuto", "Roll reactivated from new measured weight."));
      }
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadSpoolDetail(selectedSpool.id);
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(updateError, t("inventory.error.updateWeight", "Failed to update weight.")),
      );
    } finally {
      setManageBusy(false);
    }
  }

  async function handleSaveSpoolTareWeight() {
    if (!selectedSpool || !tauriAvailable || manageBusy) {
      return;
    }
    const parsed = Number.parseInt(selectedSpoolTareDraft, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    const safeGrams = Math.max(0, Math.round(parsed));
    setManageBusy(true);
    setError(null);
    try {
      if (clientReadOnly) {
        await updateInventorySpoolTareWeight(selectedSpool.id, safeGrams, hostWriteTarget);
        await reloadSpools();
        setSelectedSpoolTareDraft(String(safeGrams));
        setInfoMessage(
          t(
            "inventory.clientTareWeightUpdated",
            "Empty spool weight updated on the host library.",
          ),
        );
        return;
      }
      await updateInventorySpoolTareWeight(selectedSpool.id, safeGrams);
      await reloadSpools();
      await reloadSpoolDetail(selectedSpool.id);
      setInfoMessage(t("inventory.tareWeightUpdated", "Empty spool weight updated."));
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(
          updateError,
          t("inventory.error.updateTareWeight", "Failed to update empty spool weight."),
        ),
      );
    } finally {
      setManageBusy(false);
    }
  }

  return {
    handleDeleteSelected,
    handleMarkEmpty,
    handlePurgeSelected,
    handleRefillSpool,
    handleSaveMasterMetadata,
    handleSaveSpoolOwnership,
    handleSaveSpoolLocation,
    handleSaveSpoolTareWeight,
    handleToggleLostStatus,
    handleWeightSubmit,
  };
}
