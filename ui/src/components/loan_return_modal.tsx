import { AppModal } from "./app_modal";
import { FeedbackBanner } from "./feedback_banner";
import { modalFormInputClassName } from "./form_control_class";
import { ModalActionButton } from "./modal_action_button";
import {
  ModalHeader,
  modalDetailLabelClassName,
  modalDetailValueClassName,
} from "./modal_chrome";
import { modalPanelClassName } from "./modal_panel_class";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { VendorBadge } from "./vendor_badge";
import { useI18n } from "../lib/i18n";
import {
  compactLoanTitle,
  formatGrams,
  formatLoanReference,
  normalizeLoanDirection,
  toMeasuredTotalWeight,
} from "../lib/loan_display";
import {
  inventorySwatchCardStyle,
  inventorySwatchInsetStyle,
} from "../lib/inventory_swatch_style";
import { useResolvedTheme } from "../lib/theme_mode";
import type { SpoolLoanDetailsRow } from "../lib/tauri_client";

type LoanReturnModalProps = {
  busy: boolean;
  grams: string;
  loan: SpoolLoanDetailsRow | null;
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
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();

  if (!loan) {
    return null;
  }

  const loanDirection = normalizeLoanDirection(loan.loan.loan_direction);
  const isInbound = loanDirection === "INBOUND";

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

        <div
          className="rounded-2xl border border-slate-300/80 px-3.5 py-3 text-xs text-slate-700 shadow-sm shadow-slate-300/20 dark:border-slate-700/80 dark:text-slate-300 dark:shadow-none"
          style={inventorySwatchCardStyle(loan.hex_color, resolvedTheme)}
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

          <div
            className="mt-3 rounded-[1.05rem] border px-3.5 py-3"
            style={inventorySwatchInsetStyle(loan.hex_color, resolvedTheme)}
          >
            <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(108px,0.9fr)] gap-x-4 gap-y-3">
              <div className="min-w-0">
                <div className={modalDetailLabelClassName}>
                  {t("inventory.reference", "Reference")}
                </div>
                <div
                  className={`${modalDetailValueClassName} break-all font-mono`}
                  title={`#${loan.loan.spool_id}`}
                >
                  {formatLoanReference(loan.loan.spool_id)}
                </div>
              </div>
              <div>
                <div className={modalDetailLabelClassName}>
                  {isInbound
                    ? t("loans.startWeight", "Start")
                    : t("loans.out", "Out")}
                </div>
                <div className={modalDetailValueClassName}>
                  {formatGrams(toMeasuredTotalWeight(loan, loan.loan.grams_out))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {isInbound ? (
          <FeedbackBanner tone="warning" compact>
            {t(
              "loans.handBackDialogHint",
              "Handing this back will remove the borrowed-in spool from active inventory but keep its loan history.",
            )}
          </FeedbackBanner>
        ) : null}

        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {isInbound
              ? t(
                  "loans.handBackDialogWeightLabel",
                  "Weigh-in handed-back total weight incl. spool (g)",
                )
              : t(
                  "loans.returnDialogWeightLabel",
                  "Weigh-in returned total weight incl. spool (g)",
                )}
          </label>
          <input
            type="number"
            min={0}
            value={grams}
            onChange={(event) => onGramsChange(event.target.value)}
            className={modalFormInputClassName}
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
            {t("loans.returnNoteOptional", "Return note (optional)")}
          </label>
          <input
            type="text"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            className={modalFormInputClassName}
            placeholder={t("loans.returnNoteOptional", "Return note (optional)")}
          />
        </div>

        <div className="flex justify-end gap-2">
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
            variant="success"
            swatchColor={loan.hex_color}
            resolvedTheme={resolvedTheme}
          >
            {isInbound
              ? t("loans.confirmHandBackAction", "Confirm hand-back")
              : t("loans.confirmReturnAction", "Confirm return")}
          </ModalActionButton>
        </div>
      </div>
    </AppModal>
  );
}
