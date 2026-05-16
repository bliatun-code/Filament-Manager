import { t } from "./companion_i18n.js";
import { createCompanionLoanMutations } from "./companion_loan_mutations.js";
import { createCompanionMutationHelpers } from "./companion_mutation_helpers.js";
import { createCompanionPrinterMutations } from "./companion_printer_mutations.js";
import { createCompanionSpoolMutations } from "./companion_spool_mutations.js";
import { createCompanionWishlistMutations } from "./companion_wishlist_mutations.js";
import { suggestSwatchHex } from "./companion_theme.js";

export function createCompanionMutations(options) {
  const {
    state,
    fetchJson,
    refreshOverview,
    setBusy,
    setStatus,
    render,
    clearDetailFeedback,
    setDetailFeedback,
    createBorrowedInDraft,
    setDetailReturnContext,
    openSpoolDetail,
  } = options;
  const locale = () => state.locale || "en";
  const tr = (key, fallback, params = undefined) => t(locale(), key, fallback, params);
  const {
    findSpoolRow,
    normalizeAddSpoolValues,
    normalizeMeasuredFilamentWeight,
    postJson,
    translateKnownCompanionError,
  } = createCompanionMutationHelpers({ state, fetchJson, tr });
  const { submitPrinterSlotAssignment, submitPrinterSlotOperation } =
    createCompanionPrinterMutations({
      state,
      fetchJson,
      refreshOverview,
      setBusy,
      setStatus,
      render,
      clearDetailFeedback,
      setDetailFeedback,
      tr,
      findSpoolRow,
    });
  const { submitBorrowedInHandBack, submitSpoolLoan, submitSpoolLoanReturn } =
    createCompanionLoanMutations({
      state,
      fetchJson,
      refreshOverview,
      setBusy,
      setStatus,
      render,
      clearDetailFeedback,
      setDetailFeedback,
      tr,
      findSpoolRow,
      normalizeMeasuredFilamentWeight,
    });
  const { submitWishlistCreate, submitWishlistStatus, submitWishlistStock } =
    createCompanionWishlistMutations({
      state,
      refreshOverview,
      setBusy,
      setStatus,
      render,
      setDetailFeedback,
      setDetailReturnContext,
      tr,
      normalizeAddSpoolValues,
      postJson,
    });
  const {
    submitBorrowedInUpdate,
    submitPrinterSlotWeightUpdate,
    submitQrLookup,
    submitSpoolDetailsUpdate,
    submitSpoolRfidUpdate,
    submitTareWeightUpdate,
    submitWeightUpdate,
  } = createCompanionSpoolMutations({
    state,
    fetchJson,
    refreshOverview,
    setBusy,
    setStatus,
    render,
    clearDetailFeedback,
    setDetailFeedback,
    tr,
    translateKnownCompanionError,
    openSpoolDetail,
  });

  async function submitManualSpoolRegistration(values) {
    const draft = normalizeAddSpoolValues(values);
    if (draft.source !== "manual" && !draft.master) {
      setStatus(tr("status.stockCatalogRequired", "Choose a catalog filament before adding stock."), "error");
      render();
      return;
    }
    if (draft.source === "manual" && !draft.material) {
      setStatus(tr("status.manualMaterialRequired", "Enter a material before adding a manual spool."), "error");
      render();
      return;
    }
    if (draft.source === "manual" && !draft.filamentName) {
      setStatus(tr("status.manualFilamentRequired", "Enter a filament name before adding a manual spool."), "error");
      render();
      return;
    }
    if (draft.source === "manual" && !draft.colorName) {
      setStatus(tr("status.manualColorRequired", "Enter a color before adding a manual spool."), "error");
      render();
      return;
    }
    if (draft.ownershipType === "BORROWED_IN" && !draft.ownerName) {
      setStatus(tr("status.borrowedInOwnerRequired", "Enter who the borrowed-in spool is borrowed from."), "error");
      render();
      return;
    }
    if (draft.hexColorText && !draft.normalizedHexColor) {
      setStatus(tr("status.swatchHexInvalid", "Enter a valid swatch hex with #RGB or #RRGGBB."), "error");
      render();
      return;
    }
    if (
      draft.initialWeightText &&
      (!Number.isFinite(draft.parsedInitialWeight) || draft.parsedInitialWeight < 0)
    ) {
      setStatus(
        tr("status.startingWeightInvalid", "Enter a valid non-negative starting weight in grams."),
        "error",
      );
      render();
      return;
    }

    const requestPath =
      draft.ownershipType === "BORROWED_IN" ? "/api/v1/spools/borrowed-in" : "/api/v1/spools/owned";
    const requestBody =
      draft.source === "manual"
        ? {
            material: draft.material,
            filament_name: draft.filamentName,
            color_name: draft.colorName,
            vendor: draft.vendor || null,
            initial_weight_g: draft.initialWeight,
            location: draft.location || null,
            hex_color:
              draft.normalizedHexColor ||
              suggestSwatchHex(
                draft.colorName,
                draft.filamentName,
                draft.vendor,
                draft.material,
              ),
            ...(draft.ownershipType === "BORROWED_IN"
              ? {
                  owner_name: draft.ownerName,
                  owner_contact: draft.ownerContact || null,
                  ownership_note: draft.note || null,
                }
              : {}),
          }
        : {
            master_id: draft.master.id,
            initial_weight_g: draft.initialWeight,
            location: draft.location || null,
            ...(draft.ownershipType === "BORROWED_IN"
              ? {
                  owner_name: draft.ownerName,
                  owner_contact: draft.ownerContact || null,
                  ownership_note: draft.note || null,
                }
              : {}),
          };

    setBusy(true);
    setStatus(
      draft.ownershipType === "BORROWED_IN"
        ? tr("status.borrowedInRegistering", "Registering borrowed-in spool...")
        : tr("status.stockAdding", "Adding spool to inventory..."),
      "default",
    );
    try {
      const payload = await postJson(requestPath, requestBody);
      const spoolId = String(payload?.spool_id || "").trim();
      state.activeTaskSheet = null;
      state.showBorrowedInForm = false;
      state.borrowedInDraft = createBorrowedInDraft();
      state.activeRootFlow = "storage";
      if (spoolId) {
        state.selectedSpoolId = spoolId;
        setDetailReturnContext("storage");
        state.detailOpen = true;
      }
      await refreshOverview();
      if (spoolId) {
        setDetailFeedback(
          spoolId,
          draft.ownershipType === "BORROWED_IN"
            ? tr("status.borrowedInRegisteredJustNow", "Borrowed-in spool registered just now.")
            : tr("status.stockAddedJustNow", "Spool added to inventory just now."),
        );
      }
      setStatus(
        draft.ownershipType === "BORROWED_IN"
          ? tr("status.borrowedInRegistered", "Borrowed-in spool registered.")
          : tr("status.stockAdded", "Spool added to inventory."),
        "success",
      );
    } catch (error) {
      setStatus(
        error.message ||
          (draft.ownershipType === "BORROWED_IN"
            ? tr("status.borrowedInRegisterFailed", "Failed to register borrowed-in spool.")
            : tr("status.stockAddFailed", "Failed to add spool to inventory.")),
        "error",
      );
      render();
    } finally {
      setBusy(false);
    }
  }

  return {
    submitWeightUpdate,
    submitPrinterSlotWeightUpdate,
    submitPrinterSlotOperation,
    submitTareWeightUpdate,
    submitSpoolDetailsUpdate,
    submitSpoolRfidUpdate,
    submitPrinterSlotAssignment,
    submitSpoolLoan,
    submitSpoolLoanReturn,
    submitManualSpoolRegistration,
    submitWishlistCreate,
    submitWishlistStatus,
    submitWishlistStock,
    submitQrLookup,
    submitBorrowedInUpdate,
    submitBorrowedInHandBack,
  };
}
