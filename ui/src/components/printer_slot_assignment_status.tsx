import type { CSSProperties } from "react";
import { semanticChipClass } from "../lib/chip_styles";
import { formatSpoolReference } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { swatchCssBackground } from "../lib/printer_live_display";
import type { PrinterSlotDisplayState } from "../lib/printer_slot_display";
import type {
  PrinterAmsSlotRow,
  PrinterOverviewRow,
} from "../lib/tauri_client";

type PrinterSlotAssignmentStatusProps = {
  printer: PrinterOverviewRow;
  slot: PrinterAmsSlotRow;
  busy: boolean;
  displayState: PrinterSlotDisplayState;
  currentRollStyle?: CSSProperties;
  openRfidOverrideDialog: (
    printer: PrinterOverviewRow,
    slot: PrinterAmsSlotRow,
    liveTray: NonNullable<PrinterSlotDisplayState["effectiveLiveTray"]>,
  ) => void;
};

export function PrinterSlotAssignmentStatus({
  printer,
  slot,
  busy,
  displayState,
  currentRollStyle,
  openRfidOverrideDialog,
}: PrinterSlotAssignmentStatusProps) {
  const { t } = useI18n();
  const {
    effectiveLiveTray,
    liveSignalEnabled,
    liveSlotInUse,
    liveIdentityLabel,
    unknownLiveRfid,
    rfidOverridden,
    showManualLabel,
    liveObservedAge,
    liveObservedAtLabel,
    slotSwatchHex,
  } = displayState;
  const liveObservationText = liveObservedAtLabel
    ? `${t("printers.lastKnownLive", "Last known live")}: ${liveObservedAtLabel}${
        liveObservedAge ? ` · ${liveObservedAge}` : ""
      }`
    : null;

  if (!slot.spool_id) {
    return (
      <div className="mt-2 rounded-xl bg-slate-950/[0.03] px-2.5 py-2 text-xs text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
        <div>{t("printers.noSpoolAssigned", "No spool assigned.")}</div>
        {liveSignalEnabled && liveObservationText ? (
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {liveObservationText}
          </div>
        ) : null}
        {unknownLiveRfid ? (
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
            {`${t(
              "printers.unknownLiveRfidHint",
              "AMS reported a tray identity that is not registered in inventory.",
            )} ${effectiveLiveTray?.tray_uuid}`}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="mt-2 rounded-xl px-2.5 py-2 text-xs text-slate-700 dark:text-slate-300"
      style={currentRollStyle}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 h-4.5 w-4.5 shrink-0 rounded border border-slate-500/20 shadow-inner shadow-black/10 dark:border-white/10 dark:shadow-black/20"
          style={{ background: swatchCssBackground(slotSwatchHex) }}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {t("printers.currentRoll", "Current roll")}
            </span>
            <span className="text-slate-400 dark:text-slate-500">·</span>
            <span className="text-slate-500 dark:text-slate-400">
              {t("inventory.reference", "Reference")} {formatSpoolReference(slot.spool_id)}
            </span>
            {liveSlotInUse ? (
              <span className={semanticChipClass("success", "px-2 py-0.5 text-[10px]")}>
                {t("inventory.statusInUse", "In use")}
              </span>
            ) : null}
            {liveIdentityLabel ? (
              <span className={semanticChipClass("info", "px-2 py-0.5 text-[10px]")}>
                {liveIdentityLabel}
              </span>
            ) : null}
            {showManualLabel ? (
              <span className="rounded-md border border-slate-300/60 bg-slate-100/60 px-1.5 py-0.5 text-[10px] font-medium leading-none text-slate-600 dark:border-slate-600/70 dark:bg-slate-800/55 dark:text-slate-300">
                {t("printers.manualAssignment", "Manual")}
              </span>
            ) : null}
            {rfidOverridden ? (
              <button
                type="button"
                className={semanticChipClass("info", "px-2 py-0.5 text-[10px]")}
                onClick={() =>
                  effectiveLiveTray && openRfidOverrideDialog(printer, slot, effectiveLiveTray)
                }
                disabled={!effectiveLiveTray || busy}
              >
                {t("printers.rfidOverridden", "RFID overridden")}
              </button>
            ) : unknownLiveRfid ? (
              <span className={semanticChipClass("warning", "px-2 py-0.5 text-[10px]")}>
                {t("printers.unknownLiveRfid", "RFID is not registered")}
              </span>
            ) : null}
          </div>
          {liveSignalEnabled ? (
            <div className="mt-0.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              {liveObservationText ??
                t(
                  "printers.waitingForLiveIdentity",
                  "Showing the last saved slot assignment until stronger live identity arrives.",
                )}
            </div>
          ) : null}
          {unknownLiveRfid ? (
            <div className="mt-0.5 text-[11px] leading-5 text-amber-700 dark:text-amber-200">
              {rfidOverridden
                ? `${t(
                    "printers.rfidOverriddenHint",
                    "This slot is manually assigned while the same unregistered RFID identity is still active.",
                  )} ${effectiveLiveTray?.tray_uuid}`
                : `${t(
                    "printers.unknownLiveRfidHint",
                    "AMS reported a tray identity that is not registered in inventory.",
                  )} ${effectiveLiveTray?.tray_uuid}`}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
