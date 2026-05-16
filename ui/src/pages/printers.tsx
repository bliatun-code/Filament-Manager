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
import { derivePrinterSlotDisplayState } from "../lib/printer_slot_display";
import {
  buildEmptySlotWeightPrompt,
  buildIncomingWeightPrompt,
  buildRfidOverridePrompt,
  buildSlotSwapDraft,
  filterSlotOptionsBySearch,
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
  buildPrinterPageSummary,
  buildSpoolsById,
  resolveSpoolTareWeightById as resolveSpoolTareWeightFromMap,
} from "../lib/printer_page_model";
import { AppModal } from "../components/app_modal";
import { FeedbackBanner } from "../components/feedback_banner";
import { ModalHeader } from "../components/modal_chrome";
import { modalPanelClassName } from "../components/modal_panel_class";
import { PrinterModelPreview } from "../components/printer_model_preview";
import { AddPrinterModal } from "../components/add_printer_modal";
import { IncomingWeightModal } from "../components/incoming_weight_modal";
import { semanticChipClass } from "../lib/chip_styles";
import {
  formatFilamentDisplayTitle,
  formatPlacementLabel,
  formatSpoolReference,
} from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import {
  commandErrorText,
  findLiveTrayForSlot as resolveLiveTrayForSlot,
  formatDateTime,
  formatGrams,
  printerSwatchActionButtonStyle,
  printerSwatchInteractiveInsetStyle,
  printerSwatchSurfaceStyle,
  resolveLiveConnectionIndicator as buildLiveConnectionIndicator,
  toSwatchColor,
} from "../lib/printer_live_display";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import { sortSpoolsAlphabetically } from "../lib/spool_sort";
import { useResolvedTheme } from "../lib/theme_mode";
import {
  describePrinterCapability,
  describeConfiguredPrinterSetup,
  formatPrinterSlotLabelForModel,
  hasConfiguredMultiMaterial,
  listSupportedPrinterModels,
} from "../lib/printer_profiles";
import { usePrinterPageData } from "./use_printer_page_data";
import { usePrinterLibrarySyncState } from "./use_printer_library_sync_state";
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
  } = usePrinterLibrarySyncState(tauri);
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

  const ensureLocalWriteAllowed = useCallback(() => {
    if (!clientReadOnly) {
      return true;
    }
    setInfo(
      t(
        "printers.clientReadOnlyAction",
        "This device is connected as a client. Use the host for printer changes.",
      ),
    );
    return false;
  }, [clientReadOnly, t]);

  const canUseClientHostWrite = useCallback(() => {
    if (!clientReadOnly) {
      return false;
    }
    if (!clientHostBaseUrl || !clientLibraryId) {
      setError(
        t(
          "printers.clientHostUnavailable",
          "Host connection details are missing for this client device.",
        ),
      );
      return false;
    }
    if (!clientHostWritePaired) {
      setError(
        t(
          "printers.clientWriteRequiresPairing",
          "Pair this desktop client with the host before running protected printer actions.",
        ),
      );
      return false;
    }
    return true;
  }, [clientHostBaseUrl, clientHostWritePaired, clientLibraryId, clientReadOnly, t]);

  const spoolsById = useMemo(() => buildSpoolsById(spools), [spools]);

  const resolveSpoolTareWeightById = useCallback(
    (spoolId: string | null | undefined) =>
      resolveSpoolTareWeightFromMap(spoolsById, spoolId),
    [spoolsById],
  );

  const printerPageSummary = useMemo(() => buildPrinterPageSummary(printers), [printers]);

  const sortedSpools = useMemo(() => sortSpoolsAlphabetically(spools, locale), [locale, spools]);

  const allowedSpoolOptionsBySlotSpoolId = useMemo(
    () => buildAllowedSpoolOptionsBySlotSpoolId(printers, sortedSpools),
    [printers, sortedSpools],
  );

  const allowedSpoolOptionMapsBySlotSpoolId = useMemo(
    () => buildAllowedSpoolOptionMapsBySlotSpoolId(allowedSpoolOptionsBySlotSpoolId),
    [allowedSpoolOptionsBySlotSpoolId],
  );

  const resolveLiveConnectionIndicator = useCallback(
    (
      liveConfig: BambuLiveIntegrationEntry["config"] | null,
      slots: PrinterOverviewRow["slots"],
    ) => buildLiveConnectionIndicator(liveConfig, slots, t),
    [t],
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
            <div className="page-header-filter-surface grid min-w-[17rem] grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200/85 bg-white/85 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:shadow-none">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {t("printers.configuredPrinters", "Configured printers")}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
                  {printerPageSummary.printerCount}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/85 bg-white/85 px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:shadow-none">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {t("printers.loadedSlots", "Loaded slots")}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
                  {printerPageSummary.loadedSlots}
                  <span className="ml-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                    / {printerPageSummary.totalSlots}
                  </span>
                </div>
              </div>
            </div>
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

      <div className="mt-6 space-y-5">
        {printers.map((printer) => {
          const hasMultiMaterial = hasConfiguredMultiMaterial(printer.slots);
          const hasOpenDropdown = printer.slots.some(
            (slot) => slot.slot_id === openDropdownSlotId,
          );
          const configuredSetup = describeConfiguredPrinterSetup(
            t,
            printer.printer.model,
            printer.slots,
          );
          const printerLiveConfig = bambuLiveIntegrations[printer.printer.id] ?? null;
          const liveConnectionIndicator = resolveLiveConnectionIndicator(
            printerLiveConfig,
            printer.slots,
          );
          const printerCardStyle = printerBrandSurfaceStyle(
            printer.printer.model,
            "card",
            resolvedTheme,
          );
          const printerMetricStyle = printerBrandSurfaceStyle(
            printer.printer.model,
            "compact",
            resolvedTheme,
          );
          const slotInnerShadow =
            resolvedTheme === "dark"
              ? "inset 0 1px 0 rgba(255, 255, 255, 0.04)"
              : "inset 0 1px 0 rgba(255, 255, 255, 0.45)";
          const usageMetrics = [
            {
              key: "jobs",
              label: t("printers.jobs", "Jobs"),
              value: String(printer.usage.total_jobs),
              valueClassName: "text-slate-900 dark:text-slate-50",
            },
            {
              key: "success",
              label: t("printers.success", "Success"),
              value: String(printer.usage.successful_jobs),
              valueClassName: "text-emerald-700 dark:text-emerald-200",
            },
            {
              key: "failed",
              label: t("printers.failed", "Failed"),
              value: String(printer.usage.failed_jobs),
              valueClassName: "text-rose-700 dark:text-rose-200",
            },
            {
              key: "used",
              label: t("printers.used", "Used"),
              value: `${printer.usage.total_used_g} g`,
              valueClassName: "text-amber-700 dark:text-amber-200",
            },
          ];
          return (
            <section
              key={printer.printer.id}
              className={`surface-card relative ${hasOpenDropdown ? "z-40" : "z-0"}`}
              style={printerCardStyle}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <PrinterModelPreview
                    model={printer.printer.model}
                    hasMultiMaterial={hasMultiMaterial}
                  />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                        {printer.printer.name}
                      </div>
                      {liveConnectionIndicator ? (
                        <span
                          className={semanticChipClass(
                            liveConnectionIndicator.tone,
                            "px-2 py-0.5 text-[10px]",
                          )}
                        >
                          {liveConnectionIndicator.label}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {printer.printer.model} ·{" "}
                      {describePrinterCapability(
                        t,
                        printer.printer.model,
                        hasMultiMaterial,
                      )}{" "}
                      · {configuredSetup}
                    </div>
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[20rem] min-[1080px]:grid-cols-4">
                  {usageMetrics.map((metric) => (
                    <div
                      key={metric.key}
                      className="rounded-xl border px-2.5 py-2 shadow-sm dark:shadow-none"
                      style={printerMetricStyle}
                    >
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        {metric.label}
                      </div>
                      <div className={`mt-0.5 text-base font-semibold ${metric.valueClassName}`}>
                        {metric.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {printer.slots.map((slot) => {
                const { liveConfig, tray: liveTray } = findLiveTrayForSlot(printer.printer.id, slot);
                const slotOptions = allowedSpoolsForSlot(slot.spool_id);
                const draft = getSlotDraft(slot);
                const isDropdownOpen = openDropdownSlotId === slot.slot_id;
                const filteredSlotOptions = isDropdownOpen
                  ? filterSlotOptionsBySearch(slotOptions, draft.search)
                  : [];
                const selectedTargetSpool =
                  draft.targetSpoolId.length > 0
                    ? findAllowedSpoolForSlot(slot.spool_id, draft.targetSpoolId)
                    : null;
                const slotDisplay = derivePrinterSlotDisplayState({
                  slot,
                  liveConfig,
                  liveTray,
                  selectedTargetSpool,
                  clientReadOnly,
                  clientPrinterSource,
                  locale,
                  t,
                  findSpoolById,
                });
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
                } = slotDisplay;
                const slotSelectorStyle = slotSwatchHex
                  ? {
                      ...printerSwatchInteractiveInsetStyle(
                        slotSwatchHex,
                        resolvedTheme,
                        selectedTargetSpool ? "selected" : "default",
                      ),
                      borderColor: "transparent",
                      boxShadow: slotInnerShadow,
                    }
                  : undefined;
                const slotCurrentRollStyle = slot.spool_id
                  ? {
                      ...printerSwatchInteractiveInsetStyle(
                        slotSwatchHex,
                        resolvedTheme,
                        "selected",
                      ),
                      borderColor: "transparent",
                      boxShadow: slotInnerShadow,
                    }
                  : undefined;
                const slotActionStyle = slotSwatchHex
                  ? printerSwatchActionButtonStyle(slotSwatchHex, resolvedTheme)
                  : undefined;
                const slotPanelStyle = slotSwatchHex
                  ? printerSwatchSurfaceStyle(slotSwatchHex, "panel", resolvedTheme)
                  : undefined;
                return (
                  <div
                    key={slot.slot_id}
                    className={`surface-subtle relative flex h-full flex-col p-2.5 ${
                      isDropdownOpen ? "z-50" : "z-0"
                    }`}
                    style={slotPanelStyle}
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {formatPrinterSlotLabelForModel(t, printer.printer.model, {
                        ams_id: slot.ams_id,
                        slot_index: slot.slot_index,
                      })}
                    </div>

                    <div
                      className="relative mt-2"
                      data-slot-dropdown={slot.slot_id}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/70 px-2.5 py-2 text-left text-sm text-slate-800 disabled:opacity-50 dark:bg-slate-900/55 dark:text-slate-100"
                        onClick={() =>
                          setOpenDropdownSlotId((current) =>
                            current === slot.slot_id ? null : slot.slot_id,
                          )
                        }
                        disabled={!tauri || busy}
                        style={slotSelectorStyle}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-4.5 w-4.5 shrink-0 rounded border border-slate-500/20 shadow-inner shadow-black/10 dark:border-white/10 dark:shadow-black/20"
                            style={{
                              backgroundColor: toSwatchColor(slotSwatchHex),
                            }}
                          />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">
                                {selectedTargetSpool
                                  ? formatFilamentDisplayTitle(
                                      selectedTargetSpool.master.material,
                                      selectedTargetSpool.master.filament_name,
                                      selectedTargetSpool.master.color_name,
                                    )
                                  : t("printers.emptySlot", "Empty slot")}
                              </span>
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                                {selectedTargetSpool
                                  ? `${selectedTargetSpool.master.vendor} · ${formatSpoolReference(selectedTargetSpool.spool.id)} · ${formatGrams(selectedTargetSpool.spool.remaining_g)}`
                                : t("printers.targetEmpty", "Target: Empty slot")}
                              </span>
                            </span>
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">▾</span>
                      </button>

                      {isDropdownOpen ? (
                        <div
                          className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-300/20 dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/30"
                          style={slotPanelStyle}
                        >
                          <input
                            type="text"
                            value={draft.search}
                            onChange={(event) =>
                              setSlotDraft(slot.slot_id, {
                                ...draft,
                                search: event.target.value,
                              })
                            }
                            placeholder={t("printers.searchRolls", "Search rolls by name/vendor")}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm shadow-slate-200/15 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none"
                            disabled={!tauri || busy}
                          />
                          <div className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2.5 dark:border-slate-600">
                            <button
                              type="button"
                              className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-sm ${
                                draft.targetSpoolId === ""
                                  ? "border border-slate-300 bg-slate-100 font-semibold text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50"
                                  : "border border-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70"
                              }`}
                              onClick={() => {
                                setSlotDraft(slot.slot_id, {
                                  ...draft,
                                  targetSpoolId: "",
                                });
                                setOpenDropdownSlotId(null);
                                if (!slot.spool_id) {
                                  return;
                                }
                                openEmptySlotWeightDialog(printer.printer.id, slot);
                              }}
                              disabled={!tauri || busy}
                              style={
                                draft.targetSpoolId === ""
                                  ? printerSwatchInteractiveInsetStyle(
                                      null,
                                      resolvedTheme,
                                      "selected",
                                    )
                                  : undefined
                              }
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <span
                                  className="h-4.5 w-4.5 shrink-0 rounded border border-slate-200 dark:border-slate-600"
                                  style={{ backgroundColor: "#CBD5E1" }}
                                />
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold">
                                    {t("printers.emptySlot", "Empty slot")}
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-slate-600 dark:text-slate-400">
                                    {t(
                                      "printers.clearSlotOptionHint",
                                      "Remove current roll from this slot",
                                    )}
                                  </span>
                                </span>
                              </span>
                            </button>
                            {filteredSlotOptions.map((row) => {
                              const placementLabel = formatPlacementLabel(t, row.spool.location_id);
                              return (
                                <button
                                  key={row.spool.id}
                                  type="button"
                                  className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-1.5 text-left text-sm ${
                                    draft.targetSpoolId === row.spool.id
                                      ? "border border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50"
                                      : "border border-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70"
                                  }`}
                                  style={printerSwatchInteractiveInsetStyle(
                                    row.master.hex_color,
                                    resolvedTheme,
                                    draft.targetSpoolId === row.spool.id ? "selected" : "default",
                                  )}
                                  onClick={() => {
                                    setSlotDraft(slot.slot_id, {
                                      ...draft,
                                      targetSpoolId: row.spool.id,
                                    });
                                    setOpenDropdownSlotId(null);
                                    openIncomingWeightDialog(printer.printer.id, slot, row);
                                  }}
                                  disabled={!tauri || busy}
                                >
                                  <span className="flex min-w-0 items-center gap-2.5">
                                    <span
                                      className="h-4.5 w-4.5 shrink-0 rounded border border-slate-200 dark:border-slate-600"
                                      style={{
                                        backgroundColor: toSwatchColor(row.master.hex_color),
                                      }}
                                    />
                                    <span className="min-w-0">
                                      <span className="block truncate font-semibold leading-tight">
                                        {formatFilamentDisplayTitle(
                                          row.master.material,
                                          row.master.filament_name,
                                          row.master.color_name,
                                        )}
                                      </span>
                                      <span className="mt-0.5 block truncate text-xs text-slate-600 dark:text-slate-400">
                                        {row.master.vendor} · {formatSpoolReference(row.spool.id)}{" "}
                                        · {formatGrams(row.spool.remaining_g)}
                                      </span>
                                      <span className="mt-px block truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                                        {placementLabel}
                                      </span>
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                            {filteredSlotOptions.length === 0 ? (
                              <div className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">
                                {t("inventory.noMatch", "No spools match current filters.")}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {slot.spool_id ? (
                      <div
                        className="mt-2 rounded-xl px-2.5 py-2 text-xs text-slate-700 dark:text-slate-300"
                        style={slotCurrentRollStyle}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-0.5 h-4.5 w-4.5 shrink-0 rounded border border-slate-500/20 shadow-inner shadow-black/10 dark:border-white/10 dark:shadow-black/20"
                            style={{ backgroundColor: toSwatchColor(slotSwatchHex) }}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                {t("printers.currentRoll", "Current roll")}
                              </span>
                              <span className="text-slate-400 dark:text-slate-500">·</span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {t("inventory.reference", "Reference")}{" "}
                                {formatSpoolReference(slot.spool_id)}
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
                                    effectiveLiveTray &&
                                    openRfidOverrideDialog(printer, slot, effectiveLiveTray)
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
                                {liveObservedAtLabel
                                  ? `${t("printers.lastKnownLive", "Last known live")}: ${liveObservedAtLabel}${liveObservedAge ? ` · ${liveObservedAge}` : ""}`
                                  : t(
                                      "printers.waitingForLiveIdentity",
                                      "Showing the last saved slot assignment until stronger live identity arrives.",
                                    )}
                              </div>
                            ) : null}
                            {unknownLiveRfid ? (
                              <div className="mt-0.5 text-[11px] leading-5 text-amber-700 dark:text-amber-200">
                                {rfidOverridden
                                  ? `${t("printers.rfidOverriddenHint", "This slot is manually assigned while the same unregistered RFID identity is still active.")} ${effectiveLiveTray?.tray_uuid}`
                                  : `${t("printers.unknownLiveRfidHint", "AMS reported a tray identity that is not registered in inventory.")} ${effectiveLiveTray?.tray_uuid}`}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-xl bg-slate-950/[0.03] px-2.5 py-2 text-xs text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
                        <div>{t("printers.noSpoolAssigned", "No spool assigned.")}</div>
                        {liveSignalEnabled && liveObservedAtLabel ? (
                          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {`${t("printers.lastKnownLive", "Last known live")}: ${liveObservedAtLabel}${liveObservedAge ? ` · ${liveObservedAge}` : ""}`}
                          </div>
                        ) : null}
                        {unknownLiveRfid ? (
                          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-200">
                            {`${t("printers.unknownLiveRfidHint", "AMS reported a tray identity that is not registered in inventory.")} ${effectiveLiveTray?.tray_uuid}`}
                          </div>
                        ) : null}
                      </div>
                    )}

                    <button
                      type="button"
                      className={`mt-2 w-full self-end rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 min-[720px]:w-auto ${
                        slotActionStyle
                          ? "shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:shadow-none"
                      }`}
                      style={slotActionStyle}
                      onClick={() => openWeightPromptForDraft(printer.printer, slot, draft)}
                      disabled={!tauri || busy || !draft.targetSpoolId}
                    >
                      {t("printers.updateWeight", "Update weight")}
                    </button>
                  </div>
                );
              })}
              </div>
            </section>
          );
        })}
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
        <AppModal
          closeOnBackdrop
          onBackdropClose={() => {
            if (!busy) {
              setRfidOverridePrompt(null);
            }
          }}
          panelClassName={modalPanelClassName("md", "p-0")}
        >
          <div>
            <ModalHeader
              eyebrow={t("inventory.rfidCaptureTitle", "RFID capture")}
              title={t("printers.rfidOverridden", "RFID overridden")}
              subtitle={`${rfidOverridePrompt.printerName} · ${formatPrinterSlotLabelForModel(t, rfidOverridePrompt.printerModel, {
                ams_id: rfidOverridePrompt.slot.ams_id,
                slot_index: rfidOverridePrompt.slot.slot_index,
              })}`}
              onClose={() => setRfidOverridePrompt(null)}
              closeLabel={t("common.close", "Close")}
              disabled={busy}
              className="px-6 py-5"
            />

            <div className="space-y-4 px-6 py-6">
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100">
                {t(
                  "printers.rfidOverrideDialogHint",
                  "This slot is manually assigned while AMS still reports the same unregistered tray identity. Save it on the selected roll when you are ready.",
                )}
              </div>

              <div className="surface-card space-y-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {formatFilamentDisplayTitle(
                    rfidOverridePrompt.spool.master.material,
                    rfidOverridePrompt.spool.master.filament_name,
                    rfidOverridePrompt.spool.master.color_name,
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {`${rfidOverridePrompt.spool.master.vendor} · ${formatSpoolReference(rfidOverridePrompt.spool.spool.id)}`}
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      {t("inventory.rfidCurrentTag", "Saved RFID")}
                    </dt>
                    <dd className="mt-1 break-all font-mono text-slate-900 dark:text-slate-100">
                      {rfidOverridePrompt.spool.spool.rfid_tag?.trim() || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      {t("inventory.rfidObservedTag", "Observed RFID")}
                    </dt>
                    <dd className="mt-1 break-all font-mono text-slate-900 dark:text-slate-100">
                      {rfidOverridePrompt.liveTray.tray_uuid?.trim() || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      {t("inventory.rfidObservedColor", "Observed color")}
                    </dt>
                    <dd className="mt-1 flex items-center gap-2 text-slate-900 dark:text-slate-100">
                      <span
                        className="h-5 w-5 rounded border border-slate-200 dark:border-slate-700"
                        style={{ backgroundColor: toSwatchColor(rfidOverridePrompt.liveTray.color_hex) }}
                      />
                      <span className="font-mono">
                        {rfidOverridePrompt.liveTray.color_hex?.trim() || "—"}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      {t("inventory.rfidLastSeen", "Last seen")}
                    </dt>
                    <dd className="mt-1 text-slate-900 dark:text-slate-100">
                      {rfidOverridePrompt.observedAt
                        ? formatDateTime(rfidOverridePrompt.observedAt, locale)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-100"
                  onClick={() => setRfidOverridePrompt(null)}
                  disabled={busy}
                >
                  {t("common.cancel", "Cancel")}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-sky-300 bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:border-sky-400/40 dark:bg-sky-500"
                  onClick={() => void handleSaveOverrideRfid()}
                  disabled={!rfidOverridePrompt.liveTray.tray_uuid?.trim() || busy}
                >
                  {t("inventory.saveRfid", "Save RFID")}
                </button>
              </div>
            </div>
          </div>
        </AppModal>
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
