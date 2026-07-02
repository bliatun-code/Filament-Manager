import { useCallback, useEffect, useMemo, useState } from "react";
import { AppModal } from "./app_modal";
import { FeedbackBanner } from "./feedback_banner";
import {
  inventoryModalOverlayClassName,
  inventoryTwoColumnModalGridClassName,
  inventoryWideModalPanelClassName,
} from "./inventory_modal_chrome";
import { modalFormInputClassName } from "./form_control_class";
import { ModalActionButton } from "./modal_action_button";
import {
  ModalHeader,
  modalDetailLabelClassName,
  modalDetailValueClassName,
} from "./modal_chrome";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { VendorBadge } from "./vendor_badge";
import {
  formatFilamentDisplayTitle,
  formatPlacementLabel,
  formatSpoolReference,
} from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import {
  inventoryCatalogRowStyle,
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
  countPillClassName,
  loanOutSpoolButtonClassName,
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
import { InventorySwatchChip } from "./inventory_swatch_chip";

type LoanOutModalProps = {
  open: boolean;
  onClose: () => void;
  preferredSpoolId?: string | null;
  clientReadOnly?: boolean;
  clientHostWritePaired?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  onLoanCreated?: (details: {
    spoolId: string;
    borrowerName: string;
    gramsOut: number;
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
  onLoanCreated,
}: LoanOutModalProps) {
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spools, setSpools] = useState<LoanableSpool[]>([]);
  const [selectedSpoolId, setSelectedSpoolId] = useState<string | null>(null);
  const [hoveredLoanSpoolId, setHoveredLoanSpoolId] = useState<string | null>(null);
  const [borrowerName, setBorrowerName] = useState("");
  const [gramsOut, setGramsOut] = useState("");
  const [note, setNote] = useState("");

  const reload = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const candidates = await loadLoanableSpoolCandidates({
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
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
      setError(t("inventory.error.loadInventory", "Failed to load inventory."));
    } finally {
      setLoading(false);
    }
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, preferredSpoolId, t, tauri]);

  useEffect(() => {
    if (!open || !tauri) {
      return;
    }
    setBorrowerName("");
    setNote("");
    setError(null);
    void reload();
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

    setBusy(true);
    setError(null);
    try {
      await lendInventorySpool(
        {
          spool_id: selectedSpool.id,
          borrower_name: borrower,
          grams_out: grams,
          note: note.trim() || null,
        },
        { clientReadOnly, clientHostBaseUrl, clientLibraryId },
      );
      await onLoanCreated?.({
        spoolId: selectedSpool.id,
        borrowerName: borrower,
        gramsOut: grams,
      });
      onClose();
    } catch (loanError) {
      console.error(loanError);
      setError(t("inventory.error.loanOut", "Failed to loan out roll."));
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

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-4">
          {error ? (
            <FeedbackBanner tone="danger">
              {error}
            </FeedbackBanner>
          ) : null}

          {loading ? (
            <div className="surface-subtle border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
              {t("inventory.loading", "Loading...")}
            </div>
          ) : spools.length === 0 ? (
            <div className="surface-subtle border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
              {t(
                "inventory.noLoanableRolls",
                "No rolls are currently available to loan out.",
              )}
            </div>
          ) : (
            <div className={inventoryTwoColumnModalGridClassName}>
              <div className={`${panelCardClassName} flex min-h-0 flex-col`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className={panelTitleClassName}>
                    {t("inventory.availableToLoan", "Available to loan")}
                  </div>
                  <span className={countPillClassName}>{spools.length}</span>
                </div>

                <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto pr-1 max-h-[min(58vh,40rem)]">
                  {spools.map((spool) => {
                    const isActive = selectedSpool?.id === spool.id;
                    const placementLabel = formatPlacementLabel(t, spool.location);
                    const referenceLabel = formatSpoolReference(spool.id);
                    return (
                      <button
                        key={spool.id}
                        type="button"
                        onMouseEnter={() => setHoveredLoanSpoolId(spool.id)}
                        onMouseLeave={() => setHoveredLoanSpoolId(null)}
                        onClick={() => {
                          setSelectedSpoolId(spool.id);
                          setGramsOut(
                            spool.remainingGrams != null
                              ? String(toMeasuredTotalWeight(spool, spool.remainingGrams))
                              : "",
                          );
                        }}
                        className={loanOutSpoolButtonClassName(isActive)}
                        style={inventoryCatalogRowStyle(
                          spool.hexColor,
                          isActive,
                          resolvedTheme,
                          hoveredLoanSpoolId === spool.id,
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <InventorySwatchChip
                            className="h-8 w-8 rounded-md"
                            swatchColor={spool.hexColor}
                            tone="tiny"
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className="block overflow-hidden break-words font-semibold leading-tight text-slate-900 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-slate-50"
                              title={formatFilamentDisplayTitle(
                                spool.material,
                                spool.filamentName,
                                spool.colorName,
                              )}
                            >
                              {formatFilamentDisplayTitle(
                                spool.material,
                                spool.filamentName,
                                spool.colorName,
                              )}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                              <VendorBadge vendor={spool.vendor} compact />
                              <span className="font-mono" title={`#${spool.id}`}>
                                {referenceLabel}
                              </span>
                              <span>{formatLoanOutGrams(spool.remainingGrams)}</span>
                              <span className="truncate max-w-[11rem]" title={placementLabel}>
                                {placementLabel}
                              </span>
                            </span>
                          </span>
                        </span>
                        {isActive ? (
                          <span className="shrink-0 rounded-full border border-slate-300 bg-white/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm dark:border-slate-500 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-none">
                            ✓ {t("common.selected", "Selected")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={panelCardClassName}>
                {selectedSpool ? (
                  <div
                    className="rounded-[1.4rem] border px-4 py-4 shadow-sm shadow-slate-200/15 dark:shadow-none"
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

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(132px,0.8fr)]">
                      <div
                        className="rounded-xl border px-3 py-2.5"
                        style={inventorySwatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                      >
                        <div className={modalDetailLabelClassName}>
                          {t("inventory.reference", "Reference")}
                        </div>
                        <div
                          className={`${modalDetailValueClassName} font-mono`}
                          title={`#${selectedSpool.id}`}
                        >
                          {selectedReferenceLabel}
                        </div>
                      </div>
                      <div
                        className="rounded-xl border px-3 py-2.5"
                        style={inventorySwatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                      >
                        <div className={modalDetailLabelClassName}>
                          {t("inventory.remaining", "Remaining")}
                        </div>
                        <div className={modalDetailValueClassName}>
                          {formatLoanOutGrams(selectedSpool.remainingGrams)}
                        </div>
                      </div>
                      <div
                        className="rounded-xl border px-3 py-2.5 sm:col-span-2"
                        style={inventorySwatchInsetStyle(selectedSpool.hexColor, resolvedTheme)}
                      >
                        <div className={modalDetailLabelClassName}>
                          {t("inventory.location", "Location")}
                        </div>
                        <div
                          className={modalDetailValueClassName}
                          title={selectedPlacementLabel ?? ""}
                        >
                          {selectedPlacementLabel}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 border-t border-white/60 pt-4 dark:border-white/10">
                      <div className={panelTitleClassName}>
                        {t("inventory.loanDetails", "Loan details")}
                      </div>
                      <div className={panelSubtitleClassName}>
                        {t(
                          "inventory.loanDetailsHelp",
                          "Confirm the borrower and measured outgoing total weight including spool before saving the loan.",
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {t("inventory.borrowerName", "Borrower name")}
                          </label>
                          <input
                            type="text"
                            value={borrowerName}
                            onChange={(event) => setBorrowerName(event.target.value)}
                            className={modalFormInputClassName}
                            placeholder={t("inventory.borrowerName", "Borrower name")}
                            disabled={!tauri || busy}
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {t("inventory.maxAvailable", "Max available")}:{" "}
                            {formatLoanOutGrams(
                              toMeasuredTotalWeight(selectedSpool, selectedSpool.remainingGrams),
                            )}
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={gramsOut}
                            onChange={(event) => setGramsOut(event.target.value)}
                            className={modalFormInputClassName}
                            placeholder={t("inventory.outG", "Out g")}
                            disabled={!tauri || busy}
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          {t("inventory.loanNoteOptional", "Loan note (optional)")}
                        </label>
                        <textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          className={`${modalFormInputClassName} min-h-[104px] resize-y`}
                          placeholder={t("inventory.loanNoteOptional", "Loan note (optional)")}
                          disabled={!tauri || busy}
                        />
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
                  <div className="surface-subtle border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
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
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </AppModal>
  );
}
