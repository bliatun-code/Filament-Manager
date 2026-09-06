import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AppModal } from "./app_modal";
import { ModalActionButton } from "./modal_action_button";
import { ModalBody, ModalFooter, ModalHeader, ModalNotice } from "./modal_chrome";

export function SettingsBackupImportConfirmation({
  fileName,
  onConfirm,
  onCancel,
  returnFocusElement,
  t,
}: {
  fileName: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocusElement?: HTMLElement | null;
  t: (key: string, fallback?: string) => string;
}) {
  const portalRoot = useRef<HTMLDivElement>(null);
  const open = fileName !== null;

  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    const previousInert = new Map<HTMLElement, boolean>();
    for (const sibling of document.body.children) {
      if (!(sibling instanceof HTMLElement) || sibling === portalRoot.current) continue;
      previousInert.set(sibling, sibling.inert);
      sibling.inert = true;
    }
    document.body.style.overflow = "hidden";
    return () => {
      // Restore interaction before AppModal's passive return-focus cleanup.
      for (const [sibling, inert] of previousInert) sibling.inert = inert;
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const title = t("settings.importDataFile", "Import backup/data file");
  const modal = (
    <div ref={portalRoot}>
      <AppModal
        ariaLabel={title}
        closeOnBackdrop
        onBackdropClose={onCancel}
        returnFocusElement={returnFocusElement}
        zIndex={90}
        panelClassName="app-modal-panel flex max-h-[calc(100dvh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border backdrop-blur-xl"
      >
        <ModalHeader
          title={title}
          closeLabel={t("common.close", "Close")}
          onClose={onCancel}
        />
        <ModalBody className="space-y-4 px-5 py-4" overscrollContain>
          <div className="break-all text-sm font-semibold text-slate-900 dark:text-slate-100">{fileName}</div>
          <ModalNotice tone="warning" className="whitespace-pre-line">
            {t("settings.confirmImportBackup", "Import full backup now?\n\nThis will replace current inventory, history, configured printers and maintenance data.")}
          </ModalNotice>
        </ModalBody>
        <ModalFooter className="grid grid-cols-2 gap-3 px-5 py-4">
          <ModalActionButton autoFocus fullWidth size="roomy" onClick={onCancel}>
            {t("common.cancel", "Cancel")}
          </ModalActionButton>
          <ModalActionButton fullWidth size="roomy" variant="solid" onClick={onConfirm}>
            {title}
          </ModalActionButton>
        </ModalFooter>
      </AppModal>
    </div>
  );

  return typeof document === "undefined" ? modal : createPortal(modal, document.body);
}
