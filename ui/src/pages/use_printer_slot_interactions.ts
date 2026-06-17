import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { commandErrorText } from "../lib/error_text";
import { buildInventoryCreateSpoolRequest } from "../lib/inventory_create_model";
import {
  buildAllowedSpoolOptionMapsBySlotSpoolId,
  buildAllowedSpoolOptionsBySlotSpoolId,
  buildSpoolsById,
  resolveSpoolTareWeightById as resolveSpoolTareWeightFromMap,
} from "../lib/printer_page_model";
import {
  buildEmptySlotWeightPrompt,
  buildIncomingWeightPrompt,
  buildMeasuredTotalWeightDraft,
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
  writePrinterSlotAssignment,
  writeSpoolMeasuredWeight,
} from "../lib/printer_slot_writes";
import {
  commandErrorText as printerCommandErrorText,
  findLiveTrayForSlot as resolveLiveTrayForSlot,
  liveTrayIdentity,
} from "../lib/printer_live_display";
import { sortSpoolsAlphabetically } from "../lib/spool_sort";
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
import type { PrinterSnapshotSource } from "../lib/printer_data_source";
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
  spools: SpoolWithMasterRow[];
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
  const [rfidOverridePrompt, setRfidOverridePrompt] =
    useState<SlotRfidOverridePrompt | null>(null);

  const resetPrinterInteractionState = useCallback(() => {
    setSlotDrafts({});
    setOpenDropdownSlotId(null);
    setIncomingWeightPrompt(null);
    setIncomingWeightValue("");
    setOutgoingWeightValue("");
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
      const prompt = buildIncomingWeightPrompt(printerId, slot, row);
      setIncomingWeightPrompt(prompt);
      setIncomingWeightValue(
        buildMeasuredTotalWeightDraft(row.spool.remaining_g, resolveSpoolTareWeightForRow(row)),
      );
      setOutgoingWeightValue(
        prompt.requiresOutgoingWeight && slot.spool_remaining_g != null
          ? buildMeasuredTotalWeightDraft(
              slot.spool_remaining_g,
              resolveSpoolTareWeightById(slot.spool_id ?? null),
            )
          : "",
      );
    },
    [resolveSpoolTareWeightById],
  );

  const openEmptySlotWeightDialog = useCallback(
    (printerId: string, slot: PrinterAmsSlotRow) => {
      if (!slot.spool_id) {
        return;
      }
      setIncomingWeightPrompt(buildEmptySlotWeightPrompt(printerId, slot));
      setIncomingWeightValue("");
      setOutgoingWeightValue(
        slot.spool_remaining_g != null
          ? buildMeasuredTotalWeightDraft(
              slot.spool_remaining_g,
              resolveSpoolTareWeightById(slot.spool_id ?? null),
            )
          : "",
      );
    },
    [resolveSpoolTareWeightById],
  );

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
      const observedRfid = liveTrayIdentity(liveTray);
      if (!observedRfid) {
        setError(
          t(
            "printers.rfidOverrideNothingToSave",
            "No non-empty RFID identity is available to save for this slot.",
          ),
        );
        return;
      }
      if (row.spool.rfid_tag?.trim()) {
        setError(
          t(
            "printers.error.candidateAlreadyHasRfid",
            "This inventory roll already has an RFID identity saved.",
          ),
        );
        return;
      }
      if (slot.spool_id && slot.spool_id !== row.spool.id) {
        setError(
          t(
            "printers.error.selectCandidateBeforeRfid",
            "Select this roll in the slot first, so any outgoing roll weight is handled before saving RFID.",
          ),
        );
        return;
      }

      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        await updateInventorySpoolRfidTag(
          {
            spool_id: row.spool.id,
            rfid_tag: observedRfid,
            rfid_observed_at:
              liveTray.last_identity_seen_at ??
              bambuLiveIntegrations[printer.printer.id]?.observed_state?.last_seen_at ??
              new Date().toISOString(),
          },
          {
            clientReadOnly,
            clientHostBaseUrl,
            clientLibraryId,
          },
        );

        if (!slot.spool_id) {
          await writePrinterSlotAssignment(
            {
              clientReadOnly,
              clientHostBaseUrl,
              clientLibraryId,
            },
            {
              printer_id: printer.printer.id,
              slot_id: slot.slot_id,
              spool_id: row.spool.id,
              rfid_override_tray_uuid: observedRfid,
              rfid_override_color_hex: liveTray.color_hex?.trim() || null,
              clear_live_cache_before_next_refresh: false,
            },
          );
        }

        await reloadData();
        setInfo(
          slot.spool_id
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
      reloadData,
      setBusy,
      setError,
      setInfo,
      tauri,
      t,
    ],
  );

  const createLiveBambuCatalogSpool = useCallback(
    async (
      printer: PrinterOverviewRow,
      slot: PrinterAmsSlotRow,
      liveTray: BambuLiveObservedTray,
      master: MasterCatalogRow,
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
      const observedRfid = liveTrayIdentity(liveTray);
      if (!observedRfid) {
        setError(
          t(
            "printers.rfidOverrideNothingToSave",
            "No non-empty RFID identity is available to save for this slot.",
          ),
        );
        return;
      }
      if (slot.spool_id) {
        setError(
          t(
            "printers.error.createFromCatalogRequiresEmptySlot",
            "Clear or swap the current roll through the normal slot flow before creating a new catalog roll here.",
          ),
        );
        return;
      }

      const request = buildInventoryCreateSpoolRequest({
        id: `spool_${Date.now()}`,
        mode: "bambu",
        selectedBambuMaster: master,
        selectedEsunMaster: null,
        initialWeightRaw: String(master.default_weight || 1000),
        ownershipType: "OWNED",
      });
      if (!request.ok || request.kind !== "catalog") {
        setError(t("inventory.error.add", "Failed to add filament."));
        return;
      }

      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        const createdSpoolId = await createInventorySpoolFromMaster(request.input, {
          clientReadOnly,
          clientHostBaseUrl,
          clientLibraryId,
        });
        await updateInventorySpoolRfidTag(
          {
            spool_id: createdSpoolId,
            rfid_tag: observedRfid,
            rfid_observed_at:
              liveTray.last_identity_seen_at ??
              bambuLiveIntegrations[printer.printer.id]?.observed_state?.last_seen_at ??
              new Date().toISOString(),
          },
          {
            clientReadOnly,
            clientHostBaseUrl,
            clientLibraryId,
          },
        );
        await writePrinterSlotAssignment(
          {
            clientReadOnly,
            clientHostBaseUrl,
            clientLibraryId,
          },
          {
            printer_id: printer.printer.id,
            slot_id: slot.slot_id,
            spool_id: createdSpoolId,
            rfid_override_tray_uuid: observedRfid,
            rfid_override_color_hex: liveTray.color_hex?.trim() || null,
            clear_live_cache_before_next_refresh: false,
          },
        );
        await reloadData();
        setInfo(
          t(
            "printers.liveCatalogCreatedAndAssigned",
            "{label} was added, RFID was saved, and the roll was assigned to this slot.",
          ).replace("{label}", request.addedLabel),
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
      reloadData,
      setBusy,
      setError,
      setInfo,
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
    confirmIncomingWeightDialog,
    findAllowedSpoolForSlot,
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
    openWeightPromptForDraft,
    outgoingWeightValue,
    resetPrinterInteractionState,
    rfidOverridePrompt,
    setIncomingWeightValue,
    setOpenDropdownSlotId,
    setOutgoingWeightValue,
    setRfidOverridePrompt,
    setSlotDraft,
  };
}
