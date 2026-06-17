import { useI18n } from "../lib/i18n";
import { inventoryDetailPanelClassName } from "./inventory_detail_panel_class";
import type { OwnershipType, SpoolStatus } from "../lib/inventory_list_model";
import { inventorySwatchPanelStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";

type SpoolMaintenancePanelBaseProps = {
  disabled: boolean;
  resolvedTheme: ResolvedTheme;
  spoolHexColor?: string | null;
};

const inventoryMaintenanceInputClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100";
const inventoryMaintenanceSaveButtonClass =
  "rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-300/30 transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none dark:hover:bg-white";

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
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
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
          className={`w-28 ${inventoryMaintenanceInputClass}`}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onSave}
          className={inventoryMaintenanceSaveButtonClass}
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
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        {t("inventory.editHomeLocation", "Home location")}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("inventory.homeLocationOptional", "Home location (optional)")}
          className={`w-full ${inventoryMaintenanceInputClass}`}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onSave}
          className={inventoryMaintenanceSaveButtonClass}
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
  const borrowed = typeValue === "BORROWED_IN";

  return (
    <div
      className={inventoryDetailPanelClassName}
      style={inventorySwatchPanelStyle(spoolHexColor, resolvedTheme)}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        {t("inventory.editOwnership", "Ownership")}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-100/70 p-1 dark:border-slate-700 dark:bg-slate-950/40">
        <button
          type="button"
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            typeValue === "OWNED"
              ? "bg-white text-slate-950 shadow-sm dark:bg-slate-100 dark:text-slate-950"
              : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => onChangeType("OWNED")}
          disabled={disabled}
        >
          {t("inventory.ownedByUs", "Owned")}
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            borrowed
              ? "bg-white text-slate-950 shadow-sm dark:bg-slate-100 dark:text-slate-950"
              : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => onChangeType("BORROWED_IN")}
          disabled={disabled}
        >
          {t("inventory.borrowedIn", "Borrowed in")}
        </button>
      </div>
      {borrowed ? (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={ownerNameValue}
            onChange={(event) => onChangeName(event.target.value)}
            placeholder={t("inventory.ownerNameRequired", "Owner name (required)")}
            className={`w-full ${inventoryMaintenanceInputClass}`}
            disabled={disabled}
          />
          <input
            type="text"
            value={contactValue}
            onChange={(event) => onChangeContact(event.target.value)}
            placeholder={t("inventory.ownerContactOptional", "Contact (optional)")}
            className={`w-full ${inventoryMaintenanceInputClass}`}
            disabled={disabled}
          />
          <textarea
            value={noteValue}
            onChange={(event) => onChangeNote(event.target.value)}
            placeholder={t("inventory.ownershipNoteOptional", "Note (optional)")}
            className={`min-h-20 w-full resize-y ${inventoryMaintenanceInputClass}`}
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
        className={`mt-3 ${inventoryMaintenanceSaveButtonClass}`}
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
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        {t("inventory.lostStatus", "Lost status")}
      </div>
      <button
        type="button"
        className="mt-3 w-full rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200"
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
