import { AppModal } from "./app_modal";
import {
  inventoryModalOverlayClassName,
  inventoryWideContentModalPanelClassName,
} from "./inventory_modal_chrome";
import { ModalBody, ModalFooter, ModalNotice } from "./modal_chrome";
import {
  InventoryRfidCapturedFieldsPanel,
  InventoryRfidCaptureActions,
  InventoryRfidCaptureDiagnostics,
  InventoryRfidCaptureHeader,
  InventoryRfidCaptureSlotPicker,
  InventoryRfidCaptureSummaryCards,
} from "./inventory_rfid_capture_panels";
import type { InventorySpool } from "../lib/inventory_list_model";
import type {
  RfidCaptureField,
  RfidCaptureSummary,
} from "../lib/inventory_rfid_capture";
import type { InventoryPrinterSlotOption } from "../lib/use_inventory_printer_slots";
import type { BambuLiveIntegrationSettings } from "../lib/tauri_client";
import { useI18n } from "../lib/i18n";

type RfidCaptureMatchMeta = {
  className: string;
  hint: string;
  label: string;
} | null;

type InventoryRfidCaptureModalProps = {
  canSave: boolean;
  clientReadOnly: boolean;
  displayTitle: string;
  error: string | null;
  fields: RfidCaptureField[];
  hasObservedSnapshotFields: boolean;
  lastSlotDataAt: string | null;
  liveIntegration: BambuLiveIntegrationSettings | null;
  loading: boolean;
  manageBusy: boolean;
  matchMeta: RfidCaptureMatchMeta;
  onCancel: () => void;
  onClose: () => void;
  onSave: () => void;
  onSelectSlot: (slotId: string) => void;
  onToggleCapturedFields: () => void;
  open: boolean;
  selectedSlot: InventoryPrinterSlotOption | null;
  showCapturedFields: boolean;
  slotLabel: string | null;
  slotSummaries: Record<string, RfidCaptureSummary>;
  slots: InventoryPrinterSlotOption[];
  spool: InventorySpool | null;
  summary: RfidCaptureSummary;
  supportsRfidCapture: boolean;
};

export function InventoryRfidCaptureModal({
  canSave,
  clientReadOnly,
  displayTitle,
  error,
  fields,
  hasObservedSnapshotFields,
  lastSlotDataAt,
  liveIntegration,
  loading,
  manageBusy,
  matchMeta,
  onCancel,
  onClose,
  onSave,
  onSelectSlot,
  onToggleCapturedFields,
  open,
  selectedSlot,
  showCapturedFields,
  slotLabel,
  slotSummaries,
  slots,
  spool,
  summary,
  supportsRfidCapture,
}: InventoryRfidCaptureModalProps) {
  const { t } = useI18n();

  if (!open || !spool) {
    return null;
  }

  return (
    <AppModal
      ariaLabel={`${t("inventory.rfidCaptureTitle", "RFID capture")}: ${displayTitle}`}
      closeOnBackdrop
      onBackdropClose={onClose}
      overlayClassName={inventoryModalOverlayClassName}
      panelClassName={inventoryWideContentModalPanelClassName}
      zIndex={60}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800/70 sm:px-6">
          <InventoryRfidCaptureHeader
            displayTitle={displayTitle}
            matchMeta={matchMeta}
            onClose={onClose}
            selectedSlot={selectedSlot}
            slotLabel={slotLabel}
            spoolHexColor={spool.hexColor}
          />
        </div>

        <ModalBody className="px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 min-[900px]:grid-cols-4">
            <InventoryRfidCaptureSlotPicker
              onSelectSlot={onSelectSlot}
              selectedSlotId={selectedSlot?.slotId ?? null}
              slotSummaries={slotSummaries}
              slots={slots}
              spool={spool}
            />
            <InventoryRfidCaptureSummaryCards
              matchMeta={matchMeta}
              savedRfidTag={spool.rfidTag}
              summary={summary}
            />
          </div>

          {error ? (
            <ModalNotice className="mt-4 text-xs" tone="danger">
              {error}
            </ModalNotice>
          ) : null}

          <details className="mt-4 rounded-xl border border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-950/25">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300 dark:text-slate-100 dark:hover:bg-slate-900/60 dark:focus-visible:ring-sky-400/60">
              <span className="block">
                {t("inventory.rfidTechnicalDetails", "Technical details")}
              </span>
              <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                {t(
                  "inventory.rfidTechnicalDetailsHint",
                  "Raw RFID identity signals, capture status and captured slot fields.",
                )}
              </span>
            </summary>
            <div className="border-t border-slate-200 px-4 pb-4 dark:border-slate-700">
              <InventoryRfidCaptureDiagnostics
                clientReadOnly={clientReadOnly}
                lastSlotDataAt={lastSlotDataAt}
                liveIntegration={liveIntegration}
                selectedSlot={selectedSlot}
                slotLabel={slotLabel}
                summary={summary}
              />

              <InventoryRfidCapturedFieldsPanel
                fields={fields}
                hasObservedSnapshotFields={hasObservedSnapshotFields}
                loading={loading}
                onToggle={onToggleCapturedFields}
                show={showCapturedFields}
                supportsRfidCapture={supportsRfidCapture}
              />
            </div>
          </details>
        </ModalBody>

        <ModalFooter className="px-5 py-4 sm:px-6">
          <InventoryRfidCaptureActions
            canSave={canSave}
            manageBusy={manageBusy}
            onCancel={onCancel}
            onSave={onSave}
          />
        </ModalFooter>
      </div>
    </AppModal>
  );
}
