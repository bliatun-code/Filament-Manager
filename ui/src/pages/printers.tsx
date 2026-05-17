import { useCallback, useMemo, useState } from "react";
import {
  isTauri,
  type BambuLiveIntegrationEntry,
  type BambuLiveObservedTray,
  type PrinterOverviewRow,
  type PrinterAmsSlotRow,
  type SpoolWithMasterRow,
} from "../lib/tauri_client";
import { updateInventorySpoolRfidTag } from "../lib/spool_writes";
import {
  buildEmptySlotWeightPrompt,
  buildIncomingWeightPrompt,
  buildRfidOverridePrompt,
  buildSlotSwapDraft,
  parseWeightInput,
  prepareMeasuredWeightUpdate,
  preparePrinterSlotAssignment,
  resolveSpoolTareWeightForRow,
  type IncomingWeightPrompt,
  type SlotRfidOverridePrompt,
  type SlotSwapDraft,
} from "../lib/printer_slot_model";
import {
  writePreparedMeasuredWeightUpdate,
  writePreparedPrinterSlotAssignment,
  writeSpoolMeasuredWeight,
} from "../lib/printer_slot_writes";
import {
  buildAllowedSpoolOptionMapsBySlotSpoolId,
  buildAllowedSpoolOptionsBySlotSpoolId,
  buildSpoolsById,
  resolveSpoolTareWeightById as resolveSpoolTareWeightFromMap,
} from "../lib/printer_page_model";
import { FeedbackBanner } from "../components/feedback_banner";
import { AddPrinterModal } from "../components/add_printer_modal";
import { IncomingWeightModal } from "../components/incoming_weight_modal";
import { PrinterOverviewCard } from "../components/printer_overview_card";
import { RfidOverrideModal } from "../components/rfid_override_modal";
import { useI18n } from "../lib/i18n";
import {
  commandErrorText,
  findLiveTrayForSlot as resolveLiveTrayForSlot,
  formatDateTime,
} from "../lib/printer_live_display";
import { sortSpoolsAlphabetically } from "../lib/spool_sort";
import { useResolvedTheme } from "../lib/theme_mode";
import { useClientWriteGuards } from "../lib/use_client_write_guards";
import {
  listSupportedPrinterModels,
} from "../lib/printer_profiles";
import { usePrinterPageData } from "./use_printer_page_data";
import { useLibrarySyncState } from "./use_library_sync_state";
import { useAddPrinterWorkflow } from "./use_add_printer_workflow";
import { useSlotDropdownDismissal } from "./use_slot_dropdown_dismissal";

export default function PrintersPage() {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const {
    clientReadOnly,
    clientHostWritePaired,
    clientHostDeviceName,
    clientHostBaseUrl,
    clientLibraryId,
    librarySyncReady,
  } = useLibrarySyncState(tauri);
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotSwapDraft>>({});
  const [openDropdownSlotId, setOpenDropdownSlotId] = useState<string | null>(null);
  const [incomingWeightPrompt, setIncomingWeightPrompt] = useState<IncomingWeightPrompt | null>(
    null,
  );
  const [incomingWeightValue, setIncomingWeightValue] = useState("");
  const [outgoingWeightValue, setOutgoingWeightValue] = useState("");
  const [rfidOverridePrompt, setRfidOverridePrompt] = useState<SlotRfidOverridePrompt | null>(
    null,
  );
  const supportedPrinterModels = useMemo(() => listSupportedPrinterModels(), []);

  const resetPrinterInteractionState = useCallback(() => {
    setSlotDrafts({});
    setOpenDropdownSlotId(null);
    setIncomingWeightPrompt(null);
    setIncomingWeightValue("");
    setOutgoingWeightValue("");
  }, []);

  const handlePrinterLoadError = useCallback(
    (loadError: unknown) => {
      console.error(loadError);
      setError(t("printers.error.load", "Failed to load printer overview."));
    },
    [t],
  );

  const {
    loading,
    printers,
    spools,
    bambuLiveIntegrations,
    clientPrinterSource,
    clientPrinterUpdatedAt,
    printerModels,
    reloadData,
  } = usePrinterPageData({
    tauri,
    librarySyncReady,
    clientReadOnly,
    clientHostBaseUrl,
    clientLibraryId,
    supportedPrinterModels,
    onLoadError: handlePrinterLoadError,
    onInteractiveReload: resetPrinterInteractionState,
  });

  const { canUseClientHostWrite, ensureLocalWriteAllowed } = useClientWriteGuards({
    clientHostBaseUrl,
    clientHostWritePaired,
    clientLibraryId,
    clientReadOnly,
    copy: {
      clientReadOnlyAction: t(
        "printers.clientReadOnlyAction",
        "This device is connected as a client. Use the host for printer changes.",
      ),
      clientHostUnavailable: t(
        "printers.clientHostUnavailable",
        "Host connection details are missing for this client device.",
      ),
      clientWriteRequiresPairing: t(
        "printers.clientWriteRequiresPairing",
        "Pair this desktop client with the host before running protected printer actions.",
      ),
    },
    setError,
    setInfoMessage: setInfo,
  });

  const spoolsById = useMemo(() => buildSpoolsById(spools), [spools]);

  const resolveSpoolTareWeightById = useCallback(
    (spoolId: string | null | undefined) =>
      resolveSpoolTareWeightFromMap(spoolsById, spoolId),
    [spoolsById],
  );

  const sortedSpools = useMemo(() => sortSpoolsAlphabetically(spools, locale), [locale, spools]);

  const allowedSpoolOptionsBySlotSpoolId = useMemo(
    () => buildAllowedSpoolOptionsBySlotSpoolId(printers, sortedSpools),
    [printers, sortedSpools],
  );

  const allowedSpoolOptionMapsBySlotSpoolId = useMemo(
    () => buildAllowedSpoolOptionMapsBySlotSpoolId(allowedSpoolOptionsBySlotSpoolId),
    [allowedSpoolOptionsBySlotSpoolId],
  );

  useSlotDropdownDismissal({ openDropdownSlotId, setOpenDropdownSlotId });

  const {
    showAddPrinterModal,
    newPrinterModel,
    newPrinterName,
    newAmsUnits,
    newSlotsPerUnit,
    selectedModelProfile,
    newPrinterCapacity,
    setNewPrinterName,
    setNewAmsUnits,
    setNewSlotsPerUnit,
    selectPrinterModel,
    closeAddPrinterModal,
    openAddPrinterModal,
    handleAddPrinter,
  } = useAddPrinterWorkflow({
    busy,
    tauri,
    clientReadOnly,
    clientHostBaseUrl,
    clientLibraryId,
    ensureLocalWriteAllowed,
    canUseClientHostWrite,
    reloadData,
    setBusy,
    setError,
    setInfo,
  });

  const allowedSpoolsForSlot = useCallback(
    (slotSpoolId?: string | null) =>
      allowedSpoolOptionsBySlotSpoolId.get(slotSpoolId?.trim() ?? "") ??
      allowedSpoolOptionsBySlotSpoolId.get("") ??
      [],
    [allowedSpoolOptionsBySlotSpoolId],
  );

  const findAllowedSpoolForSlot = useCallback(
    (slotSpoolId: string | null | undefined, targetSpoolId: string) => {
      const normalizedTargetId = targetSpoolId.trim();
      if (!normalizedTargetId) {
        return null;
      }
      const optionMap =
        allowedSpoolOptionMapsBySlotSpoolId.get(slotSpoolId?.trim() ?? "") ??
        allowedSpoolOptionMapsBySlotSpoolId.get("");
      return optionMap?.get(normalizedTargetId) ?? null;
    },
    [allowedSpoolOptionMapsBySlotSpoolId],
  );

  function getSlotDraft(slot: PrinterAmsSlotRow): SlotSwapDraft {
    const cached = slotDrafts[slot.slot_id];
    if (cached) {
      return cached;
    }
    return buildSlotSwapDraft(slot, resolveSpoolTareWeightById);
  }

  function findLiveTrayForSlot(
    printerId: string,
    slot: PrinterAmsSlotRow,
  ): {
    liveConfig: BambuLiveIntegrationEntry["config"] | null;
    tray: BambuLiveObservedTray | null;
  } {
    return resolveLiveTrayForSlot(
      printerId,
      slot,
      bambuLiveIntegrations,
      clientReadOnly,
      clientPrinterSource,
    );
  }

  function findSpoolById(spoolId?: string | null) {
    const normalized = (spoolId ?? "").trim();
    if (!normalized) {
      return null;
    }
    return spoolsById.get(normalized) ?? null;
  }

  function openRfidOverrideDialog(
    printer: PrinterOverviewRow,
    slot: PrinterAmsSlotRow,
    liveTray: BambuLiveObservedTray,
  ) {
    const spool = findSpoolById(slot.spool_id);
    if (!spool) {
      return;
    }
    const liveConfig = bambuLiveIntegrations[printer.printer.id] ?? null;
    setRfidOverridePrompt(
      buildRfidOverridePrompt(printer, slot, spool, liveTray, liveConfig),
    );
  }

  function setSlotDraft(slotId: string, next: SlotSwapDraft) {
    setSlotDrafts((current) => ({
      ...current,
      [slotId]: next,
    }));
  }

  function openIncomingWeightDialog(
    printerId: string,
    slot: PrinterAmsSlotRow,
    row: SpoolWithMasterRow,
  ) {
    const prompt = buildIncomingWeightPrompt(printerId, slot, row);
    setIncomingWeightPrompt(prompt);
    setIncomingWeightValue(
      row.spool.remaining_g != null
        ? String(Math.max(0, row.spool.remaining_g + resolveSpoolTareWeightForRow(row)))
        : "",
    );
    setOutgoingWeightValue(
      prompt.requiresOutgoingWeight && slot.spool_remaining_g != null
        ? String(
            Math.max(
              0,
              slot.spool_remaining_g + resolveSpoolTareWeightById(slot.spool_id ?? null),
            ),
          )
        : "",
    );
  }

  function openEmptySlotWeightDialog(printerId: string, slot: PrinterAmsSlotRow) {
    if (!slot.spool_id) {
      return;
    }
    setIncomingWeightPrompt(buildEmptySlotWeightPrompt(printerId, slot));
    setIncomingWeightValue("");
    setOutgoingWeightValue(
      slot.spool_remaining_g != null
        ? String(
            Math.max(
              0,
              slot.spool_remaining_g + resolveSpoolTareWeightById(slot.spool_id ?? null),
            ),
          )
        : "",
    );
  }

  async function confirmIncomingWeightDialog() {
    if (!incomingWeightPrompt) {
      return;
    }
    const parsedIncoming = incomingWeightPrompt.requiresIncomingWeight
      ? parseWeightInput(incomingWeightValue)
      : null;
    if (incomingWeightPrompt.requiresIncomingWeight && parsedIncoming == null) {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
      return;
    }
    const parsedOutgoing = incomingWeightPrompt.requiresOutgoingWeight
      ? parseWeightInput(outgoingWeightValue)
      : null;
    if (incomingWeightPrompt.requiresOutgoingWeight && parsedOutgoing == null) {
      setError(
        t(
          "printers.error.outgoingWeightRequired",
          "Enter outgoing spool weight before swapping rolls.",
        ),
      );
      return;
    }
    const printer = printers.find((item) => item.printer.id === incomingWeightPrompt.printerId);
    const slot = printer?.slots.find((item) => item.slot_id === incomingWeightPrompt.slotId);
    if (!printer || !slot) {
      setError(t("printers.error.updateSlot", "Failed to update printer slot."));
      return;
    }

    const applied = await applySlotChange(printer.printer.id, slot, {
      targetSpoolId: incomingWeightPrompt.targetSpoolId,
      incomingWeight: parsedIncoming,
      outgoingWeight: incomingWeightPrompt.requiresOutgoingWeight ? parsedOutgoing : null,
    });
    if (!applied) {
      return;
    }

    setIncomingWeightPrompt(null);
    setIncomingWeightValue("");
    setOutgoingWeightValue("");
  }

  async function handleSaveOverrideRfid() {
    if (!rfidOverridePrompt || !tauri || busy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    const observedRfid = rfidOverridePrompt.liveTray.tray_uuid?.trim() ?? "";
    if (!observedRfid) {
      setError(
        t(
          "printers.rfidOverrideNothingToSave",
          "No non-empty tray identity is available to save for this slot.",
        ),
      );
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const updateInput = {
        spool_id: rfidOverridePrompt.spool.spool.id,
        rfid_tag: observedRfid,
        rfid_observed_at: rfidOverridePrompt.observedAt ?? new Date().toISOString(),
      };
      await updateInventorySpoolRfidTag(updateInput, {
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      await reloadData();
      setRfidOverridePrompt(null);
      setInfo(t("inventory.rfidSaved", "RFID tag saved on the selected roll."));
    } catch (saveError) {
      console.error(saveError);
      setError(
        commandErrorText(
          saveError,
          t("inventory.error.saveRfid", "Failed to save RFID tag."),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function openWeightPromptForDraft(
    printer: PrinterOverviewRow["printer"],
    slot: PrinterAmsSlotRow,
    draft: SlotSwapDraft,
  ) {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!draft.targetSpoolId) {
      setError(
        t(
          "printers.error.selectRollBeforeWeight",
          "Select a target roll before updating weight.",
        ),
      );
      return;
    }
    const row = findAllowedSpoolForSlot(slot.spool_id, draft.targetSpoolId);
    if (!row) {
      setError(
        t(
          "printers.error.selectRollBeforeWeight",
          "Select a target roll before updating weight.",
        ),
      );
      return;
    }
    openIncomingWeightDialog(printer.id, slot, row);
  }

  async function applyMeasuredWeightWithUsage(
    printerId: string,
    spoolId: string,
    previousRemaining: number | null | undefined,
    measuredTotalWeight: number,
    tareWeight: number,
  ) {
    const preparedWeight = prepareMeasuredWeightUpdate(
      previousRemaining,
      measuredTotalWeight,
      tareWeight,
    );
    await writePreparedMeasuredWeightUpdate(
      {
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      },
      printerId,
      spoolId,
      preparedWeight,
    );
  }

  async function applySlotChange(
    printerId: string,
    slot: PrinterAmsSlotRow,
    overrides?: {
      targetSpoolId: string | null;
      outgoingWeight: number | null;
      incomingWeight: number | null;
    },
  ) {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return false;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return false;
    }
    if (!tauri || busy) {
      return false;
    }
    const draft = overrides ? null : getSlotDraft(slot);
    const targetSpoolId = overrides ? overrides.targetSpoolId : draft?.targetSpoolId || null;
    const outgoingWeightRaw = overrides ? "" : draft?.outgoingWeight.trim() ?? "";
    const incomingWeightRaw = overrides ? "" : draft?.incomingWeight.trim() ?? "";
    const outgoingWeight = overrides ? overrides.outgoingWeight : parseWeightInput(outgoingWeightRaw);
    const incomingWeight = overrides ? overrides.incomingWeight : parseWeightInput(incomingWeightRaw);
    const { tray: liveTray } = findLiveTrayForSlot(printerId, slot);
    const preparedAssignment = preparePrinterSlotAssignment(
      printerId,
      slot,
      targetSpoolId,
      liveTray,
    );
    const { currentSpoolId } = preparedAssignment;

    if (!overrides && outgoingWeightRaw && outgoingWeight == null) {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
      return false;
    }
    if (!overrides && incomingWeightRaw && incomingWeight == null) {
      setError(t("inventory.error.invalidWeight", "Weight value is invalid."));
      return false;
    }

    if (
      !preparedAssignment.shouldAssignSlot &&
      outgoingWeight == null &&
      incomingWeight == null
    ) {
      setInfo(t("printers.noPendingChanges", "No pending slot changes."));
      return false;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (currentSpoolId && preparedAssignment.hasChange) {
        if (outgoingWeight == null) {
          throw new Error(
            t(
              "printers.error.outgoingWeightRequired",
              "Enter outgoing spool weight before swapping rolls.",
            ),
          );
        }
        await applyMeasuredWeightWithUsage(
          printerId,
          currentSpoolId,
          slot.spool_remaining_g,
          outgoingWeight,
          resolveSpoolTareWeightById(currentSpoolId),
        );
      } else if (
        currentSpoolId &&
        !preparedAssignment.hasChange &&
        (incomingWeight != null || outgoingWeight != null)
      ) {
        const sameRollMeasuredWeight = incomingWeight ?? outgoingWeight;
        if (sameRollMeasuredWeight != null) {
          await applyMeasuredWeightWithUsage(
            printerId,
            currentSpoolId,
            slot.spool_remaining_g,
            sameRollMeasuredWeight,
            resolveSpoolTareWeightById(currentSpoolId),
          );
        }
      }

      if (preparedAssignment.shouldAssignSlot) {
        await writePreparedPrinterSlotAssignment(
          {
            clientReadOnly,
            clientHostBaseUrl,
            clientLibraryId,
          },
          preparedAssignment,
        );
      }

      if (
        preparedAssignment.hasChange &&
        preparedAssignment.targetSpoolId &&
        incomingWeight != null
      ) {
        await writeSpoolMeasuredWeight(
          {
            clientReadOnly,
            clientHostBaseUrl,
            clientLibraryId,
          },
          preparedAssignment.targetSpoolId,
          incomingWeight,
        );
      }
      await reloadData();
      setInfo(t("printers.slotUpdated", "Printer slot updated."));
      return true;
    } catch (updateError) {
      console.error(updateError);
      setError(
        commandErrorText(
          updateError,
          t("printers.error.updateSlot", "Failed to update printer slot."),
        ),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.printers", "Printers")}</h1>
          <div className="page-subtitle max-w-2xl">
            {t(
              "printers.subtitle",
              "Track printer slot placement and printer-linked material consumption.",
            )}
          </div>
        </div>
        <div className="page-header-actions">
          <div className="page-header-tools">
            <button
              type="button"
              className="header-button-primary w-full min-[920px]:w-auto"
              onClick={openAddPrinterModal}
              disabled={!tauri || busy || (clientReadOnly ? !clientHostWritePaired : false)}
            >
              {t("settings.addPrinter", "Add printer")}
            </button>
          </div>
        </div>
      </div>

      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t("printers.desktopOnly", "Printer overview is available in the desktop app build.")}
        </FeedbackBanner>
      ) : null}
      {error ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}
      {info ? (
        <FeedbackBanner tone="success" className="mt-4">
          {info}
        </FeedbackBanner>
      ) : null}

      {clientReadOnly && clientPrinterSource !== "LIVE" ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {clientHostDeviceName
            ? `${clientHostDeviceName}. `
            : null}
          {clientPrinterSource === "CACHED"
            ? t(
                "printers.clientReadOnlyCached",
                "Host unavailable. Showing the last cached printer snapshot.",
              )
            : t(
                "printers.clientReadOnlyOffline",
                "Host unavailable and no cached printer snapshot is available yet.",
              )}
          {clientPrinterUpdatedAt
            ? ` ${t("printers.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientPrinterUpdatedAt, locale)}.`
            : null}
        </FeedbackBanner>
      ) : null}

      {loading ? (
        <div className="surface-subtle mt-6 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
          {t("common.loadingPrinters", "Loading printers...")}
        </div>
      ) : null}

      {!loading && printers.length === 0 ? (
        <div className="surface-subtle mt-6 border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
          {t("printers.noPrinters", "No printers configured yet. Use Add printer to create one.")}
        </div>
      ) : null}

      <div className="content-section space-y-4">
        {printers.map((printer) => (
          <PrinterOverviewCard
            key={printer.printer.id}
            printer={printer}
            busy={busy}
            tauri={tauri}
            clientReadOnly={clientReadOnly}
            clientPrinterSource={clientPrinterSource}
            resolvedTheme={resolvedTheme}
            bambuLiveIntegrations={bambuLiveIntegrations}
            openDropdownSlotId={openDropdownSlotId}
            setOpenDropdownSlotId={setOpenDropdownSlotId}
            allowedSpoolsForSlot={allowedSpoolsForSlot}
            findAllowedSpoolForSlot={findAllowedSpoolForSlot}
            getSlotDraft={getSlotDraft}
            setSlotDraft={setSlotDraft}
            findSpoolById={findSpoolById}
            openIncomingWeightDialog={openIncomingWeightDialog}
            openEmptySlotWeightDialog={openEmptySlotWeightDialog}
            openRfidOverrideDialog={openRfidOverrideDialog}
            openWeightPromptForDraft={openWeightPromptForDraft}
          />
        ))}
      </div>

      {incomingWeightPrompt ? (
        <IncomingWeightModal
          busy={busy}
          prompt={incomingWeightPrompt}
          incomingWeightValue={incomingWeightValue}
          outgoingWeightValue={outgoingWeightValue}
          onIncomingWeightChange={setIncomingWeightValue}
          onOutgoingWeightChange={setOutgoingWeightValue}
          onSave={() => void confirmIncomingWeightDialog()}
        />
      ) : null}

      {rfidOverridePrompt ? (
        <RfidOverrideModal
          busy={busy}
          locale={locale}
          prompt={rfidOverridePrompt}
          onClose={() => setRfidOverridePrompt(null)}
          onSave={() => void handleSaveOverrideRfid()}
        />
      ) : null}

      {showAddPrinterModal ? (
        <AddPrinterModal
          busy={busy}
          tauri={tauri}
          printerModels={printerModels}
          resolvedTheme={resolvedTheme}
          newPrinterModel={newPrinterModel}
          newPrinterName={newPrinterName}
          newAmsUnits={newAmsUnits}
          newSlotsPerUnit={newSlotsPerUnit}
          selectedModelProfile={selectedModelProfile}
          newPrinterCapacity={newPrinterCapacity}
          onClose={closeAddPrinterModal}
          onSelectPrinterModel={selectPrinterModel}
          onPrinterNameChange={setNewPrinterName}
          onAmsUnitsChange={setNewAmsUnits}
          onSlotsPerUnitChange={setNewSlotsPerUnit}
          onAddPrinter={() => void handleAddPrinter()}
        />
      ) : null}
    </div>
  );
}
