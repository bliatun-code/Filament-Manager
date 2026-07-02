import { useI18n } from "../lib/i18n";
import {
  inventoryDetailDangerActionButtonClassName,
  inventoryDetailEyebrowClassName,
  inventoryDetailFormControlClassName,
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
  value: string;
};

type InventorySpoolHomeLocationPanelProps = SpoolMaintenancePanelBaseProps & {
  assignedToPrinter: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  value: string;
};

type InventorySpoolLostStatusPanelProps = SpoolMaintenancePanelBaseProps & {
  onToggle: () => void;
  status: SpoolStatus;
};

type InventorySpoolOwnershipPanelProps = SpoolMaintenancePanelBaseProps & {
  contactValue: string;
  noteValue: string;
  onChangeContact: (value: string) => void;
  onChangeName: (value: string) => void;
  onChangeNote: (value: string) => void;
  onChangeType: (value: OwnershipType) => void;
  onSave: () => void;
  ownerNameValue: string;
  typeValue: OwnershipType;
};

export function InventorySpoolTarePanel({
  disabled,
  onChange,
  onSave,
  resolvedTheme,
  spoolHexColor,
  value,
}: InventorySpoolTarePanelProps) {
  const { t } = useI18n();

  return (
    <div
      className={inventoryDetailPanelClassName}
      style={inventorySwatchPanelStyle(spoolHexColor, resolvedTheme)}
    >
      <div className={inventoryDetailEyebrowClassName}>
        {t("inventory.emptySpoolWeight", "Empty spool weight (g)")}
      </div>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t(
          "inventory.emptySpoolWeightHelp",
          "Used to subtract spool tare from measured total so remaining filament stays accurate.",
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-28 ${inventoryDetailFormControlClassName}`}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onSave}
          className={inventoryDetailSaveButtonClassName}
          disabled={disabled}
        >
          {t("common.save", "Save")}
        </button>
      </div>
    </div>
  );
}

export function InventorySpoolHomeLocationPanel({
  assignedToPrinter,
  disabled,
  onChange,
  onSave,
  resolvedTheme,
  spoolHexColor,
  value,
}: InventorySpoolHomeLocationPanelProps) {
  const { t } = useI18n();

  return (
    <div
      className={inventoryDetailPanelClassName}
      style={inventorySwatchPanelStyle(spoolHexColor, resolvedTheme)}
    >
      <div className={inventoryDetailEyebrowClassName}>
        {t("inventory.editHomeLocation", "Home location")}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("inventory.homeLocationOptional", "Home location (optional)")}
          className={`w-full ${inventoryDetailFormControlClassName}`}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onSave}
          className={inventoryDetailSaveButtonClassName}
          disabled={disabled}
        >
          {t("common.save", "Save")}
        </button>
      </div>
      {assignedToPrinter ? (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
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
  noteValue,
  onChangeContact,
  onChangeName,
  onChangeNote,
  onChangeType,
  onSave,
  ownerNameValue,
  resolvedTheme,
  spoolHexColor,
  typeValue,
}: InventorySpoolOwnershipPanelProps) {
  const { t } = useI18n();
  const borrowed = isBorrowedInOwnership(typeValue);

  return (
    <div
      className={inventoryDetailPanelClassName}
      style={inventorySwatchPanelStyle(spoolHexColor, resolvedTheme)}
    >
      <div className={inventoryDetailEyebrowClassName}>
        {t("inventory.editOwnership", "Ownership")}
      </div>
      <SegmentedChoiceRow
        className="mt-3"
        groupClassName="w-full"
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
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={ownerNameValue}
            onChange={(event) => onChangeName(event.target.value)}
            placeholder={t("inventory.ownerNameRequired", "Owner name (required)")}
            className={`w-full ${inventoryDetailFormControlClassName}`}
            disabled={disabled}
          />
          <input
            type="text"
            value={contactValue}
            onChange={(event) => onChangeContact(event.target.value)}
            placeholder={t("inventory.ownerContactOptional", "Contact (optional)")}
            className={`w-full ${inventoryDetailFormControlClassName}`}
            disabled={disabled}
          />
          <textarea
            value={noteValue}
            onChange={(event) => onChangeNote(event.target.value)}
            placeholder={t("inventory.ownershipNoteOptional", "Note (optional)")}
            className={`min-h-20 w-full resize-y ${inventoryDetailFormControlClassName}`}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {t(
            "inventory.ownedOwnershipHelp",
            "Owned rolls stay in your inventory and can be loaned out later.",
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onSave}
        className={`mt-3 ${inventoryDetailSaveButtonClassName}`}
        disabled={disabled}
      >
        {t("inventory.saveOwnership", "Save ownership")}
      </button>
    </div>
  );
}

export function InventorySpoolLostStatusPanel({
  disabled,
  onToggle,
  resolvedTheme,
  spoolHexColor,
  status,
}: InventorySpoolLostStatusPanelProps) {
  const { t } = useI18n();

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
      >
        {status === "LOST"
          ? t("inventory.markFound", "Mark as found (in stock)")
          : t("inventory.markLost", "Mark as lost")}
      </button>
    </div>
  );
}
