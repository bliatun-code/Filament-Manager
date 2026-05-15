import { AppModal } from "./app_modal";
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
  if (!open || !spool) {
    return null;
  }

  return (
    <AppModal
      onBackdropClose={onClose}
      panelClassName="w-full max-w-6xl rounded-3xl border border-slate-200/90 bg-white/95 p-0 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45"
    >
      <div className="mx-auto w-full max-w-none rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
        <InventoryRfidCaptureHeader
          displayTitle={displayTitle}
          matchMeta={matchMeta}
          onClose={onClose}
          selectedSlot={selectedSlot}
          slotLabel={slotLabel}
          spoolHexColor={spool.hexColor}
        />

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

        <InventoryRfidCaptureDiagnostics
          clientReadOnly={clientReadOnly}
          lastSlotDataAt={lastSlotDataAt}
          liveIntegration={liveIntegration}
          selectedSlot={selectedSlot}
          slotLabel={slotLabel}
          summary={summary}
        />

        {error ? (
          <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200">
            {error}
          </div>
        ) : null}

        <InventoryRfidCapturedFieldsPanel
          fields={fields}
          hasObservedSnapshotFields={hasObservedSnapshotFields}
          loading={loading}
          onToggle={onToggleCapturedFields}
          show={showCapturedFields}
          supportsRfidCapture={supportsRfidCapture}
        />

        <InventoryRfidCaptureActions
          canSave={canSave}
          manageBusy={manageBusy}
          onCancel={onCancel}
          onSave={onSave}
        />
      </div>
    </AppModal>
  );
}
