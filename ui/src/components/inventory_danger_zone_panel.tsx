import { useEffect, useState, type SyntheticEvent } from "react";
import { useI18n } from "../lib/i18n";
import type { SpoolStatus } from "../lib/inventory_list_model";
import {
  modalActionButtonClassName,
  type ModalActionButtonVariant,
} from "./modal_action_button_class";
import { appControlFocusClassName } from "./ui_class_names";

type TranslateFn = (key: string, fallback?: string) => string;

type InventoryDangerZonePanelProps = {
  confirmDelete: boolean;
  confirmPurge: boolean;
  manageBusy: boolean;
  loanedOut?: boolean;
  onCancelConfirmation: () => void;
  onDelete: () => void;
  onMarkEmpty: () => void;
  onPurge: () => void;
  onRefill: () => void;
  rollLabel: string;
  runtimeAvailable: boolean;
  status: SpoolStatus;
};

type InventoryDangerZoneButtonTone = "success" | "quietDanger" | "danger" | "critical";
type InventoryDangerZoneConfirmationTone = "caution" | "danger" | "critical";

const dangerZoneButtonVariant: Record<
  InventoryDangerZoneButtonTone,
  ModalActionButtonVariant
> = {
  critical: "critical",
  danger: "danger",
  quietDanger: "dangerQuiet",
  success: "success",
};

const confirmationClassName: Record<InventoryDangerZoneConfirmationTone, string> = {
  caution:
    "border-amber-300 bg-amber-50/95 text-amber-950 dark:border-amber-400/45 dark:bg-amber-500/15 dark:text-amber-100",
  danger:
    "border-rose-300 bg-rose-50/95 text-rose-950 dark:border-rose-400/45 dark:bg-rose-500/15 dark:text-rose-100",
  critical:
    "border-red-500 bg-red-50 text-red-950 shadow-sm shadow-red-200/40 dark:border-red-400/60 dark:bg-red-500/20 dark:text-red-50 dark:shadow-none",
};

function inventoryDangerZoneButtonClassName(tone: InventoryDangerZoneButtonTone): string {
  return modalActionButtonClassName(dangerZoneButtonVariant[tone]);
}

function InventoryDangerZoneConfirmation({
  cancelDisabled,
  cancelLabel,
  confirmDisabled,
  confirmLabel,
  confirmTone,
  hint,
  id,
  onCancel,
  onConfirm,
  rollLabel,
  selectedRollLabel,
  title,
  tone,
}: {
  cancelDisabled: boolean;
  cancelLabel: string;
  confirmDisabled: boolean;
  confirmLabel: string;
  confirmTone: InventoryDangerZoneButtonTone;
  hint: string;
  id: string;
  onCancel: () => void;
  onConfirm: () => void;
  rollLabel: string;
  selectedRollLabel: string;
  title: string;
  tone: InventoryDangerZoneConfirmationTone;
}) {
  return (
    <div
      id={id}
      className={`rounded-xl border p-3 ${confirmationClassName[tone]}`}
      role="alert"
      aria-labelledby={`${id}-title`}
    >
      <div id={`${id}-title`} className="font-semibold">
        {title}
      </div>
      <div className="mt-2 rounded-lg border border-current/15 bg-white/45 px-3 py-2 dark:bg-slate-950/20">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
          {selectedRollLabel}
        </div>
        <div className="mt-0.5 break-words text-sm font-semibold">{rollLabel}</div>
      </div>
      <div className="mt-2 text-xs leading-5 opacity-85">{hint}</div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={`w-full sm:w-auto ${inventoryDangerZoneButtonClassName(confirmTone)}`}
          onClick={onConfirm}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className={`w-full sm:w-auto ${modalActionButtonClassName("secondary")}`}
          onClick={onCancel}
          disabled={cancelDisabled}
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

export type InventoryDangerZonePanelViewProps = {
  blockedReason?: string;
  cancelDisabled: boolean;
  confirmDelete: boolean;
  confirmMarkEmpty: boolean;
  confirmPurge: boolean;
  disabled: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onMarkEmpty: () => void;
  onPurge: () => void;
  onRefill: () => void;
  onRequestMarkEmpty: () => void;
  rollLabel: string;
  status: SpoolStatus;
  t: TranslateFn;
};

export function InventoryDangerZonePanelView({
  blockedReason,
  cancelDisabled,
  confirmDelete,
  confirmMarkEmpty,
  confirmPurge,
  disabled,
  onCancel,
  onDelete,
  onMarkEmpty,
  onPurge,
  onRefill,
  onRequestMarkEmpty,
  rollLabel,
  status,
  t,
}: InventoryDangerZonePanelViewProps) {
  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open) {
      onCancel();
    }
  };
  const selectedRollLabel = t("inventory.selectedRoll", "Selected roll");
  const cancelLabel = t("common.cancel", "Cancel");

  return (
    <details
      id="inventory-danger-zone-panel"
      className="group rounded-2xl border border-rose-200 bg-rose-50/55 shadow-sm dark:border-rose-500/35 dark:bg-rose-500/10 dark:shadow-none"
      aria-describedby="inventory-danger-zone-hint"
      onToggle={handleToggle}
    >
      <summary
        className={`flex cursor-pointer list-none items-start justify-between gap-4 rounded-2xl p-5 outline-none ${appControlFocusClassName}`}
        aria-controls="inventory-danger-zone-actions"
      >
        <span>
          <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-300">
            {t("inventory.dangerZone", "Danger zone")}
          </span>
          <span
            id="inventory-danger-zone-hint"
            className="mt-1.5 block max-w-xl text-xs leading-5 text-rose-800/80 dark:text-rose-100/75"
          >
            {t(
              "inventory.dangerZoneHint",
              "Open only when you need to empty, remove or permanently purge this roll.",
            )}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="mt-1 text-lg leading-none text-rose-500 transition-transform group-open:rotate-180 dark:text-rose-300"
        >
          ⌄
        </span>
      </summary>

      <div
        id="inventory-danger-zone-actions"
        className="grid grid-cols-1 gap-3 border-t border-rose-200/80 px-5 pb-5 pt-4 dark:border-rose-500/30"
      >
        {blockedReason ? (
          <div className="text-xs leading-5 text-rose-800/80 dark:text-rose-100/75" role="note">
            {blockedReason}
          </div>
        ) : null}
        {status === "EMPTY" ? (
          <button
            type="button"
            className={inventoryDangerZoneButtonClassName("success")}
            onClick={onRefill}
            disabled={disabled}
          >
            {t("inventory.refill", "Refill / Reactivate roll")}
          </button>
        ) : confirmMarkEmpty ? (
          <InventoryDangerZoneConfirmation
            cancelDisabled={cancelDisabled}
            cancelLabel={cancelLabel}
            confirmDisabled={disabled}
            confirmLabel={t("inventory.confirmMarkEmptyAction", "Mark roll as empty")}
            confirmTone="quietDanger"
            hint={t(
              "inventory.markEmptyConfirmHint",
              "Remaining weight will be set to 0 g. If the roll is loaded in a printer slot, it will be removed from that slot.",
            )}
            id="inventory-mark-empty-confirmation"
            onCancel={onCancel}
            onConfirm={onMarkEmpty}
            rollLabel={rollLabel}
            selectedRollLabel={selectedRollLabel}
            title={t("inventory.markEmptyConfirmTitle", "Mark this roll as empty?")}
            tone="caution"
          />
        ) : (
          <button
            id="inventory-mark-empty-request"
            type="button"
            className={inventoryDangerZoneButtonClassName("quietDanger")}
            onClick={onRequestMarkEmpty}
            disabled={disabled}
          >
            {t("inventory.markEmpty", "Mark as used up (empty)")}
          </button>
        )}

        {confirmDelete ? (
          <InventoryDangerZoneConfirmation
            cancelDisabled={cancelDisabled}
            cancelLabel={cancelLabel}
            confirmDisabled={disabled}
            confirmLabel={t("inventory.confirmDeleteAction", "Delete from active inventory")}
            confirmTone="danger"
            hint={t(
              "inventory.deleteConfirmHint",
              "The roll disappears from active inventory, while its recorded history is retained.",
            )}
            id="inventory-delete-confirmation"
            onCancel={onCancel}
            onConfirm={onDelete}
            rollLabel={rollLabel}
            selectedRollLabel={selectedRollLabel}
            title={t(
              "inventory.deleteConfirmTitle",
              "Delete this roll from active inventory?",
            )}
            tone="danger"
          />
        ) : (
          <button
            type="button"
            className={inventoryDangerZoneButtonClassName("danger")}
            onClick={onDelete}
            disabled={disabled}
          >
            {t("inventory.deleteRoll", "Delete roll from active inventory")}
          </button>
        )}

        {confirmPurge ? (
          <InventoryDangerZoneConfirmation
            cancelDisabled={cancelDisabled}
            cancelLabel={cancelLabel}
            confirmDisabled={disabled}
            confirmLabel={t("inventory.confirmPurgeAction", "Purge roll permanently")}
            confirmTone="critical"
            hint={t(
              "inventory.purgeConfirmHint",
              "This cannot be undone. The roll and every recorded history event will be deleted.",
            )}
            id="inventory-purge-confirmation"
            onCancel={onCancel}
            onConfirm={onPurge}
            rollLabel={rollLabel}
            selectedRollLabel={selectedRollLabel}
            title={t(
              "inventory.purgeConfirmTitle",
              "Permanently purge this roll and all history?",
            )}
            tone="critical"
          />
        ) : (
          <button
            type="button"
            className={inventoryDangerZoneButtonClassName("critical")}
            onClick={onPurge}
            disabled={disabled}
          >
            {t("inventory.purgeRoll", "Purge roll + all history permanently")}
          </button>
        )}
      </div>
    </details>
  );
}

export function InventoryDangerZonePanel({
  confirmDelete,
  confirmPurge,
  manageBusy,
  loanedOut = false,
  onCancelConfirmation,
  onDelete,
  onMarkEmpty,
  onPurge,
  onRefill,
  rollLabel,
  runtimeAvailable,
  status,
}: InventoryDangerZonePanelProps) {
  const { t } = useI18n();
  const [confirmMarkEmpty, setConfirmMarkEmpty] = useState(false);
  const disabled = !runtimeAvailable || manageBusy || loanedOut;

  useEffect(() => {
    setConfirmMarkEmpty(false);
  }, [rollLabel]);

  const cancelConfirmation = () => {
    setConfirmMarkEmpty(false);
    onCancelConfirmation();
  };
  const requestMarkEmpty = () => {
    onCancelConfirmation();
    setConfirmMarkEmpty(true);
  };
  const requestDelete = () => {
    setConfirmMarkEmpty(false);
    onDelete();
  };
  const confirmMarkEmptyAction = () => {
    setConfirmMarkEmpty(false);
    onMarkEmpty();
  };
  const requestPurge = () => {
    setConfirmMarkEmpty(false);
    onPurge();
  };

  return (
    <InventoryDangerZonePanelView
      blockedReason={
        loanedOut
          ? t(
              "errors.spoolActiveLoan",
              "Return the active loan before removing this roll.",
            )
          : undefined
      }
      cancelDisabled={manageBusy}
      confirmDelete={confirmDelete}
      confirmMarkEmpty={confirmMarkEmpty}
      confirmPurge={confirmPurge}
      disabled={disabled}
      onCancel={cancelConfirmation}
      onDelete={requestDelete}
      onMarkEmpty={confirmMarkEmptyAction}
      onPurge={requestPurge}
      onRefill={onRefill}
      onRequestMarkEmpty={requestMarkEmpty}
      rollLabel={rollLabel}
      status={status}
      t={t}
    />
  );
}
