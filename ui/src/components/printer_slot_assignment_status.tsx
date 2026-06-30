import type { CSSProperties } from "react";
import { inlineStatusSignalClass, semanticChipClass } from "../lib/chip_styles";
import { formatSpoolReference } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { liveTrayIdentity, swatchCssBackground } from "../lib/printer_live_display";
import {
  buildLiveRfidCandidateRegistrationState,
  buildSlotCatalogOnboardingOpenState,
} from "../lib/printer_slot_model";
import type { PrinterSlotDisplayState } from "../lib/printer_slot_display";
import type {
  MasterCatalogRow,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
  SpoolWithMasterRow,
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
  registerLiveRfidCandidate: (
    printer: PrinterOverviewRow,
    slot: PrinterAmsSlotRow,
    liveTray: NonNullable<PrinterSlotDisplayState["effectiveLiveTray"]>,
    row: SpoolWithMasterRow,
  ) => void;
  createLiveBambuCatalogSpool: (
    printer: PrinterOverviewRow,
    slot: PrinterAmsSlotRow,
    liveTray: NonNullable<PrinterSlotDisplayState["effectiveLiveTray"]>,
    master: MasterCatalogRow,
  ) => void;
};

type PrinterSlotMiniActionButtonPlacement = "candidate" | "inline";

function printerSlotMiniActionButtonClassName(
  placement: PrinterSlotMiniActionButtonPlacement,
): string {
  const base =
    "shrink-0 rounded-md border border-slate-300/70 px-2 py-0.5 text-[10px] font-semibold text-slate-700 outline-none transition hover:border-sky-400/70 hover:text-sky-700 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:opacity-50 dark:border-slate-600/70 dark:hover:border-sky-300/60 dark:hover:text-sky-200 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

  if (placement === "candidate") {
    return `ml-auto ${base} bg-white/55 dark:bg-slate-900/45 dark:text-slate-200`;
  }

  return `${base} bg-transparent leading-none dark:text-slate-300`;
}

export function PrinterSlotAssignmentStatus({
  printer,
  slot,
  busy,
  displayState,
  currentRollStyle,
  openRfidOverrideDialog,
  registerLiveRfidCandidate,
  createLiveBambuCatalogSpool,
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
    liveSuggestedInventoryMatch,
    liveCatalogMatch,
    slotSwatchHex,
  } = displayState;
  const effectiveLiveIdentity = liveTrayIdentity(effectiveLiveTray);
  const liveObservationText = liveObservedAtLabel
    ? `${t("printers.lastKnownLive", "Last known live")}: ${liveObservedAtLabel}${
        liveObservedAge ? ` · ${liveObservedAge}` : ""
      }`
    : null;
  const liveCandidateRows =
    liveSignalEnabled &&
    effectiveLiveTray?.loaded &&
    (liveSuggestedInventoryMatch.kind === "metadata_single" ||
      liveSuggestedInventoryMatch.kind === "metadata_multiple") &&
    !liveIdentityLabel
      ? liveSuggestedInventoryMatch.candidates
      : [];
  const liveCatalogCandidateRows =
    unknownLiveRfid &&
    liveCandidateRows.length === 0 &&
    liveSignalEnabled &&
    effectiveLiveTray?.loaded &&
    (liveCatalogMatch.kind === "catalog_single" ||
      liveCatalogMatch.kind === "catalog_multiple")
      ? liveCatalogMatch.candidates
      : [];

  const renderCatalogCandidates = (rows: MasterCatalogRow[]) => {
    if (rows.length === 0) {
      return null;
    }
    const visibleRows = rows.slice(0, 3);
    const summary =
      rows.length === 1
        ? t(
            "printers.liveCatalogCandidateSingle",
            "Bambu catalog has one likely match. Add it here to save the live RFID.",
          )
        : t(
            "printers.liveCatalogCandidateCount",
            "{count} Bambu catalog entries look like this live roll.",
          ).replace("{count}", String(rows.length));
    const catalogOpenState = effectiveLiveTray
      ? buildSlotCatalogOnboardingOpenState(slot, effectiveLiveTray, { busy })
      : null;
    const catalogBlockLabel =
      catalogOpenState?.reason === "occupied_slot"
        ? t("printers.liveCatalogRequiresEmptySlot", "clear slot first")
        : catalogOpenState?.reason === "missing_rfid"
          ? t("printers.liveCatalogRequiresRfid", "wait for RFID")
          : catalogOpenState?.reason === "live_slot_unloaded"
            ? t("printers.liveCatalogRequiresLoadedSlot", "load roll first")
          : null;
    const canCreateFromCatalog = Boolean(
      catalogOpenState && !catalogBlockLabel && effectiveLiveIdentity,
    );

    return (
      <div className="mt-2 rounded-lg border border-slate-300/50 bg-white/35 px-2 py-1.5 text-[11px] leading-4 text-slate-600 dark:border-slate-700/80 dark:bg-slate-950/20 dark:text-slate-300">
        <div className="font-medium text-slate-700 dark:text-slate-200">{summary}</div>
        <div className="mt-1 space-y-1">
          {visibleRows.map((master) => (
            <div key={master.id} className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm border border-slate-400/40 dark:border-slate-600"
                style={{ background: swatchCssBackground(master.hex_color) }}
              />
              <span className="truncate">
                {master.filament_name} · {master.color_name}
              </span>
              {master.is_discontinued ? (
                <span className="shrink-0 text-slate-400 dark:text-slate-500">
                  {t("common.discontinued", "Discontinued")}
                </span>
              ) : null}
              {canCreateFromCatalog ? (
                <button
                  type="button"
                  className={printerSlotMiniActionButtonClassName("candidate")}
                  onClick={() =>
                    effectiveLiveTray &&
                    createLiveBambuCatalogSpool(printer, slot, effectiveLiveTray, master)
                  }
                  disabled={busy || catalogOpenState?.disabled}
                >
                  {t("printers.addCatalogRollAndSaveRfid", "Add + save RFID")}
                </button>
              ) : catalogBlockLabel ? (
                <span className="ml-auto shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                  {catalogBlockLabel}
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {rows.length > visibleRows.length ? (
          <div className="mt-1 text-slate-500 dark:text-slate-400">
            {t(
              "printers.liveCatalogCandidateMore",
              "More Bambu catalog candidates are available.",
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderLiveCandidates = (rows: SpoolWithMasterRow[]) => {
    if (rows.length === 0) {
      return null;
    }
    const visibleRows = rows.slice(0, 4);
    const currentAssignmentMatched = Boolean(
      slot.spool_id && rows.some((row) => row.spool.id === slot.spool_id),
    );
    const occupiedByDifferentRoll = Boolean(slot.spool_id && !currentAssignmentMatched);
    const summary = unknownLiveRfid
      ? currentAssignmentMatched
        ? t(
            "printers.liveRfidCandidateCurrentMatches",
            "Current assignment looks like this live Bambu roll. Save RFID to bind it permanently.",
          )
        : t(
            "printers.liveRfidCandidateCount",
            "{count} inventory rolls look like this live Bambu roll.",
          ).replace("{count}", String(rows.length))
      : currentAssignmentMatched
        ? t(
            "printers.liveCandidateCurrentMatches",
            "Current assignment matches the live material/color signal.",
          )
        : rows.length === 1
          ? t(
              "printers.liveCandidateSingle",
              "One inventory roll matches the live material/color signal.",
            )
          : t(
              "printers.liveCandidateCount",
              "{count} inventory rolls match the live material/color signal.",
            ).replace("{count}", String(rows.length));
    const unknownRfidSummary = unknownLiveRfid
      ? occupiedByDifferentRoll
        ? rows.length === 1
          ? t(
              "printers.liveRfidCandidateSelectFirst",
              "One inventory roll looks like this live Bambu roll. Select it before saving RFID.",
            )
          : `${summary} ${t(
              "printers.liveRfidCandidateSelectCorrect",
              "Select the correct roll before saving RFID.",
            )}`
        : !currentAssignmentMatched && rows.length === 1
          ? t(
              "printers.liveRfidCandidateSingle",
              "One inventory roll looks like this live Bambu roll. Save RFID to bind it permanently.",
            )
          : summary
      : summary;

    return (
      <div className="mt-2 rounded-lg border border-slate-300/50 bg-white/35 px-2 py-1.5 text-[11px] leading-4 text-slate-600 dark:border-slate-700/80 dark:bg-slate-950/20 dark:text-slate-300">
        <div className="font-medium text-slate-700 dark:text-slate-200">
          {unknownRfidSummary}
        </div>
        <div className="mt-1 space-y-1">
          {visibleRows.map((row) => {
            const registrationState = effectiveLiveTray
              ? buildLiveRfidCandidateRegistrationState(slot, effectiveLiveTray, row, {
                  busy,
                })
              : null;
            const registrationBlockLabel =
              registrationState?.reason === "candidate_has_rfid"
                ? t("printers.liveCandidateHasRfid", "RFID saved")
                : registrationState?.reason === "select_candidate_first"
                  ? t("printers.liveCandidateSelectBeforeRfid", "select first")
                  : registrationState?.reason === "candidate_unavailable"
                    ? t("printers.liveCandidateUnavailable", "not available")
                    : registrationState?.reason === "live_slot_unloaded"
                      ? t("printers.liveCatalogRequiresLoadedSlot", "load roll first")
                      : registrationState?.reason === "missing_rfid"
                        ? t("printers.liveCatalogRequiresRfid", "wait for RFID")
                        : null;
            const canRegisterCandidate =
              unknownLiveRfid &&
              !!registrationState &&
              !registrationBlockLabel &&
              !!effectiveLiveIdentity;
            return (
              <div key={row.spool.id} className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm border border-slate-400/40 dark:border-slate-600"
                  style={{ background: swatchCssBackground(row.master.hex_color) }}
                />
                <span className="truncate">
                  {row.master.filament_name} · {row.master.color_name}
                </span>
                <span className="shrink-0 text-slate-400 dark:text-slate-500">
                  {formatSpoolReference(row.spool.id)}
                  {row.spool.id === slot.spool_id
                    ? ` · ${t("printers.liveCandidateCurrent", "current")}`
                    : ""}
                </span>
                {row.spool.ownership_type === "BORROWED_IN" ? (
                  <span className="shrink-0 rounded-md border border-sky-200/80 bg-sky-50/80 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200">
                    {t("inventory.borrowedIn", "Borrowed in")}
                  </span>
                ) : null}
                {unknownLiveRfid ? (
                  canRegisterCandidate ? (
                    <button
                      type="button"
                      className={printerSlotMiniActionButtonClassName("candidate")}
                      onClick={() => {
                        if (!effectiveLiveTray) {
                          return;
                        }
                        registerLiveRfidCandidate(printer, slot, effectiveLiveTray, row);
                      }}
                      disabled={busy || registrationState?.disabled}
                    >
                      {t("printers.registerLiveRfid", "Save RFID")}
                    </button>
                  ) : registrationBlockLabel ? (
                    <span className="ml-auto shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                      {registrationBlockLabel}
                    </span>
                  ) : null
                ) : null}
              </div>
            );
          })}
        </div>
        {rows.length > visibleRows.length ? (
          <div className="mt-1 text-slate-500 dark:text-slate-400">
            {t("printers.liveCandidateMore", "More candidates exist in inventory.")}
          </div>
        ) : null}
      </div>
    );
  };

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
              "AMS reported an RFID/AMS identity that is not registered in inventory.",
            )} ${effectiveLiveIdentity}`}
          </div>
        ) : null}
        {renderLiveCandidates(liveCandidateRows)}
        {renderCatalogCandidates(liveCatalogCandidateRows)}
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
              <span className={inlineStatusSignalClass("neutral")}>{liveIdentityLabel}</span>
            ) : null}
            {showManualLabel ? (
              <span className={inlineStatusSignalClass("neutral")}>
                {t("printers.manualAssignment", "Manual")}
              </span>
            ) : null}
            {rfidOverridden ? (
              <button
                type="button"
                className={printerSlotMiniActionButtonClassName("inline")}
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
                  )} ${effectiveLiveIdentity}`
                : `${t(
                    "printers.unknownLiveRfidHint",
                    "AMS reported an RFID/AMS identity that is not registered in inventory.",
                  )} ${effectiveLiveIdentity}`}
            </div>
          ) : null}
          {renderLiveCandidates(liveCandidateRows)}
          {renderCatalogCandidates(liveCatalogCandidateRows)}
        </div>
      </div>
    </div>
  );
}
