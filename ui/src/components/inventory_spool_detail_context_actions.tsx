import { useI18n } from "../lib/i18n";
import { inventoryDetailCompactActionButtonClassName } from "./inventory_detail_panel_class";

type InventorySpoolDetailContextActionsProps = {
  loadDisabled: boolean;
  loanDisabled: boolean;
  onLoadInPrinter: () => void;
  onLoanOut: () => void;
  onPrintLabel: () => void;
  printDisabled: boolean;
};

export function InventorySpoolDetailContextActions({
  loadDisabled,
  loanDisabled,
  onLoadInPrinter,
  onLoanOut,
  onPrintLabel,
  printDisabled,
}: InventorySpoolDetailContextActionsProps) {
  const { t } = useI18n();
  return (
    <div className="border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800/70 dark:bg-slate-950/35 sm:px-5">
      <div
        className="flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label={t("inventory.selectedRollActions", "Selected roll actions")}
      >
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {t("inventory.nextStep", "Next step")}
        </span>
        <button
          type="button"
          className={inventoryDetailCompactActionButtonClassName}
          disabled={loanDisabled}
          onClick={onLoanOut}
        >
          {t("inventory.loanOutAction", "Loan out")}
        </button>
        <button
          type="button"
          className={inventoryDetailCompactActionButtonClassName}
          disabled={loadDisabled}
          onClick={onLoadInPrinter}
        >
          {t("inventory.loadInPrinter", "Load in printer")}
        </button>
        <button
          type="button"
          className={inventoryDetailCompactActionButtonClassName}
          disabled={printDisabled}
          onClick={onPrintLabel}
        >
          {t("inventory.printLabelAction", "Print label")}
        </button>
      </div>
    </div>
  );
}
