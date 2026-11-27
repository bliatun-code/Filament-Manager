import { amsRegistrationKey, clearAmsRegistration, readAmsRegistration, registerAmsCatalogSpool, type PendingAmsRegistration } from "../lib/ams_catalog_registration";
import {
  buildAcceptableAmsWeightEstimate,
  canOfferAmsWeightEstimateFromSource,
  canUnloadWithoutWeighing,
  isCurrentAmsWeightEstimate,
  sameAmsWeightEstimate,
} from "../lib/printer_ams_weight_estimate";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { assignedPrinterSpool } from "../lib/printer_data_source";
import { commandErrorText } from "../lib/error_text";
import {
  buildAllowedSpoolOptionMapsBySlotSpoolId,
  buildAllowedSpoolOptionsBySlotSpoolId,
  buildSpoolsById,
  resolveSpoolTareWeightById as resolveSpoolTareWeightFromMap,
} from "../lib/printer_page_model";
import {
  buildLiveRfidCandidateRegistrationState,
  buildRfidOverridePrompt,
  buildSavedRfidPrinterSlotAssignment,
  buildSlotCatalogOnboardingOpenState,
  buildSlotCatalogOnboardingCreateRequest,
  buildSlotCatalogOnboardingPrompt,
  buildSlotSwapDraft,
  isSpoolAllowedForSlot,
  findPrinterSlotById,
  parseWeightInput,
  resolveLiveRfidObservedAt,
  type IncomingWeightPrompt,
  type SlotCatalogOnboardingPrompt,
  type SlotRfidOverridePrompt,
  type SlotSwapDraft,
} from "../lib/printer_slot_model";
import {
  writeAcceptedBambuLiveWeightEstimate,
  writePrinterSlotAssignment,
  writePrinterSlotOperation,
} from "../lib/printer_slot_writes";
import {
  commandErrorText as printerCommandErrorText,
  findLiveTrayForSlot as resolveLiveTrayForSlot,
  liveTrayIdentity,
} from "../lib/printer_live_display";
import { sortSpoolsAlphabetically } from "../lib/spool_sort";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import {
  updateInventorySpoolRfidTag,
} from "../lib/spool_writes";
import type {
  AssignPrinterSlotInput,
  UpdateSpoolRfidTagInput,
  BambuLiveIntegrationEntry,
  BambuLiveObservedTray,
  MasterCatalogRow,
  PrinterAmsSlotRow,
  PrinterOverviewRow,
  SpoolWithMasterRow,
} from "../lib/tauri_client";
import type { I18nContextValue } from "../lib/i18n";
import type { OwnershipType } from "../lib/inventory_list_model";
import type { PrinterSnapshotSource } from "../lib/printer_data_source";
import {
  buildClosedSlotWeightDialog,
  discardIncomingWeightSlotDraft,
  prepareEmptySlotWeightDialog,
  prepareIncomingWeightDialog,
} from "./printer_slot_weight_interaction_model";
import { useSlotDropdownDismissal } from "./use_slot_dropdown_dismissal";

type Translate = I18nContextValue["t"];

type UsePrinterSlotInteractionsInput = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  busy: boolean;
  canUseClientHostWrite: () => boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientPrinterSource: PrinterSnapshotSource;
  clientReadOnly: boolean;
  clientTargetGeneration: number | null;
  ensureLocalWriteAllowed: () => boolean;
  librarySyncReady: boolean;
  locale: string;
  printers: PrinterOverviewRow[];
  reloadData: () => Promise<void>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  spools: NormalizedSpoolWithMasterRow[];
  tauri: boolean;
  t: Translate;
};

export function usePrinterSlotInteractions({
  bambuLiveIntegrations,
  busy,
  canUseClientHostWrite,
  clientHostBaseUrl,
  clientLibraryId,
  clientPrinterSource,
  clientReadOnly,
  clientTargetGeneration,
  ensureLocalWriteAllowed,
  librarySyncReady,
  locale,
  printers,
  reloadData,
  setBusy,
  setError,
  setInfo,
  spools,
  tauri,
  t,
}: UsePrinterSlotInteractionsInput) {
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotSwapDraft>>({});
  const [openDropdownSlotId, setOpenDropdownSlotId] = useState<string | null>(null);
  const [incomingWeightPrompt, setIncomingWeightPrompt] =
    useState<IncomingWeightPrompt | null>(null);
  const [incomingWeightValue, setIncomingWeightValue] = useState("");
  const [outgoingWeightValue, setOutgoingWeightValue] = useState("");
  const [amsWeightClockMs, setAmsWeightClockMs] = useState(() => Date.now());
  const [rfidOverridePrompt, setRfidOverridePrompt] =
    useState<SlotRfidOverridePrompt | null>(null);
  const [slotCatalogOnboardingPrompt, setSlotCatalogOnboardingPrompt] =
    useState<SlotCatalogOnboardingPrompt | null>(null);
  const catalogDialog = useRef<{ token: symbol; saving: boolean; key: string } | null>(null);
  const [catalogToken, setCatalogToken] = useState<symbol>();
  const [catalogRecovery, setCatalogRecovery] = useState<PendingAmsRegistration | null>(null);
  const rfidOperationRef = useRef<symbol | null>(null);
  const rfidPromptRef = useRef<SlotRfidOverridePrompt | null>(null);
  const weightOperationRef = useRef<symbol | null>(null);
  const weightPromptRef = useRef<IncomingWeightPrompt | null>(null);
  const mountedRef = useRef(false);
  const scopeKey = JSON.stringify([
    tauri, librarySyncReady, clientReadOnly, clientHostBaseUrl,
    clientLibraryId, clientTargetGeneration,
  ]);
  const scope = useMemo(() => ({ key: scopeKey }), [scopeKey]);
  const scopeRef = useRef(scope);

  useEffect(() => {
    if (!incomingWeightPrompt?.amsWeightEstimate) {
      return;
    }
    setAmsWeightClockMs(Date.now());
    const timer = window.setInterval(() => setAmsWeightClockMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [incomingWeightPrompt]);

  const resetPrinterInteractionState = useCallback(() => {
    weightPromptRef.current = null;
    rfidPromptRef.current = null;
    if (weightOperationRef.current || rfidOperationRef.current || catalogDialog.current?.saving) {
      rfidOperationRef.current = null;
      weightOperationRef.current = null;
      setBusy(false);
    }
    catalogDialog.current = null;
    setCatalogRecovery(null);
    setSlotDrafts({});
    setOpenDropdownSlotId(null);
    setIncomingWeightPrompt(null);
    setIncomingWeightValue("");
    setOutgoingWeightValue("");
    setRfidOverridePrompt(null);
    setSlotCatalogOnboardingPrompt(null);
  }, [setBusy]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    scopeRef.current = scope;
    resetPrinterInteractionState();
    setBusy(false);
    setError(null);
    setInfo(null);
    return () => {
      mountedRef.current = false;
      rfidOperationRef.current = null;
      rfidPromptRef.current = null;
      weightOperationRef.current = null;
      weightPromptRef.current = null;
    };
  }, [resetPrinterInteractionState, scope, setBusy, setError, setInfo]);

  const spoolsById = useMemo(() => {
    const rows = buildSpoolsById(spools);
    for (const { printer, slots } of printers) {
      for (const slot of slots) {
        if (!slot.spool_id || rows.has(slot.spool_id)) continue;
        const live = resolveLiveTrayForSlot(printer.id, slot, bambuLiveIntegrations, clientReadOnly, clientPrinterSource);
        if (live.tray) continue;
        const assigned = assignedPrinterSpool(slot);
        if (assigned) rows.set(slot.spool_id, assigned);
      }
    }
    return rows;
  }, [bambuLiveIntegrations, clientPrinterSource, clientReadOnly, printers, spools]);

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
      const option = optionMap?.get(normalizedTargetId);
      if (option) return option;
      if (normalizedTargetId !== slotSpoolId) return null;
      const assigned = spoolsById.get(normalizedTargetId);
      return assigned && isSpoolAllowedForSlot(assigned, slotSpoolId) ? assigned : null;
    },
    [allowedSpoolOptionMapsBySlotSpoolId, spoolsById],
  );

  const getSlotDraft = useCallback(
    (slot: PrinterAmsSlotRow): SlotSwapDraft => {
      const cached = slotDrafts[slot.slot_id];
      if (cached) {
        return cached;
      }
      return buildSlotSwapDraft(slot, resolveSpoolTareWeightById);
    },
    [resolveSpoolTareWeightById, slotDrafts],
  );

  const findLiveTrayForSlot = useCallback(
    (
      printerId: string,
      slot: PrinterAmsSlotRow,
    ): {
      liveConfig: BambuLiveIntegrationEntry["config"] | null;
      tray: BambuLiveObservedTray | null;
    } =>
      resolveLiveTrayForSlot(
        printerId,
        slot,
        bambuLiveIntegrations,
        clientReadOnly,
        clientPrinterSource,
      ),
    [bambuLiveIntegrations, clientPrinterSource, clientReadOnly],
  );

  const findSpoolById = useCallback(
    (spoolId?: string | null) => {
      const normalized = (spoolId ?? "").trim();
      if (!normalized) {
        return null;
      }
      return spoolsById.get(normalized) ?? null;
    },
    [spoolsById],
  );

  const currentIncomingAmsWeightEstimate = useMemo(() => {
    const expected = incomingWeightPrompt?.amsWeightEstimate ?? null;
    if (!incomingWeightPrompt || !expected) {
      return null;
    }
    const printer = printers.find(
      (item) => item.printer.id === incomingWeightPrompt.printerId,
    );
    const slot = printer?.slots.find(
      (item) => item.slot_id === incomingWeightPrompt.slotId,
    );
    const row = findSpoolById(incomingWeightPrompt.targetSpoolId);
    const liveConfig = bambuLiveIntegrations[incomingWeightPrompt.printerId];
    const tray = printer && slot ? findLiveTrayForSlot(printer.printer.id, slot).tray : null;
    return isCurrentAmsWeightEstimate(
      expected,
      clientPrinterSource,
      liveConfig,
      slot,
      row,
      tray,
      amsWeightClockMs,
    )
      ? expected
      : null;
  }, [
    amsWeightClockMs,
    bambuLiveIntegrations,
    clientPrinterSource,
    findLiveTrayForSlot,
    findSpoolById,
    incomingWeightPrompt,
    printers,
  ]);
  const liveAmsWeightAvailable = currentIncomingAmsWeightEstimate != null;

  const openRfidOverrideDialog = useCallback(
    (
      printer: PrinterOverviewRow,
      slot: PrinterAmsSlotRow,
      liveTray: BambuLiveObservedTray,
    ) => {
      if (!mountedRef.current || scopeRef.current !== scope || busy || rfidOperationRef.current) return;
      const spool = findSpoolById(slot.spool_id);
      if (!spool) {
        return;
      }
      const liveConfig = bambuLiveIntegrations[printer.printer.id] ?? null;
      const prompt = buildRfidOverridePrompt(printer, slot, spool, liveTray, liveConfig);
      rfidPromptRef.current = prompt;
      setRfidOverridePrompt(prompt);
    },
    [bambuLiveIntegrations, busy, findSpoolById, scope],
  );

  const setSlotDraft = useCallback((slotId: string, next: SlotSwapDraft) => {
    setSlotDrafts((current) => ({
      ...current,
      [slotId]: next,
    }));
  }, []);

  const cancelIncomingWeightDialog = useCallback(() => {
    if (
      busy || weightOperationRef.current || !mountedRef.current ||
      weightPromptRef.current !== incomingWeightPrompt
    ) {
      return;
    }

    const closed = buildClosedSlotWeightDialog(incomingWeightPrompt);
    weightPromptRef.current = null;
    if (closed.discardSlotId) {
      setSlotDrafts((current) =>
        discardIncomingWeightSlotDraft(current, closed.discardSlotId),
      );
    }
    setIncomingWeightPrompt(closed.prompt);
    setIncomingWeightValue(closed.incomingWeightValue);
    setOutgoingWeightValue(closed.outgoingWeightValue);
  }, [busy, incomingWeightPrompt]);

  const runWeightOperation = useCallback(async (
    prompt: IncomingWeightPrompt,
    write: () => Promise<void>,
    successMessage: string,
    failureMessage: string,
  ) => {
    if (
      !tauri || !librarySyncReady || busy || weightOperationRef.current ||
      !mountedRef.current || scopeRef.current !== scope ||
      weightPromptRef.current !== prompt
    ) return;
    if (!clientReadOnly && !ensureLocalWriteAllowed()) return;
    if (clientReadOnly && !canUseClientHostWrite()) return;

    const operation = Symbol("printer-weight-operation");
    weightOperationRef.current = operation;
    const isCurrent = () => mountedRef.current &&
      scopeRef.current === scope && weightOperationRef.current === operation;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await write();
      if (!isCurrent() || weightPromptRef.current !== prompt) return;

      // The write committed. Close its dialog before refreshing so a failed
      // refresh cannot turn the completed operation into another submission.
      weightPromptRef.current = null;
      setIncomingWeightPrompt(null);
      setIncomingWeightValue("");
      setOutgoingWeightValue("");
      setSlotDrafts((current) => discardIncomingWeightSlotDraft(current, prompt.slotId));
      setInfo(successMessage);
      try {
        await reloadData();
      } catch (refreshError) {
        console.error(refreshError);
        if (isCurrent()) {
          setError(t("printers.error.load", "Failed to load printer overview."));
        }
      }
    } catch (writeError) {
      console.error(writeError);
      if (isCurrent() && weightPromptRef.current === prompt) {
        setError(printerCommandErrorText(writeError, failureMessage, t));
      }
    } finally {
      if (isCurrent()) {
        weightOperationRef.current = null;
        setBusy(false);
      }
    }
  }, [
    busy, canUseClientHostWrite, clientReadOnly, ensureLocalWriteAllowed,
    librarySyncReady, reloadData, scope, setBusy, setError, setInfo, tauri, t,
  ]);

  const outgoingWeightConfirmed = useCallback((printerId: string, slot: PrinterAmsSlotRow) => {
    const { liveConfig, tray } = findLiveTrayForSlot(printerId, slot);
    return canUnloadWithoutWeighing(slot, findSpoolById(slot.spool_id), tray, clientPrinterSource, liveConfig);
  }, [findLiveTrayForSlot, findSpoolById, clientPrinterSource]);

  const openEmptySlotWeightDialog = useCallback(
    (printerId: string, slot: PrinterAmsSlotRow) => {
      if (
        !mountedRef.current || scopeRef.current !== scope || !slot.spool_id ||
        !librarySyncReady || busy || weightOperationRef.current
      ) {
        return;
      }
      setError(null);
      setInfo(null);
      const prepared = prepareEmptySlotWeightDialog(printerId, slot, outgoingWeightConfirmed(printerId, slot));
      weightPromptRef.current = prepared.prompt;
      if (!prepared.prompt.requiresOutgoingWeight) {
        void runWeightOperation(prepared.prompt, () => writePrinterSlotOperation(
          {clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration},
          {printer_id: printerId, slot_id: slot.slot_id,
            expected_current_spool_id: slot.spool_id ?? null, target_spool_id: null,
            outgoing_measured_total_g: null, incoming_measured_total_g: null},
        ), t("printers.slotUpdated", "Printer slot updated."),
          t("printers.error.updateSlot", "Failed to update printer slot."));
        return;
      }
      setIncomingWeightPrompt(prepared.prompt);
      setIncomingWeightValue(prepared.incomingWeightValue);
      setOutgoingWeightValue(prepared.outgoingWeightValue);
    },
    [busy, librarySyncReady, scope, setError, setInfo, outgoingWeightConfirmed, runWeightOperation, clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration, t],
  );

  const openIncomingWeightDialog = useCallback(
    (printerId: string, slot: PrinterAmsSlotRow, row: SpoolWithMasterRow) => {
      if (
        !mountedRef.current || scopeRef.current !== scope ||
        !librarySyncReady || busy || weightOperationRef.current
      ) return;
      setError(null);
      setInfo(null);
      const { liveConfig, tray } = findLiveTrayForSlot(printerId, slot);
      const liveTray = canOfferAmsWeightEstimateFromSource(
        clientPrinterSource,
        liveConfig,
      )
        ? tray
        : null;
      const prepared = prepareIncomingWeightDialog(
        printerId,
        slot,
        row,
        liveTray,
        Date.now(),
        outgoingWeightConfirmed(printerId, slot),
      );
      weightPromptRef.current = prepared.prompt;
      if (!prepared.prompt.requiresIncomingWeight && !prepared.prompt.requiresOutgoingWeight) {
        void runWeightOperation(prepared.prompt, () => writePrinterSlotOperation(
          {clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration},
          {printer_id: printerId, slot_id: slot.slot_id,
            expected_current_spool_id: slot.spool_id ?? null, target_spool_id: row.spool.id,
            outgoing_measured_total_g: null, incoming_measured_total_g: null},
        ), t("printers.slotUpdated", "Printer slot updated."),
          t("printers.error.updateSlot", "Failed to update printer slot."));
        return;
      }
      setIncomingWeightPrompt(prepared.prompt);
      setIncomingWeightValue(prepared.incomingWeightValue);
      setOutgoingWeightValue(prepared.outgoingWeightValue);
    },
    [busy, clientHostBaseUrl, clientLibraryId, clientReadOnly, clientTargetGeneration, clientPrinterSource, findLiveTrayForSlot, librarySyncReady, outgoingWeightConfirmed, runWeightOperation, scope, setError, setInfo, t],
  );

  const confirmIncomingWeightDialog = useCallback(async () => {
    if (!incomingWeightPrompt || weightPromptRef.current !== incomingWeightPrompt) return;
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
    const slot = findPrinterSlotById(
      printers, incomingWeightPrompt.printerId, incomingWeightPrompt.slotId,
    );
    if (!slot || (slot.spool_id ?? null) !== incomingWeightPrompt.expectedCurrentSpoolId) {
      setError(t(
        "errors.printerSlotChanged",
        "The roll in this slot changed. Reopen the slot action and confirm the current roll.",
      ));
      return;
    }

    await runWeightOperation(
      incomingWeightPrompt,
      () => writePrinterSlotOperation(
        { clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration },
        {
          printer_id: incomingWeightPrompt.printerId,
          slot_id: incomingWeightPrompt.slotId,
          expected_current_spool_id: incomingWeightPrompt.expectedCurrentSpoolId,
          target_spool_id: incomingWeightPrompt.targetSpoolId,
          outgoing_measured_total_g: parsedOutgoing,
          incoming_measured_total_g: parsedIncoming,
        },
      ),
      t("printers.slotUpdated", "Printer slot updated."),
      t("printers.error.updateSlot", "Failed to update printer slot."),
    );
  }, [
    clientHostBaseUrl, clientLibraryId, clientReadOnly, clientTargetGeneration,
    incomingWeightPrompt, incomingWeightValue, outgoingWeightValue, printers,
    runWeightOperation, setError, t,
  ]);

  const acceptIncomingAmsWeightEstimate = useCallback(async () => {
    const expected = incomingWeightPrompt?.amsWeightEstimate ?? null;
    if (
      !incomingWeightPrompt ||
      !expected ||
      weightPromptRef.current !== incomingWeightPrompt
    ) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }

    const printer = printers.find(
      (item) => item.printer.id === incomingWeightPrompt.printerId,
    );
    const slot = printer?.slots.find(
      (item) => item.slot_id === incomingWeightPrompt.slotId,
    );
    const row = findSpoolById(incomingWeightPrompt.targetSpoolId);
    const currentTray =
      liveAmsWeightAvailable && printer && slot
        ? findLiveTrayForSlot(printer.printer.id, slot).tray
        : null;
    const current =
      slot && row
        ? buildAcceptableAmsWeightEstimate(slot, row, currentTray)
        : null;
    if (!printer || !slot || !row || !sameAmsWeightEstimate(expected, current)) {
      setError(
        t(
          "printers.error.amsWeightEstimateChanged",
          "The AMS estimate or exact roll match changed. Reopen Update weight and try again.",
        ),
      );
      return;
    }

    await runWeightOperation(
      incomingWeightPrompt,
      () => writeAcceptedBambuLiveWeightEstimate(
        { clientReadOnly, clientHostBaseUrl, clientLibraryId },
        {
          printer_id: printer.printer.id,
          slot_id: slot.slot_id,
          spool_id: row.spool.id,
          expected_weight_seen_at: expected.weightSeenAt,
          expected_remaining_grams: expected.remainingGrams,
          expected_current_grams: expected.expectedCurrentGrams,
        },
      ),
      t("printers.amsWeightAccepted", "Weight updated from the current AMS estimate."),
      t(
        "printers.error.amsWeightEstimateChanged",
        "The AMS estimate or exact roll match changed. Reopen Update weight and try again.",
      ),
    );
  }, [
    canUseClientHostWrite, clientHostBaseUrl, clientLibraryId, clientReadOnly,
    ensureLocalWriteAllowed, findLiveTrayForSlot, findSpoolById,
    incomingWeightPrompt, liveAmsWeightAvailable, printers, runWeightOperation,
    setError, t,
  ]);

  const canStartRfidWrite = useCallback(() => (
    mountedRef.current && scopeRef.current === scope && tauri && librarySyncReady &&
    !busy && !rfidOperationRef.current &&
    (clientReadOnly ? clientTargetGeneration != null && canUseClientHostWrite() : ensureLocalWriteAllowed())
  ), [scope, tauri, librarySyncReady, busy, clientReadOnly, clientTargetGeneration, canUseClientHostWrite, ensureLocalWriteAllowed]);

  const closeRfidOverrideDialog = useCallback(() => {
    if (scopeRef.current !== scope || rfidPromptRef.current !== rfidOverridePrompt || rfidOperationRef.current) return;
    rfidPromptRef.current = null;
    setRfidOverridePrompt(null);
  }, [scope, rfidOverridePrompt]);

  const saveExistingSpoolRfid = useCallback(async (
    input: UpdateSpoolRfidTagInput,
    assignment: AssignPrinterSlotInput | null,
    prompt: SlotRfidOverridePrompt | null,
  ) => {
    const operation = Symbol("printer-rfid");
    rfidOperationRef.current = operation;
    const isCurrent = () => mountedRef.current && scopeRef.current === scope &&
      rfidOperationRef.current === operation;
    const target = { clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration };
    let rfidSaved = false;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await updateInventorySpoolRfidTag(input, target);
      rfidSaved = true;
      if (!isCurrent()) return;
      if (assignment) {
        await writePrinterSlotAssignment(target, assignment);
        if (!isCurrent()) return;
      }
      if (prompt && rfidPromptRef.current === prompt) {
        rfidPromptRef.current = null;
        setRfidOverridePrompt(null);
      }
      setInfo(assignment
        ? t("printers.liveRfidRegisteredAndAssigned", "RFID saved and the suggested roll was assigned to this slot.")
        : t("inventory.rfidSaved", "RFID tag saved on the selected roll."));
      try {
        await reloadData();
      } catch (refreshError) {
        console.error(refreshError);
        if (isCurrent()) setError(t("printers.error.load", "Failed to load printer overview."));
      }
    } catch (writeError) {
      if (isCurrent()) {
        const message = rfidSaved
          ? t("printers.error.updateSlot", "Failed to update printer slot.")
          : t("inventory.error.saveRfid", "Failed to save RFID tag.");
        if (rfidSaved) setInfo(t("inventory.rfidSaved", "RFID tag saved on the selected roll."));
        setError(commandErrorText(writeError, message));
      }
    } finally {
      if (isCurrent()) {
        rfidOperationRef.current = null;
        setBusy(false);
      }
    }
  }, [scope, clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration, reloadData, setBusy, setError, setInfo, t]);

  const handleSaveOverrideRfid = useCallback(async () => {
    if (!rfidOverridePrompt || rfidPromptRef.current !== rfidOverridePrompt || !canStartRfidWrite()) return;
    const observedRfid = liveTrayIdentity(rfidOverridePrompt.liveTray);
    if (!observedRfid) {
      setError(
        t(
          "printers.rfidOverrideNothingToSave",
          "No non-empty RFID identity is available to save for this slot.",
        ),
      );
      return;
    }
    await saveExistingSpoolRfid({
      spool_id: rfidOverridePrompt.spool.spool.id,
      rfid_tag: observedRfid,
      rfid_observed_at: rfidOverridePrompt.observedAt ?? new Date().toISOString(),
    }, null, rfidOverridePrompt);
  }, [rfidOverridePrompt, canStartRfidWrite, saveExistingSpoolRfid, setError, t]);

  const registerLiveRfidCandidate = useCallback(
    async (
      printer: PrinterOverviewRow,
      slot: PrinterAmsSlotRow,
      liveTray: BambuLiveObservedTray,
      row: SpoolWithMasterRow,
    ) => {
      if (!canStartRfidWrite()) return;
      const currentSlot = findPrinterSlotById(printers, printer.printer.id, slot.slot_id);
      const { tray: currentLiveTray } = findLiveTrayForSlot(
        printer.printer.id,
        currentSlot ?? slot,
      );
      const registrationState = buildLiveRfidCandidateRegistrationState(
        slot,
        liveTray,
        row,
        {
          currentSlot,
          currentLiveTray,
        },
      );
      if (registrationState.reason === "missing_rfid") {
        setError(
          t(
            "printers.rfidOverrideNothingToSave",
            "No non-empty RFID identity is available to save for this slot.",
          ),
        );
        return;
      }
      if (registrationState.reason === "live_identity_changed") {
        setError(
          t(
            "printers.error.liveRfidChangedBeforeSave",
            "The live AMS identity changed before saving. Reopen the slot action and confirm the current roll.",
          ),
        );
        return;
      }
      if (registrationState.reason === "live_slot_unloaded") {
        setError(
          t(
            "printers.error.liveSlotUnloadedBeforeSave",
            "AMS no longer reports a loaded roll in this slot. Refresh and confirm the current roll before saving RFID.",
          ),
        );
        return;
      }
      if (registrationState.reason === "candidate_has_rfid") {
        setError(
          t(
            "printers.error.candidateAlreadyHasRfid",
            "This inventory roll already has an RFID identity saved.",
          ),
        );
        return;
      }
      if (registrationState.reason === "candidate_unavailable") {
        setError(
          t(
            "printers.error.candidateUnavailableForRfid",
            "Refresh printer data; this roll is no longer available as a live Bambu RFID candidate.",
          ),
        );
        return;
      }
      if (registrationState.reason === "select_candidate_first") {
        setError(
          t(
            "printers.error.selectCandidateBeforeRfid",
            "Select this roll in the slot first, so any outgoing roll weight is handled before saving RFID.",
          ),
        );
        return;
      }
      const observedRfid = registrationState.observedRfid;
      const slotForSafety = registrationState.slot;

      const assignment = slotForSafety.spool_id ? null :
        buildSavedRfidPrinterSlotAssignment(printer.printer.id, slotForSafety, row.spool.id);
      await saveExistingSpoolRfid({
        spool_id: row.spool.id,
        rfid_tag: observedRfid,
        rfid_observed_at: resolveLiveRfidObservedAt({
          liveTray, currentLiveTray,
          observedAtFallback: bambuLiveIntegrations[printer.printer.id]?.observed_state?.last_seen_at ?? new Date().toISOString(),
        }) ?? new Date().toISOString(),
      }, assignment, null);
    },
    [bambuLiveIntegrations, canStartRfidWrite, findLiveTrayForSlot, printers, saveExistingSpoolRfid, setError, t],
  );

  const createLiveBambuCatalogSpool = useCallback(
    (
      printer: PrinterOverviewRow,
      slot: PrinterAmsSlotRow,
      liveTray: BambuLiveObservedTray,
      master: MasterCatalogRow,
    ) => {
      if (!tauri || busy || !mountedRef.current || scopeRef.current !== scope || catalogDialog.current?.saving) {
        return false;
      }
      if (!clientReadOnly && !ensureLocalWriteAllowed()) {
        return false;
      }
      if (clientReadOnly && !canUseClientHostWrite()) {
        return false;
      }
      const currentSlot = findPrinterSlotById(printers, printer.printer.id, slot.slot_id);
      const { tray: currentLiveTray } = findLiveTrayForSlot(
        printer.printer.id,
        currentSlot ?? slot,
      );
      const key = amsRegistrationKey({ clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration },
        printer.printer.id, slot.slot_id, liveTrayIdentity(liveTray));
      let pending: PendingAmsRegistration | null;
      try { pending = readAmsRegistration(key); }
      catch (error) { setError(printerCommandErrorText(error, t("inventory.error.add", "Failed to add filament."), t)); return false; }
      const openState = buildSlotCatalogOnboardingOpenState(slot, liveTray, {
        currentSlot,
        currentLiveTray,
      });
      if (!pending && openState.reason === "missing_rfid") {
        setError(
          t(
            "printers.rfidOverrideNothingToSave",
            "No non-empty RFID identity is available to save for this slot.",
          ),
        );
        return false;
      }
      if (!pending && openState.reason === "occupied_slot") {
        setError(
          t(
            "printers.error.createFromCatalogRequiresEmptySlot",
            "Clear or swap the current roll through the normal slot flow before creating a new catalog roll here.",
          ),
        );
        return false;
      }
      if (!pending && openState.reason === "live_slot_unloaded") {
        setError(
          t(
            "printers.error.liveSlotUnloadedBeforeSave",
            "AMS no longer reports a loaded roll in this slot. Refresh and confirm the current roll before saving RFID.",
          ),
        );
        return false;
      }
      if (!pending && openState.reason === "live_identity_changed") {
        setError(
          t(
            "printers.error.liveRfidChangedBeforeSave",
            "The live AMS identity changed before saving. Reopen the slot action and confirm the current roll.",
          ),
        );
        return false;
      }

      const liveConfig = bambuLiveIntegrations[printer.printer.id] ?? null;
      const prompt = buildSlotCatalogOnboardingPrompt(printer, openState.slot, master, liveTray, liveConfig);
      if (pending && pending.batch.master_ids[0] !== master.id) {
        setError(t("errors.catalogSpoolBatchConflict", "This batch ID belongs to a different request or library. Check inventory before registering another batch."));
        return false;
      }
      if (pending) {
        prompt.initialWeight = String(pending.batch.initial_weight_g);
        prompt.location = pending.batch.location ?? "";
        prompt.ownershipType = pending.batch.ownership_type;
        prompt.borrowedFromName = pending.batch.owner_name ?? "";
        prompt.borrowedFromContact = pending.batch.owner_contact ?? "";
        prompt.borrowedInNote = pending.batch.ownership_note ?? "";
      }
      const token = Symbol();
      catalogDialog.current = { token, saving: false, key };
      setCatalogToken(token);
      setCatalogRecovery(pending);
      setSlotCatalogOnboardingPrompt(prompt);
      return true;
    },
    [
      bambuLiveIntegrations,
      scope, clientHostBaseUrl, clientLibraryId, clientTargetGeneration,
      busy,
      canUseClientHostWrite,
      clientReadOnly,
      ensureLocalWriteAllowed,
      findLiveTrayForSlot,
      printers,
      setError,
      tauri,
      t,
    ],
  );


  const closeCatalogDialog = useCallback(() => {
    if (catalogDialog.current?.token !== catalogToken || catalogDialog.current?.saving) return;
    catalogDialog.current = null;
    setCatalogRecovery(null);
    setSlotCatalogOnboardingPrompt(null);
  }, [catalogToken]);

  const acknowledgeLegacyRegistration = useCallback(() => {
    const dialog = catalogDialog.current;
    if (!dialog || dialog.token !== catalogToken || dialog.saving || !catalogRecovery?.legacy) return;
    try { clearAmsRegistration(dialog.key, catalogRecovery.batch.batch_id); closeCatalogDialog(); }
    catch (error) { setError(printerCommandErrorText(error, t("inventory.error.add", "Failed to add filament."), t)); }
  }, [catalogToken, catalogRecovery, closeCatalogDialog, setError, t]);

  const updateSlotCatalogOnboardingPrompt = useCallback(
    (patch: Partial<SlotCatalogOnboardingPrompt>) => {
      if (catalogDialog.current?.token !== catalogToken || catalogDialog.current?.saving || catalogRecovery) return;
      setSlotCatalogOnboardingPrompt((current) =>
        current ? { ...current, ...patch } : current,
      );
    },
    [catalogToken, catalogRecovery],
  );

  const setSlotCatalogOwnershipType = useCallback(
    (ownershipType: OwnershipType) => {
      updateSlotCatalogOnboardingPrompt({ ownershipType });
    },
    [updateSlotCatalogOnboardingPrompt],
  );

  const handleCreateLiveBambuCatalogSpool = useCallback(async () => {
    const dialog = catalogDialog.current;
    if (!dialog || dialog.token !== catalogToken || dialog.saving || catalogRecovery?.legacy ||
        !mountedRef.current || scopeRef.current !== scope || !slotCatalogOnboardingPrompt || !tauri || busy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }

    const { printerId, slot } = slotCatalogOnboardingPrompt;
    const currentSlot = findPrinterSlotById(printers, printerId, slot.slot_id);
    const slotForWrite = currentSlot ?? slot;
    const { tray: currentLiveTray } = findLiveTrayForSlot(printerId, slotForWrite);
    const createRequest = buildSlotCatalogOnboardingCreateRequest(slotCatalogOnboardingPrompt, {
      id: `spool_${Date.now()}`,
      currentSlot: catalogRecovery ? { ...slot, spool_id: null } : currentSlot,
      currentLiveTray: catalogRecovery ? slotCatalogOnboardingPrompt.liveTray : currentLiveTray,
      observedAtFallback:
        bambuLiveIntegrations[printerId]?.observed_state?.last_seen_at ?? null,
    });
    if (!createRequest.ok && createRequest.error === "missing_rfid") {
      setError(
        t(
          "printers.rfidOverrideNothingToSave",
          "No non-empty RFID identity is available to save for this slot.",
        ),
      );
      return;
    }
    if (!createRequest.ok && createRequest.error === "occupied_slot") {
      setError(
        t(
          "printers.error.createFromCatalogRequiresEmptySlot",
          "Clear or swap the current roll through the normal slot flow before creating a new catalog roll here.",
        ),
      );
      return;
    }
    if (
      !createRequest.ok &&
      (createRequest.error === "borrowed_owner_required" ||
        createRequest.error === "BORROWED_OWNER_REQUIRED")
    ) {
      setError(
        t(
          "inventory.error.borrowedInNeedsOwner",
          "Borrowed-in registration needs a name for who the spool is borrowed from.",
        ),
      );
      return;
    }
    if (!createRequest.ok && createRequest.error === "live_slot_unloaded") {
      setError(
        t(
          "printers.error.liveSlotUnloadedBeforeSave",
          "AMS no longer reports a loaded roll in this slot. Refresh and confirm the current roll before saving RFID.",
        ),
      );
      return;
    }
    if (!createRequest.ok && createRequest.error === "live_identity_changed") {
      setError(
        t(
          "printers.error.liveRfidChangedBeforeSave",
          "The live AMS identity changed before saving. Reopen the slot action and confirm the current roll.",
        ),
      );
      return;
    }
    if (!createRequest.ok) {
      setError(t("inventory.error.add", "Failed to add filament."));
      return;
    }
    const { observedRfid, request, rfidObservedAt } = createRequest;

    const current = () => mountedRef.current && scopeRef.current === scope && catalogDialog.current === dialog;
    let committed = false;
    dialog.saving = true;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await registerAmsCatalogSpool(
        { clientReadOnly, clientHostBaseUrl, clientLibraryId, clientTargetGeneration },
        request.input,
        { printerId, slot: slotForWrite, observedRfid, rfidObservedAt: rfidObservedAt ?? new Date().toISOString() },
        current,
        catalogRecovery,
      );
      committed = true;
      if (!current()) return;
      setSlotCatalogOnboardingPrompt(null);
      setCatalogRecovery(null);
      setInfo(t("printers.liveCatalogCreatedAndAssigned",
        "{label} was added, RFID was saved, and the roll was assigned to this slot.", { label: request.addedLabel }));
      try { await reloadData(); }
      catch { if (current()) setError(t("printers.error.load", "Failed to load printer overview.")); }
    } catch (error) {
      if (!current()) return;
      let failure = error;
      try { setCatalogRecovery(readAmsRegistration(dialog.key)); }
      catch (storageError) { failure = storageError; }
      setError(printerCommandErrorText(failure, t("inventory.error.add", "Failed to add filament."), t));
    } finally {
      if (current()) {
        if (committed) catalogDialog.current = null;
        dialog.saving = false;
        setBusy(false);
      }
    }
    },
    [
      catalogToken, catalogRecovery, scope,
      bambuLiveIntegrations,
      busy,
      canUseClientHostWrite,
      clientHostBaseUrl,
      clientLibraryId,
      clientReadOnly,
      clientTargetGeneration,
      ensureLocalWriteAllowed,
      findLiveTrayForSlot,
      printers,
      reloadData,
      setBusy,
      setError,
      setInfo,
      slotCatalogOnboardingPrompt,
      tauri,
      t,
    ],
  );

  const openWeightPromptForDraft = useCallback(
    (printer: PrinterOverviewRow["printer"], slot: PrinterAmsSlotRow, draft: SlotSwapDraft) => {
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
    },
    [
      canUseClientHostWrite,
      clientReadOnly,
      ensureLocalWriteAllowed,
      findAllowedSpoolForSlot,
      openIncomingWeightDialog,
      setError,
      t,
    ],
  );

  return {
    allowedSpoolsForSlot,
    acceptIncomingAmsWeightEstimate,
    liveAmsWeightAvailable,
    cancelIncomingWeightDialog,
    confirmIncomingWeightDialog,
    findAllowedSpoolForSlot,
    findLiveTrayForSlot,
    findSpoolById,
    getSlotDraft,
    handleSaveOverrideRfid,
    incomingWeightPrompt,
    incomingWeightValue,
    openDropdownSlotId,
    openEmptySlotWeightDialog,
    openIncomingWeightDialog,
    openRfidOverrideDialog,
    registerLiveRfidCandidate,
    createLiveBambuCatalogSpool,
    handleCreateLiveBambuCatalogSpool,
    openWeightPromptForDraft,
    outgoingWeightValue,
    resetPrinterInteractionState,
    rfidOverridePrompt,
    setIncomingWeightValue,
    setOpenDropdownSlotId,
    setOutgoingWeightValue,
    closeRfidOverrideDialog,
    closeCatalogDialog, acknowledgeLegacyRegistration, catalogRecovery,
    setSlotCatalogOwnershipType,
    setSlotDraft,
    slotCatalogOnboardingPrompt,
    updateSlotCatalogOnboardingPrompt,
  };
}
