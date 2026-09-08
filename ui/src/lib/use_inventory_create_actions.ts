import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { commandErrorText, createAppError } from "./error_text";
import { catalogSpoolBatchErrorText } from "./catalog_spool_batch_errors";
import { BambuBatchRegistrationController, type BambuBatchRegistrationDraft } from "./bambu_batch_registration";
import { catalogSpoolBatchTargetKey, createCatalogSpoolBatch, type CatalogSpoolBatchTarget } from "./tauri_catalog_spool_batch_client";
import type { BambuFilamentCodeBatch } from "./bambu_filament_code_batch";
import { isBorrowedInOwnership } from "./inventory_domain";
import {
  buildBambuCatalogBatchCreateRequests,
  buildInventoryCreateSpoolRequest,
  type InventoryCreateBatchError,
  type InventoryCreateMode,
  type InventoryCreateSpoolError,
} from "./inventory_create_model";
import { formatInventoryDisplayTitle, type OwnershipType } from "./inventory_list_model";
import type { InventoryCreateSuccess } from "./inventory_create_success";
import type { PurchaseReceiptMetadata } from "./purchase_receipt_metadata";
import {
  createInventorySpoolFromMaster,
  createManualInventorySpool,
} from "./spool_writes";
import type { useI18n } from "./i18n";
import type { MasterCatalogRow, WishlistItemRow } from "./tauri_client";
import {
  buildWishlistDraft,
  canStockWishlistItem,
  createWishlistEntry,
  deleteWishlistEntry,
  receiveWishlistEntry,
  updateWishlistEntryStatus,
  type WishlistStatus,
} from "./wishlist_data_source";

function newRegistrationSpoolId(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `spool_${suffix}`;
}

const batchControllers = new Map<string, BambuBatchRegistrationController>();
function batchControllerFor(target: CatalogSpoolBatchTarget): BambuBatchRegistrationController | null {
  const key = catalogSpoolBatchTargetKey(target);
  if (!key || typeof window === "undefined") return null;
  let controller = batchControllers.get(key);
  if (!controller) {
    controller = new BambuBatchRegistrationController(key, {
      create: input => createCatalogSpoolBatch(input, target),
      storage: {
        getItem: key => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
        removeItem: key => window.localStorage.removeItem(key),
      },
    });
    batchControllers.set(key, controller);
  }
  return controller;
}
const emptyBatchSnapshot = () => null;
const emptyBatchSubscription = () => () => {};

type InventoryCreateActionsInput = {
  borrowedFromContact: string;
  borrowedFromName: string;
  borrowedInNote: string;
  bambuCodeBatch: BambuFilamentCodeBatch;
  bambuBatchInput?: string;
  busy: boolean;
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  clientTargetGeneration: number | null;
  confirmWishlistRemoveId: string | null;
  createMode: InventoryCreateMode;
  createSessionId: number;
  ensureLocalWriteAllowed: () => boolean;
  manualColorName: string;
  manualFilamentName: string;
  manualHexColor: string;
  manualMaterial: string;
  manualVendor: string;
  newInitialWeight: string;
  newLocation: string;
  newOwnershipType: OwnershipType;
  onSpoolCreated: (receipt: InventoryCreateSuccess) => void;
  onWishlistItemCreated: () => void;
  reloadCatalog: () => Promise<void>;
  reloadSpools: () => Promise<void>;
  reloadWishlist: () => Promise<void>;
  resetAfterCreatedSpool: () => void;
  resetBambuBatchInput: () => void;
  restoreBambuBatchDraft?: (draft: BambuBatchRegistrationDraft) => void;
  selectedBambuMaster: MasterCatalogRow | null;
  selectedEsunMaster: MasterCatalogRow | null;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setConfirmWishlistRemoveId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  setRecentlyAddedSpoolId: Dispatch<SetStateAction<string | null>>;
  setSelectedSpoolId: Dispatch<SetStateAction<string | null>>;
  tauriAvailable: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryCreateActions({
  borrowedFromContact,
  borrowedFromName,
  borrowedInNote,
  bambuCodeBatch,
  bambuBatchInput = "",
  busy,
  canUseClientHostWrite,
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  clientTargetGeneration,
  confirmWishlistRemoveId,
  createMode,
  createSessionId,
  ensureLocalWriteAllowed,
  manualColorName,
  manualFilamentName,
  manualHexColor,
  manualMaterial,
  manualVendor,
  newInitialWeight,
  newLocation,
  newOwnershipType,
  onSpoolCreated,
  onWishlistItemCreated,
  reloadCatalog,
  reloadSpools,
  reloadWishlist,
  resetAfterCreatedSpool,
  resetBambuBatchInput,
  restoreBambuBatchDraft,
  selectedBambuMaster,
  selectedEsunMaster,
  setBusy,
  setConfirmWishlistRemoveId,
  setError,
  setInfoMessage,
  setRecentlyAddedSpoolId,
  setSelectedSpoolId,
  tauriAvailable,
  t,
}: InventoryCreateActionsInput) {
  const hostWriteTarget = { clientReadOnly, clientHostBaseUrl, clientLibraryId };
  const batchController = useMemo(() => batchControllerFor({
    clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration,
  }), [clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration]);
  const rawBatchRegistration = useSyncExternalStore(
    batchController?.subscribe ?? emptyBatchSubscription,
    batchController?.snapshot ?? emptyBatchSnapshot,
    emptyBatchSnapshot,
  );
  const batchRegistration = rawBatchRegistration ? {
    ...rawBatchRegistration,
    error: rawBatchRegistration.error ? catalogSpoolBatchErrorText(
      createAppError(rawBatchRegistration.error),
      t("inventory.error.createBambuBatch", "Failed to create Bambu code batch. Check QR uniqueness and values."), t,
    ) : null,
  } : null;
  const registrationScopeKey = JSON.stringify([
    clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration, createSessionId,
  ]);
  const registrationScopeRef = useRef<{ key: string; inFlight: boolean; completed: boolean } | null>(null);
  useLayoutEffect(() => {
    const scope = { key: registrationScopeKey, inFlight: false, completed: false };
    registrationScopeRef.current = scope;
    return () => {
      registrationScopeRef.current = null;
      if (scope.inFlight) {
        scope.inFlight = false;
        setBusy(false);
      }
    };
  }, [registrationScopeKey, setBusy]);
  const batchUi = useRef({ reloadSpools, reloadCatalog, resetAfterCreatedSpool,
    setSelectedSpoolId, setRecentlyAddedSpoolId, setError, t });
  useLayoutEffect(() => {
    batchUi.current = { reloadSpools, reloadCatalog, resetAfterCreatedSpool,
      setSelectedSpoolId, setRecentlyAddedSpoolId, setError, t };
  });
  const consumedBatch = useRef<string | null>(null);
  useEffect(() => {
    const snapshot = batchController?.snapshot();
    if (!snapshot || snapshot.status !== "COMPLETE") return;
    const key = JSON.stringify([clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration, snapshot.batchId]);
    if (consumedBatch.current === key) return;
    consumedBatch.current = key;
    const ui = batchUi.current;
    const scope = registrationScopeRef.current;
    const lastId = snapshot.spoolIds.at(-1) ?? null;
    ui.setSelectedSpoolId(lastId);
    ui.setRecentlyAddedSpoolId(lastId);
    ui.resetAfterCreatedSpool();
    let current = true;
    void Promise.allSettled([ui.reloadSpools(), ui.reloadCatalog()]).then(results => {
      if (!current || registrationScopeRef.current !== scope) return;
      const failure = results.find(result => result.status === "rejected");
      if (failure?.status === "rejected") ui.setError(commandErrorText(
        failure.reason, ui.t("inventory.error.loadInventory", "Failed to load inventory."), ui.t,
      ));
    });
    return () => { current = false; };
  }, [batchController, rawBatchRegistration?.status, rawBatchRegistration?.batchId, registrationScopeKey,
    clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration]);
  const newSpoolBorrowedIn = isBorrowedInOwnership(newOwnershipType);
  const currentCreateDraft = useMemo(
    () =>
      buildWishlistDraft({
        source: createMode,
        selectedBambuMaster,
        selectedEsunMaster,
        manualVendor,
        manualMaterial,
        manualFilamentName,
        manualColorName,
      }),
    [
      createMode,
      manualColorName,
      manualFilamentName,
      manualMaterial,
      manualVendor,
      selectedBambuMaster,
      selectedEsunMaster,
    ],
  );

  function canStartWrite(): boolean {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return false;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return false;
    }
    return tauriAvailable && !busy && !registrationScopeRef.current?.inFlight &&
      batchController?.snapshot()?.status !== "SAVING";
  }

  function beginWrite() {
    const scope = registrationScopeRef.current;
    if (!scope || scope.key !== registrationScopeKey || !canStartWrite()) {
      return null;
    }
    // A React state update alone does not reject two callbacks before the next render.
    scope.inFlight = true;
    setBusy(true);
    setError(null);
    return scope;
  }

  function beginRegistration() {
    if (registrationScopeRef.current?.completed) return null;
    return beginWrite();
  }

  function showCreateValidationError(error: InventoryCreateSpoolError | InventoryCreateBatchError) {
    if (error === "BORROWED_OWNER_REQUIRED") {
      setError(
        t(
          "inventory.error.borrowedInNeedsOwner",
          "Borrowed-in registration needs a name for who the spool is borrowed from.",
        ),
      );
    } else if (error === "BAMBU_MASTER_REQUIRED") {
      setError(t("inventory.error.selectBambuFirst", "Select a Bambu filament first."));
    } else if (error === "ESUN_MASTER_REQUIRED") {
      setError(t("inventory.error.selectEsunFirst", "Select an eSUN filament first."));
    } else if (error === "INITIAL_WEIGHT_INVALID") {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
    } else if (error === "BATCH_EMPTY") {
      setError(
        t(
          "inventory.error.bambuBatchEmpty",
          "Paste at least one Bambu Filament Code with a ready catalog match.",
        ),
      );
    } else {
      setError(
        t(
          "inventory.error.manualNeedsFields",
          "Manual create needs filament name and color.",
        ),
      );
    }
  }

  async function handleCreateSpool() {
    if (batchController?.snapshot()) return;
    if (!canStartWrite()) {
      return;
    }
    const id = newRegistrationSpoolId();
    const createRequest = buildInventoryCreateSpoolRequest({
      id,
      mode: createMode,
      selectedBambuMaster,
      selectedEsunMaster,
      manualVendor,
      manualMaterial,
      manualFilamentName,
      manualColorName,
      manualHexColor,
      initialWeightRaw: newInitialWeight,
      ownershipType: newOwnershipType,
      borrowedFromName,
      borrowedFromContact,
      borrowedInNote,
      location: newLocation,
    });
    if (!createRequest.ok) {
      showCreateValidationError(createRequest.error);
      return;
    }
    const message = `${
      newSpoolBorrowedIn
        ? t("inventory.borrowedInRegistered", "Borrowed-in spool registered")
        : t("inventory.addedToInventory", "Added to inventory")
    }: ${createRequest.addedLabel}`;
    const scope = beginRegistration();
    if (!scope) {
      return;
    }
    const isCurrent = () => registrationScopeRef.current === scope;

    try {
      let createdSpoolId: string;
      try {
        createdSpoolId = createRequest.kind === "catalog"
          ? await createInventorySpoolFromMaster(createRequest.input, hostWriteTarget)
          : await createManualInventorySpool(createRequest.input, hostWriteTarget);
      } catch (createError) {
        if (isCurrent()) {
          console.error(createError);
          setError(commandErrorText(
            createError,
            t("inventory.error.createSpool", "Failed to create spool. Check QR uniqueness and values."),
            t,
          ));
        }
        return;
      }
      if (!isCurrent()) {
        return;
      }

      scope.completed = true;
      const receipt: InventoryCreateSuccess = Object.freeze({ spoolId: createdSpoolId, message });
      setSelectedSpoolId(createdSpoolId);
      setRecentlyAddedSpoolId(createdSpoolId);
      setInfoMessage(message);
      resetAfterCreatedSpool();
      onSpoolCreated(receipt);

      // Refreshing cannot turn a confirmed registration back into a retryable write.
      const refreshed = await Promise.allSettled([reloadSpools(), reloadCatalog()]);
      const failed = refreshed.find((result) => result.status === "rejected");
      if (isCurrent() && failed?.status === "rejected") {
        console.error(failed.reason);
        setError(commandErrorText(
          failed.reason,
          t("inventory.error.loadInventory", "Failed to load inventory."),
          t,
        ));
      }
    } finally {
      if (isCurrent()) {
        scope.inFlight = false;
        setBusy(false);
      }
    }
  }

  async function handleCreateBambuCodeBatch() {
    if (!canStartWrite()) {
      return;
    }
    if (createMode !== "bambu") {
      setError(
        t(
          "inventory.error.bambuBatchWrongMode",
          "Switch to Bambu source before creating a Filament Code batch.",
        ),
      );
      return;
    }
    if (batchController?.snapshot()) return;
    const batchRequest = buildBambuCatalogBatchCreateRequests({
      idPrefix: newRegistrationSpoolId(),
      selectedMasters: bambuCodeBatch.creatableRows
        .map((row) => row.master)
        .filter((master): master is MasterCatalogRow => Boolean(master)),
      initialWeightRaw: newInitialWeight,
      ownershipType: newOwnershipType,
      borrowedFromName,
      borrowedFromContact,
      borrowedInNote,
      location: newLocation,
    });
    if (!batchRequest.ok) {
      showCreateValidationError(batchRequest.error);
      return;
    }
    if (batchRequest.requests.length > 100) {
      setError(catalogSpoolBatchErrorText(createAppError("inventory.batch.invalid"),
        t("inventory.error.createBambuBatch", "Failed to create Bambu code batch. Check QR uniqueness and values."), t));
      return;
    }
    const scope = beginRegistration();
    if (!scope) {
      return;
    }
    try {
      if (!batchController) throw createAppError("common.forbidden");
      const first = batchRequest.requests[0].input;
      await batchController.start({
        input: {
          batch_id: crypto.randomUUID(),
          master_ids: batchRequest.requests.map(request => request.input.master_id),
          initial_weight_g: first.initial_weight_g!,
          ownership_type: newSpoolBorrowedIn ? "BORROWED_IN" : "OWNED",
          owner_name: first.owner_name ?? null,
          owner_contact: first.owner_contact ?? null,
          ownership_note: first.ownership_note ?? null,
          location: first.location_id ?? null,
        },
        rows: bambuCodeBatch.creatableRows.map(row => ({
          label: formatInventoryDisplayTitle(row.master!.material, row.master!.filament_name, row.master!.color_name),
          code: row.code,
        })),
        rawInput: bambuBatchInput,
        selections: Object.fromEntries(bambuCodeBatch.creatableRows.map(row => [row.key, row.master!.id])),
        remainingInput: (bambuCodeBatch.blockedRows ?? []).map(row => row.sourceText).join("\n"),
        remainingCount: bambuCodeBatch.blockedRows?.length ?? 0,
      });
    } catch (batchError) {
      if (registrationScopeRef.current !== scope) return;
      console.error(batchError);
      setError(
        catalogSpoolBatchErrorText(
          batchError,
          t(
            "inventory.error.createBambuBatch",
            "Failed to create Bambu code batch. Check QR uniqueness and values.",
          ),
          t,
        ),
      );
    } finally {
      if (registrationScopeRef.current === scope) {
        scope.inFlight = false;
        setBusy(false);
      }
    }
  }

  async function handleRetryBambuBatch() {
    if (!batchController || batchController.snapshot()?.status !== "UNCERTAIN") return;
    const scope = beginRegistration();
    if (!scope) return;
    try { await batchController.retry(); }
    catch (error) {
      if (registrationScopeRef.current === scope) setError(catalogSpoolBatchErrorText(error,
        t("inventory.error.createBambuBatch", "Failed to create Bambu code batch. Check QR uniqueness and values."), t));
    } finally {
      if (registrationScopeRef.current === scope) { scope.inFlight = false; setBusy(false); }
    }
  }

  function handleNewBambuBatch() {
    if (busy || !batchController || registrationScopeRef.current?.key !== registrationScopeKey) return;
    try {
      const draft = batchController.nextDraft();
      if (!draft) return;
      resetBambuBatchInput();
      restoreBambuBatchDraft?.(draft);
      setError(null);
      setInfoMessage(null);
    } catch (error) {
      setError(catalogSpoolBatchErrorText(error,
        t("inventory.error.createBambuBatch", "Failed to create Bambu code batch. Check QR uniqueness and values."), t));
    }
  }

  async function handleAddCurrentToWishlist() {
    if (!canStartWrite()) {
      return;
    }
    if (!currentCreateDraft) {
      setError(
        t(
          "wishlist.error.invalidSelection",
          "Pick a valid filament setup before adding to wishlist.",
        ),
      );
      return;
    }
    const scope = beginWrite();
    if (!scope) return;
    const isCurrent = () => registrationScopeRef.current === scope;
    try {
      await createWishlistEntry(
        {
          id: `wish_${Date.now()}`,
          master_id: currentCreateDraft.master_id ?? null,
          vendor: currentCreateDraft.vendor,
          material: currentCreateDraft.material,
          filament_name: currentCreateDraft.filament_name,
          color_name: currentCreateDraft.color_name,
          quantity: 1,
          note: null,
        },
        hostWriteTarget,
      );
      if (!isCurrent()) return;
      await reloadWishlist();
      if (!isCurrent()) return;
      setInfoMessage(
        `${t("inventory.wishlistOrders", "Wishlist & orders")}: ${formatInventoryDisplayTitle(
          currentCreateDraft.material,
          currentCreateDraft.filament_name,
          currentCreateDraft.color_name,
        )}`,
      );
      resetAfterCreatedSpool();
      onWishlistItemCreated();
    } catch (wishlistError) {
      if (!isCurrent()) return;
      console.error(wishlistError);
      setError(t("wishlist.error.add", "Failed to add wishlist item."));
    } finally {
      if (isCurrent()) {
        scope.inFlight = false;
        setBusy(false);
      }
    }
  }

  async function handleWishlistStatus(itemId: string, status: WishlistStatus) {
    if (!canStartWrite()) {
      return;
    }
    const scope = beginWrite();
    if (!scope) return;
    const isCurrent = () => registrationScopeRef.current === scope;
    setConfirmWishlistRemoveId(null);
    try {
      await updateWishlistEntryStatus(
        {
          item_id: itemId,
          status,
        },
        hostWriteTarget,
      );
      if (!isCurrent()) return;
      await reloadWishlist();
    } catch (statusError) {
      if (!isCurrent()) return;
      console.error(statusError);
      setError(t("wishlist.error.updateStatus", "Failed to update wishlist status."));
    } finally {
      if (isCurrent()) {
        scope.inFlight = false;
        setBusy(false);
      }
    }
  }

  async function handleDeleteWishlistItem(itemId: string) {
    if (confirmWishlistRemoveId !== itemId) {
      return;
    }
    if (!canStartWrite()) {
      return;
    }
    const scope = beginWrite();
    if (!scope) return;
    const isCurrent = () => registrationScopeRef.current === scope;
    setConfirmWishlistRemoveId(null);
    setInfoMessage(null);
    try {
      await deleteWishlistEntry(itemId, hostWriteTarget);
      if (!isCurrent()) return;
      await reloadWishlist();
    } catch (deleteError) {
      if (!isCurrent()) return;
      console.error(deleteError);
      setError(t("wishlist.error.delete", "Failed to delete wishlist item."));
    } finally {
      if (isCurrent()) {
        scope.inFlight = false;
        setBusy(false);
      }
    }
  }

  async function handleStockFromWishlist(
    item: WishlistItemRow,
    quantity: number,
    purchaseMetadata?: PurchaseReceiptMetadata,
    homeLocation?: string,
  ): Promise<boolean> {
    if (!canStockWishlistItem(item.status)) {
      return false;
    }
    if (!canStartWrite()) {
      return false;
    }
    const scope = beginWrite();
    if (!scope) return false;
    const isCurrent = () => registrationScopeRef.current === scope;
    setConfirmWishlistRemoveId(null);
    try {
      const receipt = await receiveWishlistEntry(
        {
          item_id: item.id,
          quantity,
          ...(homeLocation?.trim() ? { home_location: homeLocation.trim() } : {}),
          ...(purchaseMetadata === undefined
            ? {}
            : { purchase_metadata: purchaseMetadata }),
        },
        hostWriteTarget,
      );
      if (!isCurrent()) return false;
      // The receipt is already committed. A failed read must not leave a
      // retryable receipt draft that could create the same rolls again.
      try {
        const refreshed = await Promise.allSettled([reloadSpools(), reloadWishlist()]);
        const failed = refreshed.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") {
          throw failed.reason;
        }
      } catch (refreshError) {
        if (isCurrent()) {
          console.error(refreshError);
          setError(commandErrorText(
            refreshError,
            t("inventory.error.loadInventory", "Failed to load inventory."),
            t,
          ));
        }
      }
      if (!isCurrent()) return false;
      const createdSpoolId = receipt.spool_ids[0] ?? null;
      setSelectedSpoolId(createdSpoolId);
      setRecentlyAddedSpoolId(createdSpoolId);
      setInfoMessage(
        t("wishlist.receiptComplete", "Received {count} × {item}. Remaining: {remaining}.", {
          count: receipt.received_quantity,
          item: formatInventoryDisplayTitle(item.material, item.filament_name, item.color_name),
          remaining: receipt.remaining_quantity,
        }),
      );
      return true;
    } catch (stockError) {
      if (!isCurrent()) return false;
      console.error(stockError);
      setError(
        commandErrorText(
          stockError,
          t(
            "inventory.error.stockFromWishlist",
            "Failed to stock roll from wishlist item.",
          ),
          t,
        ),
      );
      return false;
    } finally {
      if (isCurrent()) {
        scope.inFlight = false;
        setBusy(false);
      }
    }
  }

  return {
    batchRegistration,
    batchBusy: rawBatchRegistration?.status === "SAVING",
    handleRetryBambuBatch,
    handleNewBambuBatch,
    currentCreateDraft,
    handleAddCurrentToWishlist,
    handleCreateBambuCodeBatch,
    handleCreateSpool,
    handleDeleteWishlistItem,
    handleStockFromWishlist,
    handleWishlistStatus,
  };
}
