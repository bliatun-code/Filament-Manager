import { useI18n } from "../lib/i18n";
import type { SpoolStatus } from "../lib/inventory_list_model";

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

function inventoryDangerZoneButtonClassName(tone: InventoryDangerZoneButtonTone): string {
  const base =
    "rounded-lg border px-4 py-2 text-sm font-semibold outline-none transition focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:opacity-50 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

  if (tone === "success") {
    return `${base} border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25`;
  }
  if (tone === "critical") {
    return `${base} border-red-400 bg-red-600 text-white hover:bg-red-700 dark:border-red-400/45 dark:bg-red-500/85 dark:text-white dark:hover:bg-red-500`;
  }
  if (tone === "danger") {
    return `${base} border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/25`;
  }
  return `${base} border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-400/35 dark:bg-slate-950/55 dark:text-rose-200 dark:hover:bg-rose-500/10`;
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
