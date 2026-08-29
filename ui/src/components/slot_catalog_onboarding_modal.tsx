import { formatFilamentDisplayTitle } from "../lib/display_format";
import { useI18n, type Locale } from "../lib/i18n";
import { isBorrowedInOwnership } from "../lib/inventory_domain";
import type { OwnershipType } from "../lib/inventory_list_model";
import { inventorySwatchPanelStyle } from "../lib/inventory_swatch_style";
import { formatDateTime } from "../lib/printer_live_display";
import { formatPrinterSlotLabelForModel } from "../lib/printer_profiles";
import { formatGrams, parsePositiveWeight } from "../lib/weight_display";
import {
  buildSlotCatalogOnboardingSaveState,
  type SlotCatalogOnboardingPrompt,
} from "../lib/printer_slot_model";
import type { BambuLiveObservedTray, PrinterAmsSlotRow } from "../lib/tauri_client";
import { AppModal } from "./app_modal";
import { modalFormInputClassName } from "./form_control_class";
import { ModalActionButton } from "./modal_action_button";
import {
  ModalDetailGrid,
  ModalDetailItem,
  ModalFactCard,
  ModalFormField,
  ModalHeader,
  ModalNotice,
} from "./modal_chrome";
import { modalPanelClassName } from "./modal_panel_class";
import { SegmentedChoiceRow } from "./segmented_choice_row";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { useResolvedTheme } from "../lib/theme_mode";

type SlotCatalogOnboardingModalProps = {
  busy: boolean;
  currentSlot?: PrinterAmsSlotRow | null;
  currentLiveTray?: BambuLiveObservedTray | null;
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

const INITIAL_WEIGHT_ERROR_ID = "slot-catalog-onboarding-initial-weight-error";

export function SlotCatalogOnboardingModal({
  busy,
  currentSlot,
  currentLiveTray,
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
  const resolvedTheme = useResolvedTheme();
  const saveState = buildSlotCatalogOnboardingSaveState(prompt, {
    busy,
    currentSlot,
    currentLiveTray,
  });
  const observedRfid = saveState.observedRfid;
  const isBorrowedIn = isBorrowedInOwnership(prompt.ownershipType);
  const primaryActionLabel = isBorrowedIn
    ? t("printers.addBorrowedCatalogRollAndSaveRfid", "Add borrowed-in + save RFID")
    : t("printers.addCatalogRollAndSaveRfid", "Add + save RFID");
  const slotAlreadyAssigned = Boolean((currentSlot ?? prompt.slot).spool_id);
  const saveDisabled = saveState.disabled;
  const initialWeightInvalid = parsePositiveWeight(prompt.initialWeight) === null;
  const initialWeightErrorMessage = initialWeightInvalid
    ? t("inventory.error.invalidWeight", "Weight value is invalid.")
    : null;
  let saveBlockMessage: string | null = null;
  if (saveState.reason === "missing_rfid") {
    saveBlockMessage = t(
      "printers.slotOnboardingNeedsRfid",
      "Wait for a non-empty RFID identity from the live AMS signal before adding and binding this roll.",
    );
  } else if (saveState.reason === "borrowed_owner_required") {
    saveBlockMessage = t(
      "printers.slotOnboardingNeedsBorrowedOwner",
      "Enter who the spool is borrowed from before registering it as borrowed-in.",
    );
  } else if (saveState.reason === "occupied_slot") {
    saveBlockMessage = t(
      "printers.slotOnboardingOccupiedBeforeSave",
      "This slot now has a roll assigned. Clear or swap it through the normal slot flow before adding a new roll from AMS.",
    );
  } else if (saveState.reason === "live_slot_unloaded") {
    saveBlockMessage = t(
      "printers.slotOnboardingLiveSlotUnloaded",
      "AMS no longer reports a loaded roll in this slot. Reopen the slot action when the roll is loaded.",
    );
  } else if (saveState.reason === "live_identity_changed") {
    saveBlockMessage = t(
      "printers.slotOnboardingLiveIdentityChanged",
      "The live AMS identity changed before saving. Reopen the slot action and confirm the current roll.",
    );
  }

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
          title={primaryActionLabel}
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
            <ModalNotice tone="warning">
              {t(
                "printers.slotOnboardingOccupied",
                "This slot already has a roll assigned. Clear or swap it through the normal slot flow before creating a new roll from the live AMS signal.",
              )}
            </ModalNotice>
          ) : null}

          <div
            className="surface-card space-y-4"
            style={inventorySwatchPanelStyle(prompt.master.hex_color, resolvedTheme)}
          >
            <SwatchSelectionPreviewHeader
              eyebrow={t("inventory.selectionPreview", "Selection preview")}
              size="large"
              swatchColor={prompt.master.hex_color}
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {formatFilamentDisplayTitle(
                  prompt.master.material,
                  prompt.master.filament_name,
                  prompt.master.color_name,
                )}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {prompt.master.vendor} ·{" "}
                {formatGrams(prompt.master.default_weight, "zero", locale)}
                {prompt.master.is_discontinued
                  ? ` · ${t("common.discontinued", "Discontinued")}`
                  : ""}
              </div>
            </SwatchSelectionPreviewHeader>

            <ModalDetailGrid className="gap-3">
              <ModalDetailItem
                label={t("inventory.rfidObservedTag", "Observed RFID")}
                valueClassName="break-all font-mono"
              >
                {observedRfid || "-"}
              </ModalDetailItem>
              <ModalDetailItem label={t("inventory.rfidLastSeen", "Last seen")}>
                {prompt.observedAt ? formatDateTime(prompt.observedAt, locale) : "-"}
              </ModalDetailItem>
            </ModalDetailGrid>
          </div>

          <ModalFactCard
            padding="none"
            surface="plain"
            className="app-modal-inset p-4"
          >
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
                <ModalFormField label={t("inventory.borrowedFrom", "Borrowed from")}>
                  <input
                    type="text"
                    value={prompt.borrowedFromName}
                    onChange={(event) => onBorrowedFromNameChange(event.target.value)}
                    className={modalFormInputClassName}
                    autoFocus
                  />
                </ModalFormField>
                <ModalFormField
                  label={t("inventory.ownerContactOptional", "Owner contact (optional)")}
                >
                  <input
                    type="text"
                    value={prompt.borrowedFromContact}
                    onChange={(event) => onBorrowedFromContactChange(event.target.value)}
                    className={modalFormInputClassName}
                  />
                </ModalFormField>
                <ModalFormField
                  className="sm:col-span-2"
                  label={t("inventory.borrowedInNoteOptional", "Borrowed-in note (optional)")}
                >
                  <input
                    type="text"
                    value={prompt.borrowedInNote}
                    onChange={(event) => onBorrowedInNoteChange(event.target.value)}
                    className={modalFormInputClassName}
                  />
                </ModalFormField>
              </div>
            ) : null}
          </ModalFactCard>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <ModalFormField label={t("inventory.initialWeight", "Initial weight (g)")}>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={prompt.initialWeight}
                  onChange={(event) => onInitialWeightChange(event.target.value)}
                  className={modalFormInputClassName}
                  autoFocus={!isBorrowedIn}
                  aria-invalid={initialWeightInvalid}
                  aria-describedby={
                    initialWeightInvalid ? INITIAL_WEIGHT_ERROR_ID : undefined
                  }
                />
              </ModalFormField>
              {initialWeightErrorMessage ? (
                <p
                  id={INITIAL_WEIGHT_ERROR_ID}
                  role="alert"
                  className="mt-1 text-xs leading-5 text-rose-600 dark:text-rose-300"
                >
                  {initialWeightErrorMessage}
                </p>
              ) : null}
            </div>
            <ModalFormField
              label={t("inventory.homeLocationOptional", "Home location (optional)")}
            >
              <input
                type="text"
                value={prompt.location}
                onChange={(event) => onLocationChange(event.target.value)}
                className={modalFormInputClassName}
              />
            </ModalFormField>
          </div>

          {saveBlockMessage ? (
            <ModalFactCard className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {saveBlockMessage}
            </ModalFactCard>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <ModalActionButton
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              {t("common.cancel", "Cancel")}
            </ModalActionButton>
            <ModalActionButton
              type="button"
              variant="primary"
              onClick={onSave}
              disabled={saveDisabled}
            >
              {primaryActionLabel}
            </ModalActionButton>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
