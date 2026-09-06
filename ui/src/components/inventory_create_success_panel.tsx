import { useEffect, useRef } from "react";
import { useI18n } from "../lib/i18n";
import type { InventoryCreateSuccess } from "../lib/inventory_create_success";
import { ModalActionButton } from "./modal_action_button";
import { ModalNotice } from "./modal_chrome";

export function InventoryCreateSuccessPanel({
  busy,
  receipt,
  onOpenRoll,
  onRegisterAnother,
}: {
  busy: boolean;
  receipt: InventoryCreateSuccess;
  onOpenRoll: (spoolId: string) => void;
  onRegisterAnother: () => void;
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = busy ? panel.current : panel.current?.querySelector<HTMLButtonElement>("button");
    target?.focus();
  }, [busy, receipt.spoolId]);

  return (
    <div ref={panel} tabIndex={-1} className="mx-auto w-full max-w-xl space-y-5 outline-none">
      <ModalNotice tone="success" role="status" aria-live="polite">
        {receipt.message}
      </ModalNotice>
      <div className="grid gap-3 sm:grid-cols-2">
        <ModalActionButton size="roomy" variant="solid" disabled={busy}
          onClick={() => onOpenRoll(receipt.spoolId)}>
          {t("inventory.openCreatedRoll", "Open roll")}
        </ModalActionButton>
        <ModalActionButton size="roomy" variant="secondary" disabled={busy}
          onClick={onRegisterAnother}>
          {t("inventory.registerAnotherRoll", "Register another roll")}
        </ModalActionButton>
      </div>
    </div>
  );
}
