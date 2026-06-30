import type { CSSProperties } from "react";
import { inventoryFormControlClassName } from "./form_control_class";
import { SegmentedChoiceRow } from "./segmented_choice_row";
import { useI18n } from "../lib/i18n";
import type { OwnershipType } from "../lib/inventory_list_model";

type InventoryCreateActionsPanelProps = {
  actionStyle?: CSSProperties;
  borrowedFromContact: string;
  borrowedFromName: string;
  borrowedInNote: string;
  disabledCreate: boolean;
  disabledWishlistCreate: boolean;
  initialWeight: string;
  location: string;
  onAddCurrentToWishlist: () => void;
  onBorrowedFromContactChange: (value: string) => void;
  onBorrowedFromNameChange: (value: string) => void;
  onBorrowedInNoteChange: (value: string) => void;
  onCreateSpool: () => void;
  onInitialWeightChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onOwnershipTypeChange: (value: OwnershipType) => void;
  ownershipType: OwnershipType;
  panelStyle?: CSSProperties;
  tauriAvailable: boolean;
};

export function InventoryCreateActionsPanel({
  actionStyle,
  borrowedFromContact,
  borrowedFromName,
  borrowedInNote,
  disabledCreate,
  disabledWishlistCreate,
  initialWeight,
  location,
  onAddCurrentToWishlist,
  onBorrowedFromContactChange,
  onBorrowedFromNameChange,
  onBorrowedInNoteChange,
  onCreateSpool,
  onInitialWeightChange,
  onLocationChange,
  onOwnershipTypeChange,
  ownershipType,
  panelStyle,
  tauriAvailable,
}: InventoryCreateActionsPanelProps) {
  const { t } = useI18n();

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white/85 p-4 transition dark:border-slate-700 dark:bg-slate-950/70"
      style={panelStyle}
    >
      <div className="rounded-xl border border-slate-200/80 bg-white/65 p-3 dark:border-slate-700/80 dark:bg-slate-950/40">
        <SegmentedChoiceRow
          label={t("inventory.ownership", "Ownership")}
          value={ownershipType}
          onChange={onOwnershipTypeChange}
          options={[
            {
              value: "OWNED",
              label: t("inventory.ownedByUs", "Owned"),
            },
            {
              value: "BORROWED_IN",
              label: t("inventory.borrowedIn", "Borrowed in"),
            },
          ]}
        />
        <div className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {ownershipType === "BORROWED_IN"
            ? t(
                "inventory.borrowedInHelp",
                "Register this spool as borrowed from someone else. It can still be used in printers, but it will not appear in loan-out candidates.",
              )
            : t("inventory.ownedByUsDetail", "Owned by us")}
        </div>
        {ownershipType === "BORROWED_IN" ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              type="text"
              value={borrowedFromName}
              onChange={(event) => onBorrowedFromNameChange(event.target.value)}
              placeholder={t("inventory.borrowedFrom", "Borrowed from")}
              className={inventoryFormControlClassName}
              disabled={!tauriAvailable}
            />
            <input
              type="text"
              value={borrowedFromContact}
              onChange={(event) => onBorrowedFromContactChange(event.target.value)}
              placeholder={t(
                "inventory.ownerContactOptional",
                "Owner contact (optional)",
              )}
              className={inventoryFormControlClassName}
              disabled={!tauriAvailable}
            />
            <input
              type="text"
              value={borrowedInNote}
              onChange={(event) => onBorrowedInNoteChange(event.target.value)}
              placeholder={t(
                "inventory.borrowedInNoteOptional",
                "Borrowed-in note (optional)",
              )}
              className={`${inventoryFormControlClassName} md:col-span-2`}
              disabled={!tauriAvailable}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3">
        <input
          type="number"
          value={initialWeight}
          onChange={(event) => onInitialWeightChange(event.target.value)}
          placeholder={t("inventory.initialWeight", "Initial weight (g)")}
          className={inventoryFormControlClassName}
          disabled={!tauriAvailable}
        />
        <input
          type="text"
          value={location}
          onChange={(event) => onLocationChange(event.target.value)}
          placeholder={t("inventory.homeLocationOptional", "Home location (optional)")}
          className={inventoryFormControlClassName}
          disabled={!tauriAvailable}
        />
      </div>
      <button
        type="button"
        className={`mt-4 w-full rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
          actionStyle
            ? "shadow-sm"
            : "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
        }`}
        style={actionStyle}
        onClick={onCreateSpool}
        disabled={disabledCreate}
      >
        {ownershipType === "BORROWED_IN"
          ? t("inventory.registerBorrowedIn", "Register borrowed-in spool")
          : t("inventory.addSpool", "Add spool to inventory")}
      </button>

      <div className="mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
        <button
          type="button"
          className={`w-full rounded-xl border px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
            actionStyle
              ? "shadow-sm"
              : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100"
          }`}
          style={actionStyle}
          onClick={onAddCurrentToWishlist}
          disabled={disabledWishlistCreate}
        >
          {t("inventory.addCurrentSelectionToWishlist", "Add current selection to wishlist")}
        </button>
      </div>
    </div>
  );
}
