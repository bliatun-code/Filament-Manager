import { formatFilamentDisplayTitle } from "../lib/display_format";
import { useI18n, type Locale } from "../lib/i18n";
import type { OwnershipType } from "../lib/inventory_list_model";
import {
  formatDateTime,
  swatchCssBackground,
} from "../lib/printer_live_display";
import { formatPrinterSlotLabelForModel } from "../lib/printer_profiles";
import {
  buildSlotCatalogOnboardingSaveState,
  type SlotCatalogOnboardingPrompt,
} from "../lib/printer_slot_model";
import { AppModal } from "./app_modal";
import { modalFormInputClassName } from "./form_control_class";
import { ModalHeader } from "./modal_chrome";
import { modalPanelClassName } from "./modal_panel_class";
import { SegmentedChoiceRow } from "./segmented_choice_row";

type SlotCatalogOnboardingModalProps = {
  busy: boolean;
  locale: Locale;
  prompt: SlotCatalogOnboardingPrompt;
  onBorrowedFromContactChange: (value: string) => void;
  onBorrowedFromNameChange: (value: string) => void;
  onBorrowedInNoteChange: (value: string) => void;
  onClose: () => void;
  onInitialWeightChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onOwnershipTypeChange: (value: OwnershipType) => void;
  onSave: () => void;
};

export function SlotCatalogOnboardingModal({
  busy,
  locale,
  prompt,
  onBorrowedFromContactChange,
  onBorrowedFromNameChange,
  onBorrowedInNoteChange,
  onClose,
  onInitialWeightChange,
  onLocationChange,
  onOwnershipTypeChange,
  onSave,
}: SlotCatalogOnboardingModalProps) {
  const { t } = useI18n();
  const saveState = buildSlotCatalogOnboardingSaveState(prompt, { busy });
  const observedRfid = saveState.observedRfid;
  const isBorrowedIn = prompt.ownershipType === "BORROWED_IN";
  const slotAlreadyAssigned = Boolean(prompt.slot.spool_id);
  const saveDisabled = saveState.disabled;

  return (
    <AppModal
      closeOnBackdrop
      onBackdropClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      panelClassName={modalPanelClassName("lg", "p-0")}
    >
      <div>
        <ModalHeader
          eyebrow={t("printers.slotOnboarding", "AMS onboarding")}
          title={t("printers.addCatalogRollAndSaveRfid", "Add + save RFID")}
          subtitle={`${prompt.printerName} · ${formatPrinterSlotLabelForModel(t, prompt.printerModel, {
            ams_id: prompt.slot.ams_id,
            slot_index: prompt.slot.slot_index,
          })}`}
          onClose={onClose}
          closeLabel={t("common.close", "Close")}
          disabled={busy}
          className="px-6 py-5"
        />

        <div className="space-y-4 px-6 py-6">
          {slotAlreadyAssigned ? (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100">
              {t(
                "printers.slotOnboardingOccupied",
                "This slot already has a roll assigned. Clear or swap it through the normal slot flow before creating a new roll from the live AMS signal.",
              )}
            </div>
          ) : null}

          <div className="surface-card space-y-4">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className="mt-1 h-10 w-10 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700"
                style={{ background: swatchCssBackground(prompt.master.hex_color) }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {formatFilamentDisplayTitle(
                    prompt.master.material,
                    prompt.master.filament_name,
                    prompt.master.color_name,
                  )}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {prompt.master.vendor} · {prompt.master.default_weight} g
                  {prompt.master.is_discontinued
                    ? ` · ${t("common.discontinued", "Discontinued")}`
                    : ""}
                </div>
              </div>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidObservedTag", "Observed RFID")}
                </dt>
                <dd className="mt-1 break-all font-mono text-slate-900 dark:text-slate-100">
                  {observedRfid || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {t("inventory.rfidLastSeen", "Last seen")}
                </dt>
                <dd className="mt-1 text-slate-900 dark:text-slate-100">
                  {prompt.observedAt ? formatDateTime(prompt.observedAt, locale) : "-"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white/75 p-4 dark:border-slate-700/80 dark:bg-slate-950/45">
            <SegmentedChoiceRow
              label={t("inventory.ownership", "Ownership")}
              value={prompt.ownershipType}
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
              {isBorrowedIn
                ? t(
                    "inventory.borrowedInHelp",
                    "Register this spool as borrowed from someone else. It can still be used in printers, but it will not appear in loan-out candidates.",
                  )
                : t("inventory.ownedByUsDetail", "Owned by us")}
            </div>

            {isBorrowedIn ? (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t("inventory.borrowedFrom", "Borrowed from")}
                  <input
                    type="text"
                    value={prompt.borrowedFromName}
                    onChange={(event) => onBorrowedFromNameChange(event.target.value)}
                    className={modalFormInputClassName}
                    autoFocus
                  />
                </label>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t("inventory.ownerContactOptional", "Owner contact (optional)")}
                  <input
                    type="text"
                    value={prompt.borrowedFromContact}
                    onChange={(event) => onBorrowedFromContactChange(event.target.value)}
                    className={modalFormInputClassName}
                  />
                </label>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
                  {t("inventory.borrowedInNoteOptional", "Borrowed-in note (optional)")}
                  <input
                    type="text"
                    value={prompt.borrowedInNote}
                    onChange={(event) => onBorrowedInNoteChange(event.target.value)}
                    className={modalFormInputClassName}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t("inventory.initialWeight", "Initial weight (g)")}
              <input
                type="number"
                min={0}
                value={prompt.initialWeight}
                onChange={(event) => onInitialWeightChange(event.target.value)}
                className={modalFormInputClassName}
                autoFocus={!isBorrowedIn}
              />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t("inventory.homeLocationOptional", "Home location (optional)")}
              <input
                type="text"
                value={prompt.location}
                onChange={(event) => onLocationChange(event.target.value)}
                className={modalFormInputClassName}
              />
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800/60"
              onClick={onClose}
              disabled={busy}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="rounded-lg border border-sky-300 bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50 dark:border-sky-400/40 dark:bg-sky-500 dark:hover:bg-sky-400"
              onClick={onSave}
              disabled={saveDisabled}
            >
              {isBorrowedIn
                ? t("printers.addBorrowedCatalogRollAndSaveRfid", "Add borrowed-in + save RFID")
                : t("printers.addCatalogRollAndSaveRfid", "Add + save RFID")}
            </button>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
