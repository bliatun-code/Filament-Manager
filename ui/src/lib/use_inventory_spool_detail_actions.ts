import { useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { InventoryReloadReporter } from "./use_inventory_page_data";
import { isValidSwatchColor, normalizeSwatchValue } from "./color_utils";
import { commandErrorText, createAppError } from "./error_text";
import type { useI18n } from "./i18n";
import { isBorrowedInOwnership } from "./inventory_domain";
import { resolveInventoryLocationReferenceForWrite } from "./inventory_location_model";
import type { InventorySpool, OwnershipType } from "./inventory_list_model";
import type { InventoryLocationRow } from "./tauri_location_client";
import { parseInventorySpoolCommonDetailsDraft } from "./inventory_spool_detail_draft_model";
import { updateInventorySpoolDetails } from "./spool_writes";
import { updateManagedMasterCatalogEntry } from "./catalog_writes";
import {
  preparePurchaseReceiptMetadataUpdate,
  type PurchaseReceiptMetadataDraft,
  type PurchaseReceiptMetadataValidationErrors,
} from "./purchase_receipt_metadata";

type InventoryDetailReloads = {
  reloadActiveLoans: (report?: InventoryReloadReporter) => Promise<void>;
  reloadCatalog: (reportResult?: (successful: boolean) => void) => Promise<void>;
  reloadPrinterOverview: (report?: InventoryReloadReporter) => Promise<void>;
  reloadSpoolDetail: (spoolId: string, report?: InventoryReloadReporter) => Promise<void>;
  reloadSpools: (report?: InventoryReloadReporter) => Promise<void>;
};

type InventorySpoolDetailActionsInput = InventoryDetailReloads & {
  canUseClientHostWrite: () => boolean;
  cancelDangerZoneConfirmation: () => void;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientTargetGeneration: number | null;
  clientReadOnly: boolean;
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

export function useInventorySpoolDetailActions({
  canUseClientHostWrite,
  cancelDangerZoneConfirmation,
  clientHostBaseUrl,
  clientLibraryId,
  clientTargetGeneration,
  clientReadOnly,
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
  const hostWriteTarget = { clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration };
  const viewKey = JSON.stringify([selectedSpool?.id, clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration]);
  const view = useMemo(() => ({ key: viewKey }), [viewKey]);
  const commonKey = JSON.stringify([selectedSpool, locations, selectedSpoolLoanedOut, selectedSpoolResolvedTare,
    selectedSpoolLocationDraft, selectedSpoolOwnershipDraft, selectedSpoolOwnerNameDraft,
    selectedSpoolOwnerContactDraft, selectedSpoolOwnershipNoteDraft, selectedSpoolTareDraft,
    selectedSpoolPurchasePriceBatchLockedDraft, selectedSpoolPurchaseMetadataDraft]);
  const masterKey = JSON.stringify([selectedSpool?.masterId, masterEditUnlocked, editMasterVendor,
    editMasterMaterial, editMasterFilamentName, editMasterColorName, editMasterHexColor]);
  // Identity, rather than the serialized value alone, invalidates old A callbacks after A→B→A.
  const commonIntent = useMemo(() => ({ key: commonKey }), [commonKey]);
  const masterIntent = useMemo(() => ({ key: masterKey }), [masterKey]);
  const currentIntents = useRef({ common: commonIntent, master: masterIntent });
  type Kind = "common" | "master";
  type Scope = { view: typeof view; busy: boolean; committed: Partial<Record<Kind, object>> };
  const currentScope = useRef<Scope | null>(null);
  const [detailSaveError, setDetailSaveError] = useState<string | null>(null);
  useLayoutEffect(() => {
    currentIntents.current = { common: commonIntent, master: masterIntent };
  }, [commonIntent, masterIntent]);
  useLayoutEffect(() => {
    const scope: Scope = { view, busy: false, committed: {} };
    currentScope.current = scope;
    setDetailSaveError(null);
    return () => {
      currentScope.current = null;
      if (scope.busy) setManageBusy(false);
    };
  }, [view, setManageBusy]);
  useLayoutEffect(() => {
    if (manageBusy && !currentScope.current?.busy) setDetailSaveError(null);
  }, [manageBusy]);

  function canSubmit(kind: Kind) {
    const scope = currentScope.current;
    const intent = kind === "common" ? commonIntent : masterIntent;
    return Boolean(scope && scope.view === view && !scope.busy && !manageBusy && selectedSpool &&
      tauriAvailable && currentIntents.current[kind] === intent && scope.committed[kind] !== intent);
  }

  async function save(kind: Kind, write: () => Promise<unknown>, committed: () => void, failureMessage: string) {
    if (!canSubmit(kind) || !selectedSpool) return;
    const scope = currentScope.current!;
    const intent = kind === "common" ? commonIntent : masterIntent;
    const isCurrent = () => currentScope.current === scope && scope.view === view;
    scope.busy = true;
    setManageBusy(true);
    setDetailSaveError(null);
    setError(null);
    setInfoMessage(null);
    try {
      try {
        if (clientReadOnly && (!clientHostBaseUrl || !clientLibraryId ||
          !Number.isSafeInteger(clientTargetGeneration) || clientTargetGeneration! < 0)) {
          throw createAppError("common.invalid_request");
        }
        await write();
      } catch (updateError) {
        if (isCurrent()) setDetailSaveError(commandErrorText(updateError, failureMessage, t));
        return;
      }
      if (!isCurrent()) return;
      // Refresh can fail after storage has acknowledged the mutation. Keep those outcomes separate.
      scope.committed[kind] = intent;
      committed();
      let failed = false;
      const report: InventoryReloadReporter = (_domain, resolution) => {
        if (resolution !== "LIVE" && resolution !== "SUPERSEDED") failed = true;
      };
      const refreshes = [() => reloadSpools(report), () => reloadPrinterOverview(report),
        () => reloadActiveLoans(report), () => reloadSpoolDetail(selectedSpool.id, report)];
      if (kind === "master") {
        refreshes.push(() => reloadCatalog(successful => {
          if (!successful) failed = true;
        }));
      }
      const results = await Promise.allSettled(refreshes.map(refresh => Promise.resolve().then(refresh)));
      if (isCurrent() && (failed || results.some(result => result.status === "rejected"))) {
        setDetailSaveError(t("inventory.error.loadInventory", "Failed to load inventory."));
      }
    } finally {
      if (isCurrent()) {
        scope.busy = false;
        setManageBusy(false);
      }
    }
  }
  const currentLocationReference = selectedSpool
    ? resolveInventoryLocationReferenceForWrite(locations, selectedSpool.location, {
        id: selectedSpool.locationId,
        name: selectedSpool.location,
      })
    : null;

  async function handleSaveMasterMetadata() {
    if (!canSubmit("master") || !selectedSpool) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!masterEditUnlocked) {
      setDetailSaveError(
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
      setDetailSaveError(
        t(
          "inventory.error.masterFieldsRequired",
          "Material, filament name and color are required.",
        ),
      );
      return;
    }

    const rawHex = editMasterHexColor.trim();
    if (rawHex && !isValidSwatchColor(rawHex)) {
      setDetailSaveError(
        t(
          "inventory.error.invalidHex",
          "Invalid swatch. Use #RGB, #RRGGBB, multi(#RRGGBB,#RRGGBB) or gradient(#RRGGBB,#RRGGBB).",
        ),
      );
      return;
    }
    const hexColor = rawHex ? normalizeSwatchValue(rawHex, { uppercase: true }) : null;

    await save("master",
      () => updateManagedMasterCatalogEntry(
        {
          master_id: selectedSpool.masterId,
          vendor,
          material,
          filament_name: filamentName,
          color_name: colorName,
          hex_color: hexColor,
        },
        hostWriteTarget,
      ),
      () => {
        markMasterMetadataSaved();
        if (currentIntents.current.master === masterIntent) setMasterEditUnlocked(false);
      },
      t("inventory.error.updateMetadata", "Failed to update roll metadata."),
    );
  }

  async function handleSaveSpoolCommonDetails() {
    if (!canSubmit("common") || !selectedSpool) {
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
      setDetailSaveError(
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
      setDetailSaveError(
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
      setDetailSaveError(
        t(
          "errors.loanedSpoolEditBlocked",
          "Return the loan before editing this roll's status, location, or ownership.",
        ),
      );
      return;
    }

    cancelDangerZoneConfirmation();
      const tareWeightChanged =
        parsed.value.tareWeightGrams !== selectedSpoolResolvedTare;
      const purchasePriceBatchLockChanged =
        parsed.value.purchasePriceBatchLocked !==
        (selectedSpool.purchasePriceBatchLocked ?? false);
    await save("common",
      () => updateInventorySpoolDetails(
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
        { ...hostWriteTarget, reviewedAuthority: clientReadOnly
          ? { mode: "CLIENT", base_url: clientHostBaseUrl!, library_id: clientLibraryId!, target_generation: clientTargetGeneration! }
          : { mode: "LOCAL" } },
      ),
      () => {
        markCommonDetailsSaved();
        if (currentIntents.current.common === commonIntent) {
          if (!isBorrowedInOwnership(parsed.value.ownershipType)) {
            setSelectedSpoolOwnerNameDraft("");
            setSelectedSpoolOwnerContactDraft("");
            setSelectedSpoolOwnershipNoteDraft("");
          }
          setSelectedSpoolTareDraft(String(parsed.value.tareWeightGrams));
        }
        setInfoMessage(t("inventory.rollChangesSaved", "Roll changes saved."));
      },
      t("inventory.error.saveRollChanges", "Failed to save roll changes."),
    );
  }

  return { handleSaveMasterMetadata, handleSaveSpoolCommonDetails, detailSaveError };
}
