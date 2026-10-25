import { useI18n } from "../lib/i18n";
import { inventoryDetailCompactActionButtonClassName } from "./inventory_detail_panel_class";

type InventorySpoolDetailContextActionsProps = {
  loadDisabled: boolean;
  assigned?: boolean;
  openPrintersDisabled?: boolean;
  onOpenPrinters?: () => void;
  loanDisabled: boolean;
  onLoadInPrinter: () => void;
  onLoanOut: () => void;
  onPrintLabel: () => void;
  printDisabled: boolean;
};

export function InventorySpoolDetailContextActions({
  loadDisabled,
  assigned = false,
  openPrintersDisabled = false,
  onOpenPrinters,
  loanDisabled,
  onLoadInPrinter,
  onLoanOut,
  onPrintLabel,
  printDisabled,
}: InventorySpoolDetailContextActionsProps) {
  const { t } = useI18n();
  return (
    <div className="app-modal-toolbar border-b px-4 py-3 sm:px-5">
      <div
        className="flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label={t("inventory.selectedRollActions", "Selected roll actions")}
      >
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
          disabled={assigned && onOpenPrinters ? openPrintersDisabled : loadDisabled}
          onClick={assigned && onOpenPrinters ? onOpenPrinters : onLoadInPrinter}
        >
          {assigned && onOpenPrinters ? t("inventory.detailOpenPrinters", "Open printers") : t("inventory.loadInPrinter", "Load in printer")}
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
