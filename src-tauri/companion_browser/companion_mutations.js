import { t } from "./companion_i18n.js";
import { createCompanionLoanMutations } from "./companion_loan_mutations.js";
import { createCompanionMutationHelpers } from "./companion_mutation_helpers.js";
import { createCompanionPrinterMutations } from "./companion_printer_mutations.js";
import { createCompanionSpoolMutations } from "./companion_spool_mutations.js";
import { createCompanionStockMutations } from "./companion_stock_mutations.js";
import { createCompanionWishlistMutations } from "./companion_wishlist_mutations.js";

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
  const { submitManualSpoolRegistration } = createCompanionStockMutations({
    state,
    refreshOverview,
    setBusy,
    setStatus,
    render,
    setDetailFeedback,
    createBorrowedInDraft,
    setDetailReturnContext,
    tr,
    normalizeAddSpoolValues,
    postJson,
  });

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
