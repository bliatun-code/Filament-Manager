import {
  buildAcceptableAmsWeightEstimate,
  canOfferAmsWeightEstimateFromSource,
  isCurrentAmsWeightEstimate,
  sameAmsWeightEstimate,
} from "../lib/printer_ams_weight_estimate";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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
  buildSlotCatalogOnboardingPostCreateWrites,
  buildSlotCatalogOnboardingPrompt,
  buildSlotSwapDraft,
  findPrinterSlotById,
  parseWeightInput,
  prepareMeasuredWeightUpdate,
  preparePrinterSlotAssignment,
  resolveLiveRfidObservedAt,
  type IncomingWeightPrompt,
  type SlotCatalogOnboardingPrompt,
  type SlotRfidOverridePrompt,
  type SlotSwapDraft,
} from "../lib/printer_slot_model";
import {
  writePreparedMeasuredWeightUpdate,
  writePreparedPrinterSlotAssignment,
  writeAcceptedBambuLiveWeightEstimate,
  writePrinterSlotAssignment,
  writeSpoolMeasuredWeight,
} from "../lib/printer_slot_writes";
import {
  commandErrorText as printerCommandErrorText,
  findLiveTrayForSlot as resolveLiveTrayForSlot,
  liveTrayIdentity,
} from "../lib/printer_live_display";
import { sortSpoolsAlphabetically } from "../lib/spool_sort";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import {
  createInventorySpoolFromMaster,
  updateInventorySpoolRfidTag,
} from "../lib/spool_writes";
import type {
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
  ensureLocalWriteAllowed: () => boolean;
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
  ensureLocalWriteAllowed,
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
  const amsWeightAcceptInFlightRef = useRef(false);

  useEffect(() => {
    if (!incomingWeightPrompt?.amsWeightEstimate) {
      return;
    }
    setAmsWeightClockMs(Date.now());
    const timer = window.setInterval(() => setAmsWeightClockMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [incomingWeightPrompt]);

  const resetPrinterInteractionState = useCallback(() => {
    setSlotDrafts({});
    setOpenDropdownSlotId(null);
    setIncomingWeightPrompt(null);
    setIncomingWeightValue("");
    setOutgoingWeightValue("");
    setRfidOverridePrompt(null);
    setSlotCatalogOnboardingPrompt(null);
  }, []);

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
      const spool = findSpoolById(slot.spool_id);
      if (!spool) {
        return;
      }
      const liveConfig = bambuLiveIntegrations[printer.printer.id] ?? null;
      setRfidOverridePrompt(
        buildRfidOverridePrompt(printer, slot, spool, liveTray, liveConfig),
      );
    },
    [bambuLiveIntegrations, findSpoolById],
  );

  const setSlotDraft = useCallback((slotId: string, next: SlotSwapDraft) => {
    setSlotDrafts((current) => ({
      ...current,
      [slotId]: next,
    }));
  }, []);

  const openIncomingWeightDialog = useCallback(
    (printerId: string, slot: PrinterAmsSlotRow, row: SpoolWithMasterRow) => {
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
        resolveSpoolTareWeightById,
        liveTray,
      );
      setIncomingWeightPrompt(prepared.prompt);
      setIncomingWeightValue(prepared.incomingWeightValue);
      setOutgoingWeightValue(prepared.outgoingWeightValue);
    },
    [clientPrinterSource, findLiveTrayForSlot, resolveSpoolTareWeightById],
  );

  const openEmptySlotWeightDialog = useCallback(
    (printerId: string, slot: PrinterAmsSlotRow) => {
      if (!slot.spool_id) {
        return;
      }
      const prepared = prepareEmptySlotWeightDialog(
        printerId,
        slot,
        resolveSpoolTareWeightById,
      );
      setIncomingWeightPrompt(prepared.prompt);
      setIncomingWeightValue(prepared.incomingWeightValue);
      setOutgoingWeightValue(prepared.outgoingWeightValue);
    },
    [resolveSpoolTareWeightById],
  );

  const cancelIncomingWeightDialog = useCallback(() => {
    if (busy) {
      return;
    }

    const closed = buildClosedSlotWeightDialog(incomingWeightPrompt);
    if (closed.discardSlotId) {
      setSlotDrafts((current) =>
        discardIncomingWeightSlotDraft(current, closed.discardSlotId),
      );
    }
    setIncomingWeightPrompt(closed.prompt);
    setIncomingWeightValue(closed.incomingWeightValue);
    setOutgoingWeightValue(closed.outgoingWeightValue);
  }, [busy, incomingWeightPrompt]);

  const applyMeasuredWeightWithUsage = useCallback(
    async (
      printerId: string,
      spoolId: string,
      previousRemaining: number | null | undefined,
      measuredTotalWeight: number,
      tareWeight: number,
    ) => {
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
    },
    [clientHostBaseUrl, clientLibraryId, clientReadOnly],
  );

  const applySlotChange = useCallback(
    async (
      printerId: string,
      slot: PrinterAmsSlotRow,
      overrides?: {
        targetSpoolId: string | null;
        outgoingWeight: number | null;
        incomingWeight: number | null;
      },
    ) => {
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
      const outgoingWeight = overrides
        ? overrides.outgoingWeight
        : parseWeightInput(outgoingWeightRaw);
      const incomingWeight = overrides
        ? overrides.incomingWeight
        : parseWeightInput(incomingWeightRaw);
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
          printerCommandErrorText(
            updateError,
            t("printers.error.updateSlot", "Failed to update printer slot."),
          ),
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [
      applyMeasuredWeightWithUsage,
      busy,
      canUseClientHostWrite,
      clientHostBaseUrl,
      clientLibraryId,
      clientReadOnly,
      ensureLocalWriteAllowed,
      findLiveTrayForSlot,
      getSlotDraft,
      reloadData,
      resolveSpoolTareWeightById,
      setBusy,
      setError,
      setInfo,
      tauri,
      t,
    ],
  );

  const confirmIncomingWeightDialog = useCallback(async () => {
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
  }, [
    applySlotChange,
    incomingWeightPrompt,
    incomingWeightValue,
    outgoingWeightValue,
    printers,
    setError,
    t,
  ]);

  const acceptIncomingAmsWeightEstimate = useCallback(async () => {
    const expected = incomingWeightPrompt?.amsWeightEstimate ?? null;
    if (
      !incomingWeightPrompt ||
      !expected ||
      !tauri ||
      busy ||
      amsWeightAcceptInFlightRef.current
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

    amsWeightAcceptInFlightRef.current = true;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await writeAcceptedBambuLiveWeightEstimate(
        {
          clientReadOnly,
          clientHostBaseUrl,
          clientLibraryId,
        },
        {
          printer_id: printer.printer.id,
          slot_id: slot.slot_id,
          spool_id: row.spool.id,
          expected_weight_seen_at: expected.weightSeenAt,
          expected_remaining_grams: expected.remainingGrams,
          expected_current_grams: expected.expectedCurrentGrams,
        },
      );
      await reloadData();
      setIncomingWeightPrompt(null);
      setIncomingWeightValue("");
      setOutgoingWeightValue("");
      setInfo(
        t(
          "printers.amsWeightAccepted",
          "Weight updated from the current AMS estimate.",
        ),
      );
    } catch (acceptError) {
      console.error(acceptError);
      setError(
        printerCommandErrorText(
          acceptError,
          t(
            "printers.error.amsWeightEstimateChanged",
            "The AMS estimate or exact roll match changed. Reopen Update weight and try again.",
          ),
        ),
      );
    } finally {
      amsWeightAcceptInFlightRef.current = false;
      setBusy(false);
    }
  }, [
    busy,
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    ensureLocalWriteAllowed,
    findLiveTrayForSlot,
    findSpoolById,
    incomingWeightPrompt,
    liveAmsWeightAvailable,
    printers,
    reloadData,
    setBusy,
    setError,
    setInfo,
    tauri,
    t,
  ]);

  const handleSaveOverrideRfid = useCallback(async () => {
    if (!rfidOverridePrompt || !tauri || busy) {
      return;
    }
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
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
  }, [
    busy,
    canUseClientHostWrite,
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    ensureLocalWriteAllowed,
    reloadData,
    rfidOverridePrompt,
    setBusy,
    setError,
    setInfo,
    tauri,
    t,
  ]);

  const registerLiveRfidCandidate = useCallback(
    async (
      printer: PrinterOverviewRow,
      slot: PrinterAmsSlotRow,
      liveTray: BambuLiveObservedTray,
      row: SpoolWithMasterRow,
    ) => {
      if (!tauri || busy) {
        return;
      }
      if (!clientReadOnly && !ensureLocalWriteAllowed()) {
        return;
      }
      if (clientReadOnly && !canUseClientHostWrite()) {
        return;
      }
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

      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        await updateInventorySpoolRfidTag(
          {
            spool_id: row.spool.id,
            rfid_tag: observedRfid,
            rfid_observed_at:
              resolveLiveRfidObservedAt({
                liveTray,
                currentLiveTray,
                observedAtFallback:
                  bambuLiveIntegrations[printer.printer.id]?.observed_state?.last_seen_at ??
                  new Date().toISOString(),
              }) ?? new Date().toISOString(),
          },
          {
            clientReadOnly,
            clientHostBaseUrl,
            clientLibraryId,
          },
        );

        if (!slotForSafety.spool_id) {
          await writePrinterSlotAssignment(
            {
              clientReadOnly,
              clientHostBaseUrl,
              clientLibraryId,
            },
            buildSavedRfidPrinterSlotAssignment(
              printer.printer.id,
              slotForSafety,
              row.spool.id,
            ),
          );
        }

        await reloadData();
        setInfo(
          slotForSafety.spool_id
            ? t("inventory.rfidSaved", "RFID tag saved on the selected roll.")
            : t(
                "printers.liveRfidRegisteredAndAssigned",
                "RFID saved and the suggested roll was assigned to this slot.",
              ),
        );
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
    },
    [
      bambuLiveIntegrations,
      busy,
      canUseClientHostWrite,
      clientHostBaseUrl,
      clientLibraryId,
      clientReadOnly,
      ensureLocalWriteAllowed,
      findLiveTrayForSlot,
      printers,
      reloadData,
      setBusy,
      setError,
      setInfo,
      tauri,
      t,
    ],
  );

  const createLiveBambuCatalogSpool = useCallback(
    (
      printer: PrinterOverviewRow,
      slot: PrinterAmsSlotRow,
      liveTray: BambuLiveObservedTray,
      master: MasterCatalogRow,
    ) => {
      if (!tauri || busy) {
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
      const openState = buildSlotCatalogOnboardingOpenState(slot, liveTray, {
        currentSlot,
        currentLiveTray,
      });
      if (openState.reason === "missing_rfid") {
        setError(
          t(
            "printers.rfidOverrideNothingToSave",
            "No non-empty RFID identity is available to save for this slot.",
          ),
        );
        return false;
      }
      if (openState.reason === "occupied_slot") {
        setError(
          t(
            "printers.error.createFromCatalogRequiresEmptySlot",
            "Clear or swap the current roll through the normal slot flow before creating a new catalog roll here.",
          ),
        );
        return false;
      }
      if (openState.reason === "live_slot_unloaded") {
        setError(
          t(
            "printers.error.liveSlotUnloadedBeforeSave",
            "AMS no longer reports a loaded roll in this slot. Refresh and confirm the current roll before saving RFID.",
          ),
        );
        return false;
      }
      if (openState.reason === "live_identity_changed") {
        setError(
          t(
            "printers.error.liveRfidChangedBeforeSave",
            "The live AMS identity changed before saving. Reopen the slot action and confirm the current roll.",
          ),
        );
        return false;
      }

      const liveConfig = bambuLiveIntegrations[printer.printer.id] ?? null;
      setSlotCatalogOnboardingPrompt(
        buildSlotCatalogOnboardingPrompt(printer, openState.slot, master, liveTray, liveConfig),
      );
      return true;
    },
    [
      bambuLiveIntegrations,
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

  const updateSlotCatalogOnboardingPrompt = useCallback(
    (patch: Partial<SlotCatalogOnboardingPrompt>) => {
      setSlotCatalogOnboardingPrompt((current) =>
        current ? { ...current, ...patch } : current,
      );
    },
    [],
  );

  const setSlotCatalogOwnershipType = useCallback(
    (ownershipType: OwnershipType) => {
      updateSlotCatalogOnboardingPrompt({ ownershipType });
    },
    [updateSlotCatalogOnboardingPrompt],
  );

  const handleCreateLiveBambuCatalogSpool = useCallback(async () => {
    if (!slotCatalogOnboardingPrompt || !tauri || busy) {
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
      currentSlot,
      currentLiveTray,
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

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const createdSpoolId = await createInventorySpoolFromMaster(request.input, {
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      const postCreateWrites = buildSlotCatalogOnboardingPostCreateWrites({
        printerId,
        slot: slotForWrite,
        createdSpoolId,
        observedRfid,
        rfidObservedAt: rfidObservedAt ?? new Date().toISOString(),
      });
      await updateInventorySpoolRfidTag(postCreateWrites.rfidInput, {
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      await writePrinterSlotAssignment(
        {
          clientReadOnly,
          clientHostBaseUrl,
          clientLibraryId,
        },
        postCreateWrites.assignInput,
      );
      await reloadData();
      setSlotCatalogOnboardingPrompt(null);
      setInfo(
        t(
          "printers.liveCatalogCreatedAndAssigned",
          "{label} was added, RFID was saved, and the roll was assigned to this slot.",
          { label: request.addedLabel },
        ),
      );
    } catch (createError) {
      console.error(createError);
      setError(
        commandErrorText(
          createError,
          t("inventory.error.add", "Failed to add filament."),
        ),
      );
    } finally {
      setBusy(false);
    }
    },
    [
      bambuLiveIntegrations,
      busy,
      canUseClientHostWrite,
      clientHostBaseUrl,
      clientLibraryId,
      clientReadOnly,
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
    setRfidOverridePrompt,
    setSlotCatalogOnboardingPrompt,
    setSlotCatalogOwnershipType,
    setSlotDraft,
    slotCatalogOnboardingPrompt,
    updateSlotCatalogOnboardingPrompt,
  };
}
