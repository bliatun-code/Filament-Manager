import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppModal } from "./app_modal";
import {
  inventoryModalOverlayClassName,
  inventoryTwoColumnModalGridClassName,
  inventoryWideModalPanelClassName,
} from "./inventory_modal_chrome";
import { modalFormInputClassName } from "./form_control_class";
import { ModalActionButton } from "./modal_action_button";
import {
  ModalDetailGrid,
  ModalDetailItem,
  ModalBody,
  ModalFormField,
  ModalHeader,
  ModalNotice,
} from "./modal_chrome";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { VendorBadge } from "./vendor_badge";
import {
  formatFilamentDisplayTitle,
  formatPlacementLabel,
  formatSpoolReference,
} from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { toErrorMessage } from "../lib/error_text";
import {
  inventorySwatchInsetStyle,
  inventorySwatchPanelStyle,
} from "../lib/inventory_swatch_style";
import { useResolvedTheme } from "../lib/theme_mode";
import { lendInventorySpool } from "../lib/loan_data_source";
import {
  loadLoanableSpoolCandidates,
  type LoanableSpool,
} from "../lib/loan_out_data_source";
import {
  panelCardClassName,
  panelSubtitleClassName,
  panelTitleClassName,
} from "./loan_out_modal_styles";
import {
  formatLoanOutGrams,
  toLoanedFilamentWeight,
  toMeasuredTotalWeight,
} from "../lib/loan_out_weight_model";
import { isTauri } from "../lib/tauri_client";
import { LoanOutCandidateList } from "./loan_out_candidate_list";
import {
  localCalendarDate,
  validateLoanExpectedReturnDate,
} from "../lib/loan_due_state";

type LoanOutModalProps = {
  open: boolean;
  onClose: () => void;
  preferredSpoolId?: string | null;
  clientReadOnly?: boolean;
  clientHostWritePaired?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
  onLoanCreated?: (details: {
    spoolId: string;
    borrowerName: string;
    counterpartyContact: string | null;
    gramsOut: number;
    expectedReturnAt: string | null;
  }) => Promise<void> | void;
};

export function LoanOutModal({
  open,
  onClose,
  preferredSpoolId = null,
  clientReadOnly = false,
  clientHostWritePaired = false,
  clientHostBaseUrl = null,
  clientLibraryId = null,
  clientTargetGeneration = null,
  onLoanCreated,
}: LoanOutModalProps) {
  const { locale, t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spools, setSpools] = useState<LoanableSpool[]>([]);
  const [selectedSpoolId, setSelectedSpoolId] = useState<string | null>(null);
  const [spoolSearchQuery, setSpoolSearchQuery] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [counterpartyContact, setCounterpartyContact] = useState("");
  const [gramsOut, setGramsOut] = useState("");
  const [note, setNote] = useState("");
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const reloadRequestRef = useRef(0);
  const today = localCalendarDate();

  const reload = useCallback(async () => {
    if (!tauri) {
      return;
    }
    const requestId = reloadRequestRef.current + 1;
    reloadRequestRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const candidates = await loadLoanableSpoolCandidates({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
        clientTargetGeneration,
      });
      if (reloadRequestRef.current !== requestId) {
        return;
      }
      setSpools(candidates);
      const preferredById = preferredSpoolId
        ? candidates.find((spool) => spool.id === preferredSpoolId)
        : undefined;
      const preferred = preferredById ?? candidates[0] ?? null;
      setSelectedSpoolId(preferred?.id ?? null);
      setGramsOut(
        preferred?.remainingGrams != null
          ? String(toMeasuredTotalWeight(preferred, preferred.remainingGrams))
          : "",
      );
    } catch (loadError) {
      console.error(loadError);
      if (reloadRequestRef.current === requestId) {
        setError(t("inventory.error.loadInventory", "Failed to load inventory."));
      }
    } finally {
      if (reloadRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    clientTargetGeneration,
    preferredSpoolId,
    t,
    tauri,
  ]);

  useEffect(() => {
    if (!open || !tauri) {
      return;
    }
    setBorrowerName("");
    setCounterpartyContact("");
    setNote("");
    setExpectedReturnAt("");
    setSpoolSearchQuery("");
    setError(null);
    void reload();
    return () => {
      reloadRequestRef.current += 1;
    };
  }, [open, reload, tauri]);

  const selectedSpool = useMemo(
    () => (selectedSpoolId ? spools.find((spool) => spool.id === selectedSpoolId) ?? null : null),
    [selectedSpoolId, spools],
  );
  const selectedPlacementLabel = selectedSpool
    ? formatPlacementLabel(t, selectedSpool.location)
    : null;
  const selectedReferenceLabel = selectedSpool
    ? formatSpoolReference(selectedSpool.id)
    : null;

  async function handleSubmit() {
    if (!tauri || !selectedSpool || busy) {
      return;
    }
    if (clientReadOnly && (!clientHostBaseUrl || !clientLibraryId)) {
      setError(
        t(
          "inventory.clientHostUnavailable",
          "Host connection details are missing for this client device.",
        ),
      );
      return;
    }
    if (clientReadOnly && !clientHostWritePaired) {
      setError(
        t(
          "inventory.clientWriteRequiresPairing",
          "Pair this desktop client with the host before running protected sync actions.",
        ),
      );
      return;
    }
    const borrower = borrowerName.trim();
    if (!borrower) {
      setError(t("inventory.error.borrowerRequired", "Borrower name is required."));
      return;
    }
    const measuredTotalGrams = Number.parseInt(gramsOut, 10);
    if (!Number.isFinite(measuredTotalGrams) || measuredTotalGrams < 0) {
      setError(t("inventory.error.loanGrams", "Loan grams must be zero or greater."));
      return;
    }
    const grams = toLoanedFilamentWeight(selectedSpool, measuredTotalGrams);
    const expectedReturn = validateLoanExpectedReturnDate(expectedReturnAt, today);
    if (expectedReturn.error === "INVALID") {
      setError(
        t(
          "inventory.error.expectedReturnInvalid",
          "Choose a valid expected return date.",
        ),
      );
      return;
    }
    if (expectedReturn.error === "PAST") {
      setError(
        t(
          "inventory.error.expectedReturnPast",
          "Expected return date cannot be before today.",
        ),
      );
      return;
    }
    const contact = counterpartyContact.trim() || null;

    setBusy(true);
    setError(null);
    try {
      await lendInventorySpool(
        {
          spool_id: selectedSpool.id,
          borrower_name: borrower,
          counterparty_contact: contact,
          grams_out: grams,
          note: note.trim() || null,
          expected_return_at: expectedReturn.value,
        },
        { clientReadOnly, clientHostBaseUrl, clientLibraryId },
      );
      await onLoanCreated?.({
        spoolId: selectedSpool.id,
        borrowerName: borrower,
        counterpartyContact: contact,
        gramsOut: grams,
        expectedReturnAt: expectedReturn.value,
      });
      onClose();
    } catch (loanError) {
      console.error(loanError);
      setError(
        toErrorMessage(
          loanError,
          t("inventory.error.loanOut", "Failed to loan out roll."),
          t,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={busy ? undefined : onClose}
      overlayClassName={inventoryModalOverlayClassName}
      panelClassName={inventoryWideModalPanelClassName}
      zIndex={70}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <ModalHeader
          eyebrow={t("inventory.loanTracking", "Loan tracking")}
          title={t("inventory.loanOutRoll", "Loan out roll")}
          onClose={onClose}
          closeLabel={t("common.close", "Close")}
          disabled={busy}
          className="px-6 py-4"
        />

        <ModalBody scroll={false} className="px-6 py-6">
          <div className="flex min-h-0 flex-1 flex-col space-y-4">
            {error ? <ModalNotice tone="danger">{error}</ModalNotice> : null}

            {loading ? (
              <ModalNotice className="border-dashed">
                {t("inventory.loading", "Loading...")}
              </ModalNotice>
            ) : spools.length === 0 ? (
              <ModalNotice className="border-dashed">
                {t(
                  "inventory.noLoanableRolls",
                  "No rolls are currently available to loan out.",
                )}
              </ModalNotice>
            ) : (
              <div className={`${inventoryTwoColumnModalGridClassName} min-h-0 flex-1`}>
                <LoanOutCandidateList
                  disabled={!tauri || busy}
                  searchQuery={spoolSearchQuery}
                  selectedSpoolId={selectedSpoolId}
                  spools={spools}
                  onSearchQueryChange={setSpoolSearchQuery}
                  renderVendorBadge={(vendor) => <VendorBadge vendor={vendor} compact />}
                  onSelectSpool={(spool) => {
                    setSelectedSpoolId(spool.id);
                    setGramsOut(
                      spool.remainingGrams != null
                        ? String(toMeasuredTotalWeight(spool, spool.remainingGrams))
                        : "",
                    );
                  }}
                />

                <div className={`${panelCardClassName} flex min-h-0 flex-col overflow-hidden`}>
                  {selectedSpool ? (
                    <div
                      className="min-h-0 overflow-y-auto rounded-[1.4rem] border px-4 py-4 shadow-sm shadow-slate-200/15 dark:shadow-none"
                      style={inventorySwatchPanelStyle(selectedSpool.hexColor, resolvedTheme)}
                    >
                      <SwatchSelectionPreviewHeader
                        eyebrow={t("inventory.selectionPreview", "Selection preview")}
                        size="large"
                        swatchColor={selectedSpool.hexColor}
                      >
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                            {formatFilamentDisplayTitle(
                              selectedSpool.material,
                              selectedSpool.filamentName,
                              selectedSpool.colorName,
                            )}
                          </div>
                          <VendorBadge vendor={selectedSpool.vendor} compact />
                        </div>
                      </SwatchSelectionPreviewHeader>

                      <ModalDetailGrid className="mt-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(132px,0.8fr)]">
                        <ModalDetailItem
                          card
                          label={t("inventory.reference", "Reference")}
                          title={`#${selectedSpool.id}`}
                          valueClassName="font-mono"
                          style={inventorySwatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                        >
                          {selectedReferenceLabel}
                        </ModalDetailItem>
                        <ModalDetailItem
                          card
                          label={t("inventory.remaining", "Remaining")}
                          style={inventorySwatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                        >
                          {formatLoanOutGrams(selectedSpool.remainingGrams, locale)}
                        </ModalDetailItem>
                        <ModalDetailItem
                          card
                          label={t("inventory.location", "Location")}
                          title={selectedPlacementLabel ?? ""}
                          className="sm:col-span-2"
                          style={inventorySwatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                        >
                          {selectedPlacementLabel}
                        </ModalDetailItem>
                      </ModalDetailGrid>

                      <div className="mt-4 border-t border-white/60 pt-4 dark:border-white/10">
                        <div className={panelTitleClassName}>
                          {t("inventory.loanDetails", "Loan details")}
                        </div>
                        <div className={panelSubtitleClassName}>
                          {t(
                            "inventory.loanDetailsHelp",
                            "Confirm the borrower and measured outgoing total weight including spool before saving the loan.",
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <ModalFormField label={t("inventory.borrowerName", "Borrower name")}>
                            <input
                              type="text"
                              value={borrowerName}
                              onChange={(event) => setBorrowerName(event.target.value)}
                              className={modalFormInputClassName}
                              placeholder={t("inventory.borrowerName", "Borrower name")}
                              disabled={!tauri || busy}
                            />
                          </ModalFormField>

                          <ModalFormField
                            label={t(
                              "inventory.borrowerContactOptional",
                              "Contact information (optional)",
                            )}
                          >
                            <input
                              type="text"
                              value={counterpartyContact}
                              onChange={(event) => setCounterpartyContact(event.target.value)}
                              className={modalFormInputClassName}
                              placeholder={t(
                                "inventory.borrowerContactPlaceholder",
                                "Phone, email or handle",
                              )}
                              maxLength={200}
                              disabled={!tauri || busy}
                            />
                          </ModalFormField>

                          <ModalFormField
                            label={
                              <>
                                {t("inventory.maxAvailable", "Max available")}:{" "}
                                {formatLoanOutGrams(
                                  toMeasuredTotalWeight(
                                    selectedSpool,
                                    selectedSpool.remainingGrams,
                                  ),
                                  locale,
                                )}
                              </>
                            }
                          >
                            <input
                              type="number"
                              min={0}
                              value={gramsOut}
                              onChange={(event) => setGramsOut(event.target.value)}
                              className={modalFormInputClassName}
                              placeholder={t("inventory.outG", "Out g")}
                              disabled={!tauri || busy}
                            />
                          </ModalFormField>

                          <ModalFormField
                            label={t(
                              "inventory.expectedReturnDateOptional",
                              "Expected return date (optional)",
                            )}
                          >
                            <input
                              type="date"
                              min={today}
                              value={expectedReturnAt}
                              onChange={(event) => setExpectedReturnAt(event.target.value)}
                              className={modalFormInputClassName}
                              disabled={!tauri || busy}
                            />
                          </ModalFormField>
                        </div>

                        <div className="mt-3">
                          <ModalFormField
                            label={t("inventory.loanNoteOptional", "Loan note (optional)")}
                          >
                            <textarea
                              value={note}
                              onChange={(event) => setNote(event.target.value)}
                              className={`${modalFormInputClassName} min-h-[88px] resize-y`}
                              placeholder={t("inventory.loanNoteOptional", "Loan note (optional)")}
                              disabled={!tauri || busy}
                            />
                          </ModalFormField>
                        </div>

                        <ModalActionButton
                          onClick={() => void handleSubmit()}
                          disabled={!tauri || busy}
                          className="mt-4"
                          fullWidth
                          resolvedTheme={resolvedTheme}
                          size="roomy"
                          swatchColor={selectedSpool.hexColor}
                          variant="solid"
                        >
                          {t("inventory.loanOutRoll", "Loan out roll")}
                        </ModalActionButton>
                      </div>
                    </div>
                  ) : (
                    <ModalNotice className="border-dashed">
                      {t("inventory.chooseRollToLoan", "Choose a roll to loan out.")}
                      {clientReadOnly ? (
                        <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {clientHostWritePaired
                            ? t(
                                "inventory.clientLoanOutPairedHint",
                                "Available rolls are loaded from the host and the loan is created there.",
                              )
                            : t(
                                "inventory.clientLoanOutUnpairedHint",
                                "Pair this desktop client with the host before creating a loan from this device.",
                              )}
                        </div>
                      ) : null}
                    </ModalNotice>
                  )}
                </div>
              </div>
            )}
          </div>
        </ModalBody>
      </div>
    </AppModal>
  );
}
