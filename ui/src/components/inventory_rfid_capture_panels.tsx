import { swatchCssBackground } from "../lib/color_utils";
import { CloseButton } from "./close_button";
import {
  inventoryDetailSectionLabelClassName,
  inventoryPanelToggleButtonClassName,
} from "./inventory_detail_panel_class";
import { ModalActionButton } from "./modal_action_button";
import { ModalFactCard } from "./modal_chrome";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { useI18n } from "../lib/i18n";
import type { InventorySpool } from "../lib/inventory_list_model";
import {
  assessRfidCaptureMatch,
  buildRfidCaptureSlotLiveStatus,
  formatCaptureTimestamp,
  formatRfidCapturedFieldsStatus,
  formatRfidCapturePresetName,
  rfidCaptureMatchMeta,
  type RfidCaptureField,
  type RfidCaptureSummary,
} from "../lib/inventory_rfid_capture";
import { formatPrinterSlotLabelForModel } from "../lib/printer_profiles";
import type { BambuLiveIntegrationSettings } from "../lib/tauri_client";
import { useResolvedTheme } from "../lib/theme_mode";

type RfidCaptureMatchMeta = {
  className: string;
  hint: string;
  label: string;
} | null;

type RfidCaptureSlotOption = {
  amsId: string;
  liveIsActive?: boolean | null;
  liveLastIdentitySeenAt?: string | null;
  liveLoaded?: boolean | null;
  liveMqttConnected?: boolean | null;
  livePrinterLastSeenAt?: string | null;
  printerModel: string;
  printerName: string;
  slotId: string;
  slotIndex: number;
};

type InventoryRfidCaptureHeaderProps = {
  displayTitle: string;
  matchMeta: RfidCaptureMatchMeta;
  onClose: () => void;
  selectedSlot: RfidCaptureSlotOption | null;
  slotLabel: string | null;
  spoolHexColor?: string | null;
};

type InventoryRfidCaptureSlotPickerProps = {
  onSelectSlot: (slotId: string) => void;
  selectedSlotId: string | null;
  slotSummaries: Record<string, RfidCaptureSummary>;
  slots: RfidCaptureSlotOption[];
  spool: InventorySpool;
};

type InventoryRfidCaptureSummaryCardsProps = {
  matchMeta: RfidCaptureMatchMeta;
  savedRfidTag?: string | null;
  summary: RfidCaptureSummary;
};

type InventoryRfidCaptureDiagnosticsProps = {
  clientReadOnly: boolean;
  lastSlotDataAt: string | null;
  liveIntegration: BambuLiveIntegrationSettings | null;
  selectedSlot: RfidCaptureSlotOption | null;
  slotLabel: string | null;
  summary: RfidCaptureSummary;
};

type InventoryRfidCapturedFieldsPanelProps = {
  fields: RfidCaptureField[];
  hasObservedSnapshotFields: boolean;
  loading: boolean;
  onToggle: () => void;
  show: boolean;
  supportsRfidCapture: boolean;
};

type InventoryRfidCaptureActionsProps = {
  canSave: boolean;
  manageBusy: boolean;
  onCancel: () => void;
  onSave: () => void;
  spoolHexColor?: string | null;
};

function inventoryRfidCaptureSlotButtonClassName(active: boolean): string {
  const base =
    "rounded-lg border px-3 py-2 text-left text-sm font-semibold outline-none transition focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

  if (active) {
    return `${base} border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/50 dark:bg-sky-500/15 dark:text-sky-200`;
  }

  return `${base} border-slate-200 text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-950/70`;
}

export function InventoryRfidCaptureHeader({
  displayTitle,
  matchMeta,
  onClose,
  selectedSlot,
  slotLabel,
  spoolHexColor,
}: InventoryRfidCaptureHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <SwatchSelectionPreviewHeader
        className="min-w-0 flex-1"
        eyebrow={t("inventory.rfidCaptureTitle", "RFID capture")}
        swatchColor={spoolHexColor}
      >
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {displayTitle}
          </div>
          {matchMeta ? <span className={matchMeta.className}>{matchMeta.label}</span> : null}
        </div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {selectedSlot
            ? `${selectedSlot.printerName} · ${slotLabel ?? `Slot ${selectedSlot.slotIndex}`}`
            : t("inventory.rfidNoCaptureSource", "No live AMS slot available")}
        </div>
        {matchMeta ? (
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {matchMeta.hint}
          </div>
        ) : null}
      </SwatchSelectionPreviewHeader>
      <CloseButton label={t("common.close", "Close")} onClick={onClose} />
    </div>
  );
}

export function InventoryRfidCaptureSlotPicker({
  onSelectSlot,
  selectedSlotId,
  slotSummaries,
  slots,
  spool,
}: InventoryRfidCaptureSlotPickerProps) {
  const { locale, t } = useI18n();

  return (
    <ModalFactCard compact className="sm:col-span-2 min-[900px]:col-span-4">
      <div className={inventoryDetailSectionLabelClassName}>
        {t("inventory.rfidSourceSlot", "RFID source slot")}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {slots.map((slot) => {
          const active = selectedSlotId === slot.slotId;
          const label = formatPrinterSlotLabelForModel(t, slot.printerModel, {
            ams_id: slot.amsId,
            slot_index: slot.slotIndex,
          });
          const slotSummary = slotSummaries[slot.slotId] ?? {};
          const slotMatchMeta = rfidCaptureMatchMeta(
            assessRfidCaptureMatch(spool, slotSummary),
            t,
          );
          const slotLiveStatus = buildRfidCaptureSlotLiveStatus(slot, locale, t);
          const hasSlotMeta = Boolean(slotMatchMeta || slotLiveStatus.stateLabel);
          return (
            <button
              key={slot.slotId}
              type="button"
              className={inventoryRfidCaptureSlotButtonClassName(active)}
              onClick={() => onSelectSlot(slot.slotId)}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-4 w-4 shrink-0 rounded border border-slate-200 dark:border-slate-700"
                  style={{ background: swatchCssBackground(slotSummary.colorHex ?? spool.hexColor) }}
                />
                <span>{label ?? `Slot ${slot.slotIndex}`}</span>
              </div>
              {hasSlotMeta ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {slotMatchMeta ? (
                    <span className={slotMatchMeta.className}>{slotMatchMeta.label}</span>
                  ) : null}
                  {slotLiveStatus.stateLabel && slotLiveStatus.stateClassName ? (
                    <span className={slotLiveStatus.stateClassName}>
                      {slotLiveStatus.stateLabel}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {slotLiveStatus.observedText ? (
                <div className="mt-1 text-[11px] font-normal leading-snug text-slate-500 dark:text-slate-400">
                  {slotLiveStatus.observedText}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </ModalFactCard>
  );
}

export function InventoryRfidCaptureSummaryCards({
  matchMeta,
  savedRfidTag,
  summary,
}: InventoryRfidCaptureSummaryCardsProps) {
  const { t } = useI18n();

  return (
    <>
      <ModalFactCard compact>
        <div className={inventoryDetailSectionLabelClassName}>
          {t("inventory.rfidCurrentTag", "Saved RFID")}
        </div>
        <div className="mt-2 break-all font-mono text-sm text-slate-900 dark:text-slate-100">
          {savedRfidTag?.trim() || "—"}
        </div>
      </ModalFactCard>
      <ModalFactCard compact>
        <div className={inventoryDetailSectionLabelClassName}>
          {t("inventory.rfidObservedTag", "Observed RFID")}
        </div>
        <div className="mt-2 break-all font-mono text-sm text-slate-900 dark:text-slate-100">
          {summary.rfidTag || "—"}
        </div>
      </ModalFactCard>
      <ModalFactCard compact>
        <div className={inventoryDetailSectionLabelClassName}>
          {t("inventory.rfidObservedMaterial", "Observed filament")}
        </div>
        <div className="mt-2 text-sm text-slate-900 dark:text-slate-100">
          {[summary.material, summary.filamentName].filter(Boolean).join(" · ") || "—"}
        </div>
        {matchMeta ? (
          <div className="mt-2">
            <span className={matchMeta.className}>{matchMeta.label}</span>
          </div>
        ) : null}
      </ModalFactCard>
      <ModalFactCard compact>
        <div className={inventoryDetailSectionLabelClassName}>
          {t("inventory.rfidObservedColor", "Observed color")}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
          <span
            className="h-5 w-5 rounded border border-slate-200 dark:border-slate-700"
            style={{ background: swatchCssBackground(summary.colorHex ?? "#0F172A") }}
          />
          <span className="font-mono">
            {summary.colorHex || summary.trayColorRaw || "—"}
          </span>
        </div>
      </ModalFactCard>
    </>
  );
}

export function InventoryRfidCaptureDiagnostics({
  clientReadOnly,
  lastSlotDataAt,
  liveIntegration,
  selectedSlot,
  slotLabel,
  summary,
}: InventoryRfidCaptureDiagnosticsProps) {
  const { locale, t } = useI18n();
  const printerLastSeenAt =
    liveIntegration?.observed_state?.last_seen_at ?? selectedSlot?.livePrinterLastSeenAt ?? null;
  const presetNameDisplay = formatRfidCapturePresetName(summary.trayIdName, t);
  const printerConnected = liveIntegration?.observed_state?.mqtt_connected
    ? true
    : clientReadOnly
      ? Boolean(selectedSlot?.liveMqttConnected)
      : false;

  return (
    <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
      <ModalFactCard className="text-sm">
        <div className={inventoryDetailSectionLabelClassName}>
          {t("inventory.rfidIdentitySignals", "RFID identity signals")}
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          <RfidDetailRow label="tag_uid" value={summary.rfidTag} code />
          <RfidDetailRow label="tray_uuid" value={summary.trayUuid} code />
          <RfidDetailRow label="chip_id" value={summary.chipId} code />
        </dl>
      </ModalFactCard>
      <ModalFactCard className="text-sm">
        <div className={inventoryDetailSectionLabelClassName}>
          {t("inventory.rfidCaptureStatus", "Capture status")}
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          <RfidDetailRow
            label={t("inventory.rfidPrinterLive", "Printer live")}
            value={
              printerConnected
                ? t("inventory.connected", "Connected")
                : t("inventory.disconnected", "Not connected")
            }
          />
          <RfidDetailRow
            label={t("inventory.rfidLastSeen", "Last seen")}
            value={printerLastSeenAt ? formatCaptureTimestamp(printerLastSeenAt, locale) : null}
          />
          <RfidDetailRow
            label={t("inventory.rfidLastSlotData", "Last slot data")}
            value={lastSlotDataAt ? formatCaptureTimestamp(lastSlotDataAt, locale) : null}
          />
          <RfidDetailRow
            label={t("inventory.rfidPresetSignal", "Filament settings preset")}
            value={summary.trayInfoIdx}
            code
          />
          <RfidDetailRow
            label={t("inventory.rfidPresetName", "Preset/material name")}
            value={presetNameDisplay}
            code
          />
          <RfidDetailRow
            label={t("inventory.rfidActiveSource", "Active source")}
            value={slotLabel}
          />
          <RfidDetailRow
            label={t("inventory.rfidAmsExistBits", "AMS slot present bits")}
            value={summary.trayExistBits}
            mono
          />
          <RfidDetailRow
            label={t("inventory.rfidAmsSlotPresence", "Selected slot presence")}
            value={
              summary.trayPresentInAms == null
                ? null
                : summary.trayPresentInAms
                  ? t("inventory.rfidAmsSlotPresent", "Physically present")
                  : t("inventory.rfidAmsSlotMissing", "Not physically present")
            }
          />
          <RfidDetailRow
            label={t("inventory.rfidAmsReadDone", "AMS read done bits")}
            value={summary.trayReadDoneBits}
            mono
          />
          <RfidDetailRow
            label={t("inventory.rfidAmsBambuBits", "AMS Bambu bits")}
            value={summary.trayIsBblBits}
            mono
          />
          <RfidDetailRow
            label={t("inventory.rfidAmsStatus", "AMS RFID status")}
            value={summary.amsRfidStatus}
            mono
          />
        </dl>
      </ModalFactCard>
    </div>
  );
}

export function InventoryRfidCapturedFieldsPanel({
  fields,
  hasObservedSnapshotFields,
  loading,
  onToggle,
  show,
  supportsRfidCapture,
}: InventoryRfidCapturedFieldsPanelProps) {
  const { locale, t } = useI18n();
  const capturedFieldsStatus = formatRfidCapturedFieldsStatus({
    fieldCount: fields.length,
    loading,
    t,
  });

  return (
    <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-xs dark:border-slate-700">
        <div className="font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {t("inventory.rfidCapturedFields", "Captured slot fields")}
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-[5.5rem] text-right tabular-nums text-slate-500 dark:text-slate-400">
            {capturedFieldsStatus}
          </div>
          <button
            type="button"
            className={inventoryPanelToggleButtonClassName}
            onClick={onToggle}
          >
            {show ? t("common.hide", "Hide") : t("common.show", "Show")}
          </button>
        </div>
      </div>
      {show ? (
        <div className="max-h-80 overflow-auto">
          {fields.length > 0 ? (
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60">
                <tr>
                  <th className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">
                    {t("inventory.field", "Field")}
                  </th>
                  <th className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">
                    {t("inventory.value", "Value")}
                  </th>
                  <th className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">
                    {t("inventory.lastUpdated", "Last updated")}
                  </th>
                  <th className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300">
                    {t("inventory.changes", "Changes")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                {fields.map((field) => (
                  <tr key={field.path}>
                    <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-200">
                      {field.label}
                    </td>
                    <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-300">
                      {field.valueText}
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                      {formatCaptureTimestamp(field.lastSeenAt, locale)}
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                      {field.changeCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">
              {supportsRfidCapture
                ? hasObservedSnapshotFields
                  ? t(
                      "inventory.rfidCaptureUsingLastKnown",
                      "Showing the last known AMS slot data until newer tray data arrives.",
                    )
                  : t(
                      "inventory.rfidCaptureWaiting",
                      "Waiting for fresh AMS slot data. Previously captured values stay visible until newer data arrives.",
                    )
                : t(
                    "inventory.rfidCaptureUnavailable",
                    "RFID capture needs live Bambu data from this device or the connected host on a printer with at least one AMS slot.",
                  )}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
          {t(
            "inventory.rfidCapturedFieldsCollapsed",
            "Captured slot fields are collapsed by default. Expand when you want to inspect the raw field list.",
          )}
        </div>
      )}
    </div>
  );
}

export function InventoryRfidCaptureActions({
  canSave,
  manageBusy,
  onCancel,
  onSave,
  spoolHexColor,
}: InventoryRfidCaptureActionsProps) {
  const { t } = useI18n();
  const resolvedTheme = useResolvedTheme();

  return (
    <div className="flex flex-wrap justify-end gap-3">
      <ModalActionButton
        type="button"
        onClick={onCancel}
      >
        {t("common.cancel", "Cancel")}
      </ModalActionButton>
      <ModalActionButton
        type="button"
        variant="primary"
        swatchColor={spoolHexColor}
        resolvedTheme={resolvedTheme}
        onClick={onSave}
        disabled={!canSave || manageBusy}
      >
        {t("inventory.saveRfid", "Save RFID")}
      </ModalActionButton>
    </div>
  );
}

function RfidDetailRow({
  code = false,
  label,
  mono = false,
  value,
}: {
  code?: boolean;
  label: string;
  mono?: boolean;
  value?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-500 dark:text-slate-400">
        {code ? <code>{label}</code> : label}
      </dt>
      <dd
        className={`break-all text-slate-900 dark:text-slate-100 ${mono || code ? "font-mono" : ""}`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
