import { useId } from "react";
import { useI18n } from "../lib/i18n";
import { INVENTORY_LOCATION_DATALIST_ID } from "./inventory_location_datalist";
import {
  inventoryDetailDangerActionButtonClassName,
  inventoryDetailEyebrowClassName,
  inventoryDetailFormControlClassName,
  inventoryDetailLabelClassName,
  inventoryDetailPanelClassName,
  inventoryDetailSaveButtonClassName,
} from "./inventory_detail_panel_class";
import { SegmentedChoiceRow } from "./segmented_choice_row";
import { isBorrowedInOwnership } from "../lib/inventory_domain";
import type { OwnershipType, SpoolStatus } from "../lib/inventory_list_model";
import { inventorySwatchPanelStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";

type SpoolMaintenancePanelBaseProps = {
  disabled: boolean;
  resolvedTheme: ResolvedTheme;
  spoolHexColor?: string | null;
};

type InventorySpoolTarePanelProps = SpoolMaintenancePanelBaseProps & {
  onChange: (value: string) => void;
  onSave: () => void;
  showSaveAction?: boolean;
  value: string;
};

type InventorySpoolHomeLocationPanelProps = SpoolMaintenancePanelBaseProps & {
  assignedToPrinter: boolean;
  loanedOut?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  showSaveAction?: boolean;
  value: string;
};

type InventorySpoolLostStatusPanelProps = SpoolMaintenancePanelBaseProps & {
  loanedOut?: boolean;
  onToggle: () => void;
  status: SpoolStatus;
};

type InventorySpoolOwnershipPanelProps = SpoolMaintenancePanelBaseProps & {
  contactValue: string;
  noteValue: string;
  loanedOut?: boolean;
  onChangeContact: (value: string) => void;
  onChangeName: (value: string) => void;
  onChangeNote: (value: string) => void;
  onChangeType: (value: OwnershipType) => void;
  onSave: () => void;
  showSaveAction?: boolean;
  ownerNameValue: string;
  typeValue: OwnershipType;
};

export function InventorySpoolTarePanel({
  disabled,
  onChange,
  onSave,
  resolvedTheme,
  showSaveAction = true,
  spoolHexColor,
  value,
}: InventorySpoolTarePanelProps) {
  const { t } = useI18n();
  const generatedId = useId().replace(/:/g, "");
  const inputId = `inventory-spool-tare-${generatedId}`;
  const helpId = `${inputId}-help`;

  return (
    <div
      className={inventoryDetailPanelClassName}
      style={inventorySwatchPanelStyle(spoolHexColor, resolvedTheme)}
    >
      <label htmlFor={inputId} className={inventoryDetailEyebrowClassName}>
        {t("inventory.emptySpoolWeight", "Empty spool weight (g)")}
      </label>
      <div id={helpId} className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t(
          "inventory.emptySpoolWeightHelp",
          "Used to subtract spool tare from measured total so remaining filament stays accurate.",
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <input
          id={inputId}
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-28 ${inventoryDetailFormControlClassName}`}
          disabled={disabled}
          aria-describedby={helpId}
        />
        {showSaveAction ? (
          <button
            type="button"
            onClick={onSave}
            className={inventoryDetailSaveButtonClassName}
            disabled={disabled}
          >
            {t("common.save", "Save")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function InventorySpoolHomeLocationPanel({
  assignedToPrinter,
  disabled,
  loanedOut = false,
  onChange,
  onSave,
  resolvedTheme,
  showSaveAction = true,
  spoolHexColor,
  value,
}: InventorySpoolHomeLocationPanelProps) {
  const { t } = useI18n();
  const generatedId = useId().replace(/:/g, "");
  const inputId = `inventory-spool-home-location-${generatedId}`;
  const helpId = `${inputId}-help`;

  return (
    <div
      className={inventoryDetailPanelClassName}
      style={inventorySwatchPanelStyle(spoolHexColor, resolvedTheme)}
    >
      <label htmlFor={inputId} className={inventoryDetailEyebrowClassName}>
        {t("inventory.editHomeLocation", "Home location")}
      </label>
      <div className="mt-3 flex items-center gap-3">
        <input
          id={inputId}
          type="text"
          list={INVENTORY_LOCATION_DATALIST_ID}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("inventory.homeLocationOptional", "Home location (optional)")}
          className={`w-full ${inventoryDetailFormControlClassName}`}
          disabled={disabled}
          aria-describedby={assignedToPrinter || loanedOut ? helpId : undefined}
        />
        {showSaveAction ? (
          <button
            type="button"
            onClick={onSave}
            className={inventoryDetailSaveButtonClassName}
            disabled={disabled}
          >
            {t("common.save", "Save")}
          </button>
        ) : null}
      </div>
      {loanedOut ? (
        <div id={helpId} className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {t(
            "errors.loanedSpoolEditBlocked",
            "Return the loan before editing this roll's status, location, or ownership.",
          )}
        </div>
      ) : assignedToPrinter ? (
        <div id={helpId} className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {t(
            "inventory.homeLocationHintWhileAssigned",
            "Current placement is managed on the Printers page. Home location is where the spool returns when it is no longer loaded.",
          )}
        </div>
      ) : null}
    </div>
  );
}

export function InventorySpoolOwnershipPanel({
  contactValue,
  disabled,
  loanedOut = false,
  noteValue,
  onChangeContact,
  onChangeName,
  onChangeNote,
  onChangeType,
  onSave,
  ownerNameValue,
  resolvedTheme,
  showSaveAction = true,
  spoolHexColor,
  typeValue,
}: InventorySpoolOwnershipPanelProps) {
  const { t } = useI18n();
  const borrowed = isBorrowedInOwnership(typeValue);
  const generatedId = useId().replace(/:/g, "");
  const fieldIdPrefix = `inventory-spool-ownership-${generatedId}`;
  const ownerNameId = `${fieldIdPrefix}-owner-name`;
  const ownerContactId = `${fieldIdPrefix}-owner-contact`;
  const ownershipNoteId = `${fieldIdPrefix}-note`;
  const ownedHelpId = `${fieldIdPrefix}-owned-help`;
  const loanedHelpId = `${fieldIdPrefix}-loaned-help`;

  return (
    <div
      className={inventoryDetailPanelClassName}
      style={inventorySwatchPanelStyle(spoolHexColor, resolvedTheme)}
    >
      <fieldset
        className="min-w-0 border-0 p-0"
        aria-describedby={loanedOut ? loanedHelpId : borrowed ? undefined : ownedHelpId}
      >
        <legend className={inventoryDetailEyebrowClassName}>
          {t("inventory.editOwnership", "Ownership")}
        </legend>
        <SegmentedChoiceRow
          className="mt-3"
          groupClassName="w-full"
          label={t("inventory.ownershipType", "Ownership type")}
          optionSizeClassName="flex-1 justify-center px-3 py-2 text-sm"
          value={typeValue}
          onChange={onChangeType}
          isOptionDisabled={() => disabled}
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
        {borrowed ? (
          <div className="mt-3 space-y-2.5">
            <label htmlFor={ownerNameId} className="block">
              <span className={inventoryDetailLabelClassName}>
                {t("inventory.ownerNameRequired", "Owner name (required)")}
              </span>
              <input
                id={ownerNameId}
                type="text"
                value={ownerNameValue}
                onChange={(event) => onChangeName(event.target.value)}
                placeholder={t("inventory.ownerNameRequired", "Owner name (required)")}
                className={`mt-1.5 w-full ${inventoryDetailFormControlClassName}`}
                disabled={disabled}
              />
            </label>
            <label htmlFor={ownerContactId} className="block">
              <span className={inventoryDetailLabelClassName}>
                {t("inventory.ownerContactOptional", "Contact (optional)")}
              </span>
              <input
                id={ownerContactId}
                type="text"
                value={contactValue}
                onChange={(event) => onChangeContact(event.target.value)}
                placeholder={t("inventory.ownerContactOptional", "Contact (optional)")}
                className={`mt-1.5 w-full ${inventoryDetailFormControlClassName}`}
                disabled={disabled}
              />
            </label>
            <label htmlFor={ownershipNoteId} className="block">
              <span className={inventoryDetailLabelClassName}>
                {t("inventory.ownershipNoteOptional", "Note (optional)")}
              </span>
              <textarea
                id={ownershipNoteId}
                value={noteValue}
                onChange={(event) => onChangeNote(event.target.value)}
                placeholder={t("inventory.ownershipNoteOptional", "Note (optional)")}
                className={`mt-1.5 min-h-20 w-full resize-y ${inventoryDetailFormControlClassName}`}
                disabled={disabled}
              />
            </label>
          </div>
        ) : !loanedOut ? (
          <div
            id={ownedHelpId}
            className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
          >
            {t(
              "inventory.ownedOwnershipHelp",
              "Owned rolls stay in your inventory and can be loaned out later.",
            )}
          </div>
        ) : null}
        {loanedOut ? (
          <div
            id={loanedHelpId}
            className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
          >
            {t(
              "errors.loanedSpoolEditBlocked",
              "Return the loan before editing this roll's status, location, or ownership.",
            )}
          </div>
        ) : null}
        {showSaveAction ? (
          <button
            type="button"
            onClick={onSave}
            className={`mt-3 ${inventoryDetailSaveButtonClassName}`}
            disabled={disabled}
          >
            {t("inventory.saveOwnership", "Save ownership")}
          </button>
        ) : null}
      </fieldset>
    </div>
  );
}

export function InventorySpoolLostStatusPanel({
  disabled,
  loanedOut = false,
  onToggle,
  resolvedTheme,
  spoolHexColor,
  status,
}: InventorySpoolLostStatusPanelProps) {
  const { t } = useI18n();
  const generatedId = useId().replace(/:/g, "");
  const helpId = `inventory-spool-lost-status-${generatedId}-help`;

  return (
    <div
      className={inventoryDetailPanelClassName}
      style={inventorySwatchPanelStyle(spoolHexColor, resolvedTheme)}
    >
      <div className={inventoryDetailEyebrowClassName}>
        {t("inventory.lostStatus", "Lost status")}
      </div>
      <button
        type="button"
        className={`mt-3 ${inventoryDetailDangerActionButtonClassName}`}
        onClick={onToggle}
        disabled={disabled}
        aria-describedby={loanedOut ? helpId : undefined}
      >
        {status === "LOST"
          ? t("inventory.markFound", "Mark as found (in stock)")
          : t("inventory.markLost", "Mark as lost")}
      </button>
      {loanedOut ? (
        <div id={helpId} className="sr-only">
          {t(
            "errors.loanedSpoolEditBlocked",
            "Return the loan before editing this roll's status, location, or ownership.",
          )}
        </div>
      ) : null}
    </div>
  );
}
