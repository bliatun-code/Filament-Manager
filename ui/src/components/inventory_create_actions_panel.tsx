import type { CSSProperties } from "react";
import { inventoryFormControlClassName } from "./form_control_class";
import { ModalActionButton } from "./modal_action_button";
import { ModalFactCard } from "./modal_chrome";
import { SegmentedChoiceRow } from "./segmented_choice_row";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { useI18n } from "../lib/i18n";
import { isBorrowedInOwnership } from "../lib/inventory_domain";
import type { InventoryCreateSelectionSummary } from "../lib/inventory_create_model";
import type { OwnershipType } from "../lib/inventory_list_model";
import { formatGrams } from "../lib/weight_display";

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
  selectionSummary: InventoryCreateSelectionSummary | null;
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
  selectionSummary,
  tauriAvailable,
}: InventoryCreateActionsPanelProps) {
  const { t } = useI18n();
  const borrowedIn = isBorrowedInOwnership(ownershipType);

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white/85 p-4 transition dark:border-slate-700 dark:bg-slate-950/70"
      style={panelStyle}
    >
      <div className="border-b border-slate-200/80 pb-4 dark:border-slate-700/80">
        <SwatchSelectionPreviewHeader
          eyebrow={t("inventory.selectionPreview", "Selection preview")}
          swatchColor={selectionSummary?.hexColor}
        >
          {selectionSummary ? (
            <>
              <div className="mt-1 break-words text-sm font-semibold leading-snug text-slate-950 dark:text-slate-50">
                {selectionSummary.title}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span>{selectionSummary.detail}</span>
                <span>{formatGrams(selectionSummary.initialWeightGrams)}</span>
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
              {t(
                "inventory.noSelectionPreview",
                "Choose a catalog row or enter manual details before saving.",
              )}
            </div>
          )}
        </SwatchSelectionPreviewHeader>
      </div>

      <ModalFactCard
        padding="none"
        surface="plain"
        className="mt-4 border-slate-200/80 bg-white/65 p-3 dark:border-slate-700/80 dark:bg-slate-950/40"
      >
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
          {borrowedIn
            ? t(
                "inventory.borrowedInHelp",
                "Register this spool as borrowed from someone else. It can still be used in printers, but it will not appear in loan-out candidates.",
              )
            : t("inventory.ownedByUsDetail", "Owned by us")}
        </div>
        {borrowedIn ? (
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
      </ModalFactCard>
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
      <ModalActionButton
        className="mt-4"
        fullWidth
        size="roomy"
        variant="solid"
        style={actionStyle}
        onClick={onCreateSpool}
        disabled={disabledCreate}
      >
        {borrowedIn
          ? t("inventory.registerBorrowedIn", "Register borrowed-in spool")
          : t("inventory.addSpool", "Add spool to inventory")}
      </ModalActionButton>

      <div className="mt-4 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
        <ModalActionButton
          fullWidth
          variant="secondary"
          onClick={onAddCurrentToWishlist}
          disabled={disabledWishlistCreate}
        >
          {t("inventory.addCurrentSelectionToWishlist", "Add current selection to wishlist")}
        </ModalActionButton>
      </div>
    </div>
  );
}
