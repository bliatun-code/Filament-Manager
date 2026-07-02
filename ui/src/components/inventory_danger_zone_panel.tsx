import { useI18n } from "../lib/i18n";
import type { SpoolStatus } from "../lib/inventory_list_model";
import {
  modalActionButtonClassName,
  type ModalActionButtonVariant,
} from "./modal_action_button_class";

type InventoryDangerZonePanelProps = {
  confirmDelete: boolean;
  confirmPurge: boolean;
  manageBusy: boolean;
  onDelete: () => void;
  onMarkEmpty: () => void;
  onPurge: () => void;
  onRefill: () => void;
  runtimeAvailable: boolean;
  status: SpoolStatus;
};

type InventoryDangerZoneButtonTone = "success" | "quietDanger" | "danger" | "critical";

const dangerZoneButtonVariant: Record<
  InventoryDangerZoneButtonTone,
  ModalActionButtonVariant
> = {
  critical: "critical",
  danger: "danger",
  quietDanger: "dangerQuiet",
  success: "success",
};

function inventoryDangerZoneButtonClassName(tone: InventoryDangerZoneButtonTone): string {
  return modalActionButtonClassName(dangerZoneButtonVariant[tone]);
}

export function InventoryDangerZonePanel({
  confirmDelete,
  confirmPurge,
  manageBusy,
  onDelete,
  onMarkEmpty,
  onPurge,
  onRefill,
  runtimeAvailable,
  status,
}: InventoryDangerZonePanelProps) {
  const { t } = useI18n();
  const disabled = !runtimeAvailable || manageBusy;

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm dark:border-rose-500/35 dark:bg-rose-500/10 dark:shadow-none">
      <div className="text-xs uppercase tracking-[0.2em] text-rose-600 dark:text-rose-300">
        {t("inventory.dangerZone", "Danger zone")}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {status === "EMPTY" ? (
          <button
            type="button"
            className={inventoryDangerZoneButtonClassName("success")}
            onClick={onRefill}
            disabled={disabled}
          >
            {t("inventory.refill", "Refill / Reactivate roll")}
          </button>
        ) : null}
        <button
          type="button"
          className={inventoryDangerZoneButtonClassName("quietDanger")}
          onClick={onMarkEmpty}
          disabled={disabled}
        >
          {t("inventory.markEmpty", "Mark as used up (empty)")}
        </button>
        <button
          type="button"
          className={inventoryDangerZoneButtonClassName("danger")}
          onClick={onDelete}
          disabled={disabled}
        >
          {confirmDelete
            ? t("inventory.confirmDelete", "Click again to confirm delete")
            : t("inventory.deleteRoll", "Delete roll from active inventory")}
        </button>
        <button
          type="button"
          className={inventoryDangerZoneButtonClassName("critical")}
          onClick={onPurge}
          disabled={disabled}
        >
          {confirmPurge
            ? t("inventory.confirmPurge", "Click again to confirm permanent purge")
            : t("inventory.purgeRoll", "Purge roll + all history permanently")}
        </button>
      </div>
    </div>
  );
}
