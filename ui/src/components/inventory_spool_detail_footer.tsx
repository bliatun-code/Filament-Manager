import { useEffect, useRef } from "react";
import { useI18n } from "../lib/i18n";
import { inventorySpoolDetailFooterFocusTarget } from "../lib/inventory_spool_detail_footer_focus";
import { inventoryDetailSaveButtonClassName } from "./inventory_detail_panel_class";
import { ModalFooter, ModalNotice } from "./modal_chrome";
import { appSoftButtonClassName, joinClassNames } from "./ui_class_names";

type InventorySpoolDetailFooterProps = {
  discardConfirmationOpen: boolean;
  hasCommonChanges: boolean;
  hasUnsavedChanges: boolean;
  manageBusy: boolean;
  onCancel: () => void;
  onCancelDiscardConfirmation: () => void;
  onConfirmDiscard: () => void;
  onSaveCommonDetails: () => void;
  runtimeAvailable: boolean;
};

export function InventorySpoolDetailFooter({
  discardConfirmationOpen,
  hasCommonChanges,
  hasUnsavedChanges,
  manageBusy,
  onCancel,
  onCancelDiscardConfirmation,
  onConfirmDiscard,
  onSaveCommonDetails,
  runtimeAvailable,
}: InventorySpoolDetailFooterProps) {
  const { t } = useI18n();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const keepEditingButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousDiscardConfirmationOpenRef = useRef(false);

  useEffect(() => {
    const focusTarget = inventorySpoolDetailFooterFocusTarget({
      discardConfirmationOpen,
      manageBusy,
      wasDiscardConfirmationOpen: previousDiscardConfirmationOpenRef.current,
    });
    previousDiscardConfirmationOpenRef.current = discardConfirmationOpen;
    if (focusTarget === "keep-editing") {
      keepEditingButtonRef.current?.focus();
    } else if (focusTarget === "cancel") {
      cancelButtonRef.current?.focus();
    }
  }, [discardConfirmationOpen, manageBusy]);

  return (
    <ModalFooter className="flex flex-wrap items-center justify-between gap-3 bg-white/95 px-4 py-3 dark:bg-slate-900/95 sm:px-5">
      {discardConfirmationOpen ? (
        <ModalNotice
          className="w-full"
          data-testid="inventory-spool-discard-confirmation"
          role="alert"
          tone="warning"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-semibold">
              {t(
                "inventory.discardUnsavedChanges",
                "Discard unsaved roll changes? Your edits will be lost.",
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                ref={keepEditingButtonRef}
                type="button"
                className={joinClassNames(appSoftButtonClassName, "px-4 py-2 text-sm")}
                disabled={manageBusy}
                onClick={onCancelDiscardConfirmation}
              >
                {t("settings.printerKeepEditing", "Keep editing")}
              </button>
              <button
                type="button"
                className={inventoryDetailSaveButtonClassName}
                disabled={manageBusy}
                onClick={onConfirmDiscard}
              >
                {t("settings.printerDiscardChanges", "Discard changes")}
              </button>
            </div>
          </div>
        </ModalNotice>
      ) : (
        <>
          <div className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
            {hasUnsavedChanges
              ? t("inventory.unsavedChanges", "You have unsaved changes.")
              : t("inventory.allChangesSaved", "All changes are saved.")}
          </div>
          <div className="flex items-center gap-3">
            <button
              ref={cancelButtonRef}
              type="button"
              className={joinClassNames(appSoftButtonClassName, "px-4 py-2 text-sm")}
              disabled={manageBusy}
              onClick={onCancel}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className={inventoryDetailSaveButtonClassName}
              disabled={!runtimeAvailable || manageBusy || !hasCommonChanges}
              onClick={onSaveCommonDetails}
            >
              {manageBusy
                ? t("inventory.updatingRoll", "Updating selected roll...")
                : t("inventory.saveRollChanges", "Save roll changes")}
            </button>
          </div>
        </>
      )}
    </ModalFooter>
  );
}
