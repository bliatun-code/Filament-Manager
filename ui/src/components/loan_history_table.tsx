import { useI18n } from "../lib/i18n";
import { compactLoanTitle, formatLoanReference, formatGrams, formatDateTime } from "../lib/loan_display";
import { isInboundLoan, isLoanCurrentlyActive } from "../lib/loan_state";
import { formatLoanExpectedReturnDate, loanDueState, localCalendarDate } from "../lib/loan_due_state";
import type { NormalizedLoanDetailsRow } from "../lib/loan_data_source";
import { InventorySwatchChip } from "./inventory_swatch_chip";
import { LoanHistoryCard } from "./loan_history_card";
import { neutralChipClass } from "../lib/chip_styles";

export function LoanHistoryTable({ loans, busy, onReturn, onOpenSpool }: {
  loans: NormalizedLoanDetailsRow[];
  busy: boolean;
  onReturn: (loan: NormalizedLoanDetailsRow) => void;
  onOpenSpool?: (spoolId: string) => void;
}) {
  const { t, locale } = useI18n();
  const today = localCalendarDate();
  return <div className="inventory-loan-table-wrap"><table className="inventory-loan-table">
    <caption className="sr-only">{t("loans.history", "Loan history")}</caption>
    <thead><tr>
      <th scope="col">{t("inventory.title", "Spools")}</th>
      <th scope="col">{t("loans.person", "Person")}</th>
      <th scope="col">{t("loans.lent", "Lent")}</th>
      <th scope="col">{t("loans.out", "Out")}</th>
      <th scope="col">{t("inventory.status", "Status")}</th>
      <th scope="col"><span className="sr-only">{t("common.actions", "Actions")}</span></th>
    </tr></thead>
    <tbody>{loans.map(loan => {
      const title = compactLoanTitle(loan, t("common.unknown", "Unknown"));
      const inbound = isInboundLoan(loan);
      const active = isLoanCurrentlyActive(loan);
      const due = loanDueState(loan, today);
      return <tr key={loan.loan.id}>
        <td><div className="inventory-loan-title">
          <InventorySwatchChip className="inventory-product-swatch" swatchColor={loan.hex_color}/>
          <div><strong>{title}</strong><span className="inventory-loan-secondary">{loan.vendor} · {loan.material} · {formatLoanReference(loan.loan.spool_id)}</span></div>
        </div></td>
        <td>{loan.loan.counterparty_name ?? loan.loan.borrower_name}
          <span className="inventory-loan-secondary">{inbound ? t("loans.directionInbound", "Borrowed in") : t("loans.directionOutbound", "Loaned out")}</span>
        </td>
        <td><time dateTime={loan.loan.lent_at}>{formatDateTime(loan.loan.lent_at, locale)}</time>
          {loan.loan.expected_return_at ? <span className="inventory-loan-secondary">{t("loans.expectedReturn", "Expected return")}: {formatLoanExpectedReturnDate(loan.loan.expected_return_at, locale)}</span> : null}
        </td>
        <td className="whitespace-nowrap tabular-nums">{formatGrams(loan.loan.grams_out, "zero", locale)}</td>
        <td>{active ? t("common.active", "Active") : inbound ? t("loans.handedBack", "Handed back") : t("loans.returned", "Returned")}
          {due === "OVERDUE" ? <span className="inventory-loan-secondary text-rose-700 dark:text-rose-300">{t("loans.overdue", "Overdue")}</span> : due === "DUE_TODAY" ? <span className="inventory-loan-secondary">{t("loans.dueToday", "Due today")}</span> : null}
        </td>
        <td><div className="flex items-start gap-3">
          {active ? <button type="button" className={neutralChipClass(false,"px-3 py-1.5 text-xs whitespace-nowrap")}
            aria-label={`${inbound ? t("loans.handBackAction", "Hand back") : t("loans.returnAction", "Return")} · ${title} · ${formatLoanReference(loan.loan.spool_id)}`}
            disabled={busy} onClick={() => onReturn(loan)}>
            {inbound ? t("loans.handBackAction", "Hand back") : t("loans.returnAction", "Return")}
          </button> : null}
          <details className="inventory-loan-details"><summary aria-label={`${t("loans.history", "Loan history")} · ${title}`}>⋯</summary>
            <div className="inventory-loan-details-content">
              <LoanHistoryCard loan={loan} busy={busy} onReturn={onReturn} />
              {[loan.loan.lent_note, loan.loan.counterparty_note, loan.loan.return_note].filter(Boolean).map((note,i) => <p key={i} className="mt-2 text-xs">{note}</p>)}
              {onOpenSpool ? <button type="button" className={neutralChipClass(false,"mt-3 px-3 py-1.5 text-xs")} onClick={() => onOpenSpool(loan.loan.spool_id)}>{t("inventory.openCreatedRoll", "Open roll")}</button> : null}
            </div>
          </details>
        </div></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
