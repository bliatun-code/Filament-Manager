import { AppModal } from "./app_modal";
import { modalFormInputClassName } from "./form_control_class";
import { ModalActionButton } from "./modal_action_button";
import {
  ModalDetailGrid,
  ModalDetailItem,
  ModalFooter,
  ModalFormField,
  ModalHeader,
  ModalNotice,
} from "./modal_chrome";
import { modalPanelClassName } from "./modal_panel_class";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { VendorBadge } from "./vendor_badge";
import { useI18n } from "../lib/i18n";
import {
  compactLoanTitle,
  formatGrams,
  formatLoanReference,
  toMeasuredTotalWeight,
} from "../lib/loan_display";
import {
  LoanSwatchCard,
  LoanSwatchInsetCard,
} from "./loan_swatch_card";
import { useResolvedTheme } from "../lib/theme_mode";
import { isInboundLoan } from "../lib/loan_state";
import type { NormalizedLoanDetailsRow } from "../lib/loan_data_source";
import { LoanReturnSummaryCard } from "./loan_return_summary_card";

type LoanReturnModalProps = {
  busy: boolean;
  grams: string;
  loan: NormalizedLoanDetailsRow | null;
  note: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  onGramsChange: (value: string) => void;
  onNoteChange: (value: string) => void;
};

export function LoanReturnModal({
  busy,
  grams,
  loan,
  note,
  onClose,
  onConfirm,
  onGramsChange,
  onNoteChange,
}: LoanReturnModalProps) {
  const { locale, t } = useI18n();
  const resolvedTheme = useResolvedTheme();

  if (!loan) {
    return null;
  }

  const isInbound = isInboundLoan(loan);

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={onClose}
      panelClassName={modalPanelClassName("lg")}
    >
      <div className="space-y-4">
        <ModalHeader
          eyebrow={t("nav.loans", "Loans")}
          title={
            isInbound
              ? t("loans.handBackDialogTitle", "Hand back borrowed-in spool")
              : t("loans.returnDialogTitle", "Return loaned roll")
          }
          subtitle={
            isInbound
              ? t(
                  "loans.handBackDialogSubtitle",
                  "Weigh it back in, add a note if needed, then remove it from active inventory.",
                )
              : t(
                  "loans.returnDialogSubtitle",
                  "Weigh it back in and add a note if needed.",
                )
          }
          onClose={onClose}
          closeLabel={t("common.close", "Close")}
          className="-mx-5 -mt-5"
        />

        <LoanSwatchCard
          variant="modal"
          swatchColor={loan.hex_color}
          resolvedTheme={resolvedTheme}
        >
          <SwatchSelectionPreviewHeader
            eyebrow={t("inventory.selectionPreview", "Selection preview")}
            size="large"
            swatchColor={loan.hex_color}
          >
            <div className="font-semibold text-slate-900 dark:text-slate-50">
              {compactLoanTitle(loan, t("common.unknown", "Unknown"))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              <VendorBadge
                vendor={loan.vendor?.trim() || t("common.unknown", "Unknown")}
                compact
              />
              <span>
                {isInbound
                  ? t("inventory.borrowedFrom", "Borrowed from")
                  : t("loans.borrower", "Borrower")}
                : {loan.loan.counterparty_name ?? loan.loan.borrower_name}
              </span>
            </div>
          </SwatchSelectionPreviewHeader>

          <LoanSwatchInsetCard
            variant="modal"
            className="mt-3"
            swatchColor={loan.hex_color}
            resolvedTheme={resolvedTheme}
          >
            <ModalDetailGrid
              className="grid-cols-[minmax(0,1.45fr)_minmax(108px,0.9fr)] gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1.45fr)_minmax(108px,0.9fr)]"
            >
              <ModalDetailItem
                label={t("inventory.reference", "Reference")}
                title={`#${loan.loan.spool_id}`}
                valueClassName="break-all font-mono"
              >
                {formatLoanReference(loan.loan.spool_id)}
              </ModalDetailItem>
              <ModalDetailItem
                label={isInbound ? t("loans.startWeight", "Start") : t("loans.out", "Out")}
              >
                {formatGrams(
                  toMeasuredTotalWeight(loan, loan.loan.grams_out),
                  "zero",
                  locale,
                )}
              </ModalDetailItem>
            </ModalDetailGrid>
          </LoanSwatchInsetCard>
        </LoanSwatchCard>

        {isInbound ? (
          <ModalNotice tone="warning" className="px-3 py-2 text-sm">
            {t(
              "loans.handBackDialogHint",
              "Handing this back will remove the borrowed-in spool from active inventory but keep its loan history.",
            )}
          </ModalNotice>
        ) : null}

        <ModalFormField
          label={
            isInbound
              ? t(
                  "loans.handBackDialogWeightLabel",
                  "Weigh-in handed-back total weight incl. spool (g)",
                )
              : t(
                  "loans.returnDialogWeightLabel",
                  "Weigh-in returned total weight incl. spool (g)",
                )
          }
        >
          <input
            type="number"
            min={0}
            value={grams}
            onChange={(event) => onGramsChange(event.target.value)}
            className={modalFormInputClassName}
            autoFocus
          />
        </ModalFormField>

        <LoanReturnSummaryCard grams={grams} loan={loan} />

        <ModalFormField label={t("loans.returnNoteOptional", "Return note (optional)")}>
          <input
            type="text"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            className={modalFormInputClassName}
            placeholder={t("loans.returnNoteOptional", "Return note (optional)")}
          />
        </ModalFormField>

        <ModalFooter border={false} className="flex justify-end gap-2">
          <ModalActionButton
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            {t("common.close", "Close")}
          </ModalActionButton>
          <ModalActionButton
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
            variant="primary"
          >
            {isInbound
              ? t("loans.confirmHandBackAction", "Confirm hand-back")
              : t("loans.confirmReturnAction", "Confirm return")}
          </ModalActionButton>
        </ModalFooter>
      </div>
    </AppModal>
  );
}
