import type { Dispatch, SetStateAction } from "react";
import { isValidSwatchColor, normalizeSwatchValue } from "./color_utils";
import { commandErrorText } from "./error_text";
import type { useI18n } from "./i18n";
import { isBorrowedInOwnership } from "./inventory_domain";
import { resolveInventoryLocationReferenceForWrite } from "./inventory_location_model";
import type { InventorySpool, OwnershipType } from "./inventory_list_model";
import type { InventoryLocationRow } from "./tauri_location_client";
import { parseInventorySpoolCommonDetailsDraft } from "./inventory_spool_detail_draft_model";
import {
  canRefillSpoolStatus,
  nextLostToggleStatus,
  shouldReactivateSpoolFromMeasuredTotal,
} from "./inventory_spool_detail_actions_model";
import {
  deleteInventorySpool,
  purgeInventorySpool,
  updateInventorySpoolDetails,
  updateInventorySpoolOwnership,
  updateInventorySpoolStatus,
  updateInventorySpoolTareWeight,
  updateInventorySpoolWeight,
} from "./spool_writes";
import {
  writePreparedMeasuredWeightUpdate,
  writePrinterSlotAssignment,
} from "./printer_slot_writes";
import { prepareMeasuredWeightUpdate } from "./printer_slot_model";
import { updateManagedMasterCatalogEntry } from "./catalog_writes";
import type { InventoryPrinterSlotOption } from "./use_inventory_printer_slots";
import {
  preparePurchaseReceiptMetadataUpdate,
  type PurchaseReceiptMetadataDraft,
  type PurchaseReceiptMetadataValidationErrors,
} from "./purchase_receipt_metadata";

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
  locations: InventoryLocationRow[];
  markCommonDetailsSaved: () => void;
  markMasterMetadataSaved: () => void;
  masterEditUnlocked: boolean;
  selectedSpool: InventorySpool | null;
  selectedSpoolAssignedSlot: InventoryPrinterSlotOption | null;
  selectedSpoolLocationDraft: string;
  selectedSpoolLoanedOut: boolean;
  selectedSpoolOwnerContactDraft: string;
  selectedSpoolOwnerNameDraft: string;
  selectedSpoolOwnershipDraft: OwnershipType;
  selectedSpoolOwnershipNoteDraft: string;
  selectedSpoolPurchasePriceBatchLockedDraft: boolean;
  selectedSpoolPurchaseMetadataDraft: PurchaseReceiptMetadataDraft;
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
  setSelectedSpoolPurchaseMetadataErrors: Dispatch<
    SetStateAction<PurchaseReceiptMetadataValidationErrors>
  >;
  setSelectedSpoolTareDraft: Dispatch<SetStateAction<string>>;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

async function applyMeasuredWeightWithUsage(
  hostWriteTarget: {
    clientReadOnly: boolean;
    clientHostBaseUrl: string | null;
    clientLibraryId: string | null;
  },
  printerId: string,
  spoolId: string,
  previousRemaining: number | null | undefined,
  measuredTotalWeight: number,
  tareWeight: number,
) {
  await writePreparedMeasuredWeightUpdate(
    hostWriteTarget,
    printerId,
    spoolId,
    prepareMeasuredWeightUpdate(previousRemaining, measuredTotalWeight, tareWeight),
  );
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
  locations,
  markCommonDetailsSaved,
  markMasterMetadataSaved,
  masterEditUnlocked,
  reloadActiveLoans,
  reloadCatalog,
  reloadPrinterOverview,
  reloadSpoolDetail,
  reloadSpools,
  selectedSpool,
  selectedSpoolAssignedSlot,
  selectedSpoolLocationDraft,
  selectedSpoolLoanedOut,
  selectedSpoolOwnerContactDraft,
  selectedSpoolOwnerNameDraft,
  selectedSpoolOwnershipDraft,
  selectedSpoolOwnershipNoteDraft,
  selectedSpoolPurchasePriceBatchLockedDraft,
  selectedSpoolPurchaseMetadataDraft,
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
  setSelectedSpoolPurchaseMetadataErrors,
  setSelectedSpoolTareDraft,
  tauriAvailable,
  t,
}: InventorySpoolDetailActionsInput) {
  const hostWriteTarget = { clientReadOnly, clientHostBaseUrl, clientLibraryId };
  const currentLocationReference = selectedSpool
    ? resolveInventoryLocationReferenceForWrite(locations, selectedSpool.location, {
        id: selectedSpool.locationId,
        name: selectedSpool.location,
      })
    : null;

  async function reloadInventorySurfaces() {
    await reloadSpools();
    await reloadPrinterOverview();
    await reloadActiveLoans();
  }

  async function handleSaveMasterMetadata() {
    if (!tauriAvailable || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
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
      await updateManagedMasterCatalogEntry(
        {
          master_id: selectedSpool.masterId,
          vendor,
          material,
          filament_name: filamentName,
          color_name: colorName,
          hex_color: hexColor,
        },
        hostWriteTarget,
      );
      await reloadSpools();
      await reloadCatalog();
      await reloadActiveLoans();
      await reloadPrinterOverview();
      await reloadSpoolDetail(selectedSpool.id);
      markMasterMetadataSaved();
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

  async function handleSaveSpoolCommonDetails() {
    if (!tauriAvailable || !selectedSpool || manageBusy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }

    const parsed = parseInventorySpoolCommonDetailsDraft({
      homeLocation: selectedSpoolLocationDraft,
      ownershipType: selectedSpoolOwnershipDraft,
      ownerName: selectedSpoolOwnerNameDraft,
      ownerContact: selectedSpoolOwnerContactDraft,
      ownershipNote: selectedSpoolOwnershipNoteDraft,
      purchasePriceBatchLocked: selectedSpoolPurchasePriceBatchLockedDraft,
      purchaseMetadata: selectedSpoolPurchaseMetadataDraft,
      tareWeight: selectedSpoolTareDraft,
    });
    if (!parsed.ok) {
      setError(
        parsed.error === "borrowed-owner-required"
          ? t(
              "inventory.error.ownerNameRequired",
              "Borrowed-in rolls need an owner or counterparty name.",
            )
          : t("inventory.error.invalidWeight", "Weight value is invalid."),
      );
      return;
    }

    const purchaseMetadataBaseline = {
      purchase_price: selectedSpool.purchasePrice ?? null,
      purchase_currency: selectedSpool.purchaseCurrency ?? null,
      purchase_date: selectedSpool.purchaseDate ?? null,
      batch_code: selectedSpool.batchCode ?? null,
      supplier_reference: selectedSpool.supplierReference ?? null,
    };
    const purchaseMetadata = preparePurchaseReceiptMetadataUpdate(
      purchaseMetadataBaseline,
      selectedSpoolPurchaseMetadataDraft,
    );
    if (!purchaseMetadata.ok) {
      setSelectedSpoolPurchaseMetadataErrors(purchaseMetadata.errors);
      setError(
        t(
          "inventory.error.purchaseMetadataInvalid",
          "Review the highlighted purchase details.",
        ),
      );
      return;
    }
    setSelectedSpoolPurchaseMetadataErrors({});

    const homeLocationChanged =
      (selectedSpool.homeLocation ?? "").trim() !==
      (parsed.value.homeLocation ?? "");
    const ownershipChanged =
      selectedSpool.ownershipType !== parsed.value.ownershipType ||
      (isBorrowedInOwnership(parsed.value.ownershipType) &&
        ((selectedSpool.ownerName ?? "").trim() !== parsed.value.ownerName ||
          (selectedSpool.ownerContact ?? "").trim() !==
            (parsed.value.ownerContact ?? "") ||
          (selectedSpool.ownershipNote ?? "").trim() !==
            (parsed.value.ownershipNote ?? "")));
    if (selectedSpoolLoanedOut && (homeLocationChanged || ownershipChanged)) {
      setError(
        t(
          "errors.loanedSpoolEditBlocked",
          "Return the loan before editing this roll's status, location, or ownership.",
        ),
      );
      return;
    }

    setConfirmDelete(false);
    setConfirmPurge(false);
    setManageBusy(true);
    setError(null);
    try {
      const tareWeightChanged =
        parsed.value.tareWeightGrams !== selectedSpoolResolvedTare;
      const purchasePriceBatchLockChanged =
        parsed.value.purchasePriceBatchLocked !==
        (selectedSpool.purchasePriceBatchLocked ?? false);
      await updateInventorySpoolDetails(
        {
          spool_id: selectedSpool.id,
          qr_code: selectedSpool.qrCode ?? null,
          status: selectedSpool.status,
          location: currentLocationReference,
          ...(purchasePriceBatchLockChanged
            ? { purchase_price_batch_locked: parsed.value.purchasePriceBatchLocked }
            : {}),
          // An empty string deliberately means "clear" for the local Tauri command.
          // Serde cannot otherwise distinguish JSON null from an omitted nested Option.
          ...(homeLocationChanged
            ? {
                home_location: parsed.value.homeLocation
                  ? (resolveInventoryLocationReferenceForWrite(
                      locations,
                      parsed.value.homeLocation,
                      {
                        id: selectedSpool.homeLocationId,
                        name: selectedSpool.homeLocation,
                      },
                    ) ?? "")
                  : "",
              }
            : {}),
          ...(tareWeightChanged
            ? { spool_tare_weight_g: parsed.value.tareWeightGrams }
            : {}),
          ...(ownershipChanged
            ? {
                ownership: {
                  ownership_type: parsed.value.ownershipType,
                  owner_name: parsed.value.ownerName,
                  owner_contact: parsed.value.ownerContact,
                  ownership_note: parsed.value.ownershipNote,
                },
              }
            : {}),
          ...(purchaseMetadata.changed
            ? { purchase_metadata: purchaseMetadata.value }
            : {}),
        },
        hostWriteTarget,
      );
      markCommonDetailsSaved();
      await reloadInventorySurfaces();
      await reloadSpoolDetail(selectedSpool.id);
      if (!isBorrowedInOwnership(parsed.value.ownershipType)) {
        setSelectedSpoolOwnerNameDraft("");
        setSelectedSpoolOwnerContactDraft("");
        setSelectedSpoolOwnershipNoteDraft("");
      }
      setSelectedSpoolTareDraft(String(parsed.value.tareWeightGrams));
      setInfoMessage(t("inventory.rollChangesSaved", "Roll changes saved."));
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(
          updateError,
          t("inventory.error.saveRollChanges", "Failed to save roll changes."),
          t,
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
    const borrowedIn = isBorrowedInOwnership(selectedSpoolOwnershipDraft);
    if (borrowedIn && !ownerName) {
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
          owner_name: borrowedIn ? ownerName : null,
          owner_contact: borrowedIn ? ownerContact || null : null,
          ownership_note: borrowedIn ? ownershipNote || null : null,
        },
        hostWriteTarget,
      );
      await reloadInventorySurfaces();
      await reloadSpoolDetail(selectedSpool.id);
      if (!borrowedIn) {
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
        commandErrorText(
          deleteError,
          t("inventory.error.deleteRoll", "Failed to delete roll."),
          t,
        ),
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
          location: currentLocationReference,
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
    const location = resolveInventoryLocationReferenceForWrite(
      locations,
      selectedSpoolLocationDraft,
      {
        id: selectedSpool.homeLocationId,
        name: selectedSpool.homeLocation,
      },
    );
    setManageBusy(true);
    setError(null);
    try {
      await updateInventorySpoolDetails(
        {
          spool_id: selectedSpool.id,
          qr_code: selectedSpool.qrCode ?? null,
          status: selectedSpool.status,
          location: currentLocationReference,
          home_location: location,
        },
        hostWriteTarget,
      );
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadSpoolDetail(selectedSpool.id);
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
    if (!canRefillSpoolStatus(selectedSpool.status)) {
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
          location: currentLocationReference,
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
    const nextStatus = nextLostToggleStatus(selectedSpool.status);
    setManageBusy(true);
    setError(null);
    try {
      if (nextStatus === "LOST" && selectedSpoolAssignedSlot) {
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
          location: currentLocationReference,
        },
        hostWriteTarget,
      );
      await reloadInventorySurfaces();
      await reloadSpoolDetail(selectedSpool.id);
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
      let successMessage: string | null = null;
      if (selectedSpoolAssignedSlot) {
        await applyMeasuredWeightWithUsage(
          hostWriteTarget,
          selectedSpoolAssignedSlot.printerId,
          selectedSpool.id,
          selectedSpool.remainingGrams,
          safeGrams,
          selectedSpoolResolvedTare,
        );
      } else {
        await updateInventorySpoolWeight(selectedSpool.id, safeGrams, hostWriteTarget);
      }
      if (
        shouldReactivateSpoolFromMeasuredTotal(
          selectedSpool.status,
          safeGrams,
          selectedSpoolResolvedTare,
        )
      ) {
        await updateInventorySpoolStatus(
          {
            spool_id: selectedSpool.id,
            qr_code: selectedSpool.qrCode ?? null,
            status: "IN_STOCK",
            location: currentLocationReference,
          },
          hostWriteTarget,
        );
        successMessage = t("inventory.refilledAuto", "Roll reactivated from new measured weight.");
      }
      await reloadSpools();
      await reloadPrinterOverview();
      await reloadSpoolDetail(selectedSpool.id);
      if (clientReadOnly) {
        successMessage ??= t(
          "inventory.clientWeightUpdated",
          "Weight updated on the host library.",
        );
      }
      if (successMessage) {
        setInfoMessage(successMessage);
      }
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
        await reloadSpoolDetail(selectedSpool.id);
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
    handleSaveSpoolCommonDetails,
    handleSaveSpoolOwnership,
    handleSaveSpoolLocation,
    handleSaveSpoolTareWeight,
    handleToggleLostStatus,
    handleWeightSubmit,
  };
}
