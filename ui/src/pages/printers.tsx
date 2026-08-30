import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isTauri,
  signalDesktopVisualQaReadiness,
  type SpoolWithMasterRow,
} from "../lib/tauri_client";
import { FeedbackBanner } from "../components/feedback_banner";
import { AddPrinterModal } from "../components/add_printer_modal";
import { IncomingWeightModal } from "../components/incoming_weight_modal";
import { PageDataFallbackBanner } from "../components/page_data_fallback_banner";
import { PageHeaderButton } from "../components/page_header_button";
import { PageLoadErrorBanner } from "../components/page_load_error_banner";
import { PrinterOverviewCard } from "../components/printer_overview_card";
import { RfidOverrideModal } from "../components/rfid_override_modal";
import { SlotCatalogOnboardingModal } from "../components/slot_catalog_onboarding_modal";
import { useI18n } from "../lib/i18n";
import { formatDateTime } from "../lib/printer_live_display";
import { resolveDesktopVisualQaScenario } from "../lib/desktop_visual_qa_scenario";
import {
  DESKTOP_VISUAL_QA_ADD_PRINTER_READINESS_TOKEN,
  DESKTOP_VISUAL_QA_PRINTER_AMS_WEIGHT_ESTIMATE_READINESS_TOKEN,
  DESKTOP_VISUAL_QA_PRINTER_LIVE_READINESS_TOKEN,
  hasFreshPrinterLiveTelemetry,
} from "../lib/desktop_visual_qa_readiness";
import { findPrinterSlotById } from "../lib/printer_slot_model";
import { derivePrinterSlotDisplayState } from "../lib/printer_slot_display";
import { shouldShowClientSnapshotWarning } from "../lib/page_refresh_state";
import { useResolvedTheme } from "../lib/theme_mode";
import { useClientWriteGuards } from "../lib/use_client_write_guards";
import { listSupportedPrinterModels } from "../lib/printer_profiles";
import { usePrinterPageData } from "./use_printer_page_data";
import { useLibrarySyncState } from "./use_library_sync_state";
import { useAddPrinterWorkflow } from "./use_add_printer_workflow";
import { usePrinterSlotInteractions } from "./use_printer_slot_interactions";

function isNonBambuSpool(row: SpoolWithMasterRow | null | undefined): boolean {
  return !row?.master.vendor.toLowerCase().includes("bambu");
}

function isColorfulNonBambuSpool(
  row: SpoolWithMasterRow | null | undefined,
): boolean {
  return (
    isNonBambuSpool(row) &&
    !/\b(black|white|gray|grey|silver|transparent|clear|natural)\b/i.test(
      row?.master.color_name ?? "",
    )
  );
}

export default function PrintersPage() {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const desktopVisualQaScenario = useMemo(
    () => resolveDesktopVisualQaScenario(),
    [],
  );
  const [desktopVisualQaPrinterObservedAfterMs] = useState(() => Date.now());
  const desktopVisualQaReadinessSignaledRef = useRef(false);
  const desktopVisualQaNeedsPrinterAction =
    desktopVisualQaScenario === "add-printer" ||
    desktopVisualQaScenario === "printer-slot-assignment" ||
    desktopVisualQaScenario === "printer-slot-onboarding" ||
    desktopVisualQaScenario === "printer-rfid-override" ||
    desktopVisualQaScenario === "printer-ams-weight-estimate" ||
    desktopVisualQaScenario === "printer-slot-replacement" ||
    desktopVisualQaScenario === "printer-slot-clear";
  const [desktopVisualQaApplied, setDesktopVisualQaApplied] = useState(
    () => !desktopVisualQaNeedsPrinterAction,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const resetPrinterInteractionStateRef = useRef<() => void>(() => {});
  const handleInteractiveReload = useCallback(
    () => resetPrinterInteractionStateRef.current(),
    [],
  );
  const {
    clientReadOnly,
    clientHostWritePaired,
    clientHostDeviceName,
    clientHostBaseUrl,
    clientLibraryId,
    clientTargetGeneration,
    librarySyncError,
    librarySyncReady,
    librarySyncResolving,
    retryLibrarySyncRole,
  } = useLibrarySyncState(tauri);
  const supportedPrinterModels = useMemo(
    () => listSupportedPrinterModels(),
    [],
  );

  const {
    loading,
    loadError,
    printers,
    spools,
    bambuLiveIntegrations,
    catalogMasters,
    clientPrinterSource,
    clientPrinterUpdatedAt,
    printerModels,
    refreshing,
    reloadData,
  } = usePrinterPageData({
    tauri,
    librarySyncReady,
    clientReadOnly,
    clientHostBaseUrl,
    clientLibraryId,
    clientTargetGeneration,
    supportedPrinterModels,
    loadErrorMessage: t(
      "printers.error.load",
      "Failed to load printer overview.",
    ),
    onInteractiveReload: handleInteractiveReload,
  });
  const clientHostWarningVisible = shouldShowClientSnapshotWarning({
    clientReadOnly,
    initialLoadSettled: librarySyncReady && !loading,
    source: clientPrinterSource,
  });
  const desktopVisualQaHasFreshPrinterTelemetry = useMemo(
    () =>
      desktopVisualQaScenario === "printer-board" &&
      hasFreshPrinterLiveTelemetry(
        bambuLiveIntegrations,
        desktopVisualQaPrinterObservedAfterMs,
        t,
      ),
    [
      bambuLiveIntegrations,
      desktopVisualQaPrinterObservedAfterMs,
      desktopVisualQaScenario,
      t,
    ],
  );

  useEffect(() => {
    if (
      !tauri ||
      loading ||
      !desktopVisualQaHasFreshPrinterTelemetry ||
      desktopVisualQaReadinessSignaledRef.current
    ) {
      return;
    }
    desktopVisualQaReadinessSignaledRef.current = true;
    void signalDesktopVisualQaReadiness(
      DESKTOP_VISUAL_QA_PRINTER_LIVE_READINESS_TOKEN,
    ).catch((signalError) => {
      desktopVisualQaReadinessSignaledRef.current = false;
      console.error(
        "Failed to signal desktop visual QA readiness.",
        signalError,
      );
    });
  }, [desktopVisualQaHasFreshPrinterTelemetry, loading, tauri]);

  const { canUseClientHostWrite, ensureLocalWriteAllowed } =
    useClientWriteGuards({
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

  const {
    showAddPrinterModal,
    newPrinterModel,
    newPrinterName,
    newAmsUnits,
    newSlotsPerUnit,
    selectedModelProfile,
    newPrinterCapacity,
    newBambuLiveEnabled,
    newBambuLiveHost,
    newBambuLiveAccessCode,
    newBambuLivePrinterSerial,
    newBambuLiveTlsCertificateFingerprint,
    newBambuLiveTlsSpkiFingerprint,
    newBambuLiveTlsTrustAction,
    setNewPrinterName,
    setNewAmsUnits,
    setNewSlotsPerUnit,
    setNewBambuLiveEnabled,
    changeBambuLiveHost,
    setNewBambuLiveAccessCode,
    changeBambuLivePrinterSerial,
    setNewBambuLiveTlsTrustAction,
    selectPrinterModel,
    closeAddPrinterModal,
    openAddPrinterModal,
    openAddPrinterModalForVisualQa,
    handleAddPrinter,
    handleInspectBambuLiveIdentity,
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

  const {
    acceptIncomingAmsWeightEstimate,
    allowedSpoolsForSlot,
    cancelIncomingWeightDialog,
    confirmIncomingWeightDialog,
    findAllowedSpoolForSlot,
    findLiveTrayForSlot,
    findSpoolById,
    getSlotDraft,
    handleSaveOverrideRfid,
    handleCreateLiveBambuCatalogSpool,
    incomingWeightPrompt,
    incomingWeightValue,
    liveAmsWeightAvailable,
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
    setSlotCatalogOnboardingPrompt,
    setSlotCatalogOwnershipType,
    setSlotDraft,
    slotCatalogOnboardingPrompt,
    updateSlotCatalogOnboardingPrompt,
  } = usePrinterSlotInteractions({
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
  });
  useEffect(() => {
    resetPrinterInteractionStateRef.current = resetPrinterInteractionState;
  }, [resetPrinterInteractionState]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "add-printer" ||
      desktopVisualQaApplied ||
      loading ||
      !tauri
    ) {
      return;
    }
    openAddPrinterModalForVisualQa({ showBambuLiveStep: true });
    setDesktopVisualQaApplied(true);
  }, [
    desktopVisualQaApplied,
    desktopVisualQaScenario,
    loading,
    openAddPrinterModalForVisualQa,
    tauri,
  ]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "add-printer" ||
      loading ||
      !tauri ||
      !desktopVisualQaApplied ||
      !showAddPrinterModal ||
      !newBambuLiveEnabled ||
      desktopVisualQaReadinessSignaledRef.current
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (
        !document.querySelector('[data-testid="add-printer-bambu-live-step"]')
      ) {
        return;
      }
      desktopVisualQaReadinessSignaledRef.current = true;
      void signalDesktopVisualQaReadiness(
        DESKTOP_VISUAL_QA_ADD_PRINTER_READINESS_TOKEN,
      ).catch((signalError) => {
        desktopVisualQaReadinessSignaledRef.current = false;
        console.error(
          "Failed to signal desktop add-printer readiness.",
          signalError,
        );
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    desktopVisualQaApplied,
    desktopVisualQaScenario,
    loading,
    newBambuLiveEnabled,
    showAddPrinterModal,
    tauri,
  ]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "printer-slot-assignment" ||
      desktopVisualQaApplied ||
      loading ||
      !tauri
    ) {
      return;
    }
    for (const printer of printers) {
      const slot = printer.slots.find(
        (candidate) => allowedSpoolsForSlot(candidate.spool_id).length > 0,
      );
      if (slot) {
        setOpenDropdownSlotId(slot.slot_id);
        setDesktopVisualQaApplied(true);
        return;
      }
    }
  }, [
    allowedSpoolsForSlot,
    desktopVisualQaApplied,
    desktopVisualQaScenario,
    loading,
    printers,
    setOpenDropdownSlotId,
    tauri,
  ]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "printer-slot-onboarding" ||
      desktopVisualQaApplied ||
      loading ||
      !tauri
    ) {
      return;
    }
    for (const printer of printers) {
      for (const slot of printer.slots) {
        const { liveConfig, tray } = findLiveTrayForSlot(
          printer.printer.id,
          slot,
        );
        const displayState = derivePrinterSlotDisplayState({
          slot,
          liveConfig,
          liveTray: tray,
          spoolRows: spools,
          catalogRows: catalogMasters,
          selectedTargetSpool: null,
          clientReadOnly,
          clientPrinterSource,
          locale,
          t,
          findSpoolById,
        });
        if (
          !displayState.effectiveLiveTray ||
          (displayState.liveCatalogMatch.kind !== "catalog_single" &&
            displayState.liveCatalogMatch.kind !== "catalog_multiple")
        ) {
          continue;
        }
        const [master] = displayState.liveCatalogMatch.candidates;
        if (
          master &&
          createLiveBambuCatalogSpool(
            printer,
            slot,
            displayState.effectiveLiveTray,
            master,
          )
        ) {
          setDesktopVisualQaApplied(true);
          return;
        }
      }
    }
  }, [
    catalogMasters,
    clientPrinterSource,
    clientReadOnly,
    createLiveBambuCatalogSpool,
    desktopVisualQaApplied,
    desktopVisualQaScenario,
    findLiveTrayForSlot,
    findSpoolById,
    loading,
    locale,
    printers,
    spools,
    t,
    tauri,
  ]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "printer-rfid-override" ||
      desktopVisualQaApplied ||
      loading ||
      !tauri
    ) {
      return;
    }
    for (const printer of printers) {
      for (const slot of printer.slots) {
        const { liveConfig, tray } = findLiveTrayForSlot(
          printer.printer.id,
          slot,
        );
        const displayState = derivePrinterSlotDisplayState({
          slot,
          liveConfig,
          liveTray: tray,
          spoolRows: spools,
          catalogRows: catalogMasters,
          selectedTargetSpool: null,
          clientReadOnly,
          clientPrinterSource,
          locale,
          t,
          findSpoolById,
        });
        if (displayState.rfidOverridden && displayState.effectiveLiveTray) {
          openRfidOverrideDialog(printer, slot, displayState.effectiveLiveTray);
          setDesktopVisualQaApplied(true);
          return;
        }
      }
    }
  }, [
    catalogMasters,
    clientPrinterSource,
    clientReadOnly,
    desktopVisualQaApplied,
    desktopVisualQaScenario,
    findLiveTrayForSlot,
    findSpoolById,
    loading,
    locale,
    openRfidOverrideDialog,
    printers,
    spools,
    t,
    tauri,
  ]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "printer-ams-weight-estimate" ||
      desktopVisualQaApplied ||
      loading ||
      !tauri
    ) {
      return;
    }
    for (const printer of printers) {
      for (const slot of printer.slots) {
        const row = findSpoolById(slot.spool_id);
        const { tray } = findLiveTrayForSlot(printer.printer.id, slot);
        if (
          !row ||
          !tray?.loaded ||
          tray.match_status !== "clear_match" ||
          tray.matched_inventory_mode !== "exact_rfid" ||
          tray.matched_inventory_spool_id !== row.spool.id
        ) {
          continue;
        }
        openIncomingWeightDialog(printer.printer.id, slot, row);
        setDesktopVisualQaApplied(true);
        return;
      }
    }
  }, [
    desktopVisualQaApplied,
    desktopVisualQaScenario,
    findLiveTrayForSlot,
    findSpoolById,
    loading,
    openIncomingWeightDialog,
    printers,
    tauri,
  ]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "printer-ams-weight-estimate" ||
      loading ||
      !tauri ||
      !desktopVisualQaApplied ||
      !incomingWeightPrompt?.amsWeightEstimate ||
      desktopVisualQaReadinessSignaledRef.current
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (
        !document.querySelector(
          '[data-testid="printer-ams-weight-estimate"]',
        )
      ) {
        return;
      }
      desktopVisualQaReadinessSignaledRef.current = true;
      void signalDesktopVisualQaReadiness(
        DESKTOP_VISUAL_QA_PRINTER_AMS_WEIGHT_ESTIMATE_READINESS_TOKEN,
      ).catch((signalError) => {
        desktopVisualQaReadinessSignaledRef.current = false;
        console.error(
          "Failed to signal desktop AMS weight estimate readiness.",
          signalError,
        );
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    desktopVisualQaApplied,
    desktopVisualQaScenario,
    incomingWeightPrompt,
    loading,
    tauri,
  ]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "printer-slot-replacement" ||
      desktopVisualQaApplied ||
      loading ||
      !tauri
    ) {
      return;
    }
    for (const printer of printers) {
      for (const slot of printer.slots) {
        if (!slot.spool_id) {
          continue;
        }
        const replacements = allowedSpoolsForSlot(slot.spool_id).filter(
          (row) => row.spool.id !== slot.spool_id,
        );
        const replacement =
          replacements.find(isColorfulNonBambuSpool) ??
          replacements.find(isNonBambuSpool) ??
          replacements[0] ??
          null;
        if (replacement) {
          openIncomingWeightDialog(printer.printer.id, slot, replacement);
          setDesktopVisualQaApplied(true);
          return;
        }
      }
    }
  }, [
    allowedSpoolsForSlot,
    desktopVisualQaApplied,
    desktopVisualQaScenario,
    loading,
    openIncomingWeightDialog,
    printers,
    tauri,
  ]);

  useEffect(() => {
    if (
      desktopVisualQaScenario !== "printer-slot-clear" ||
      desktopVisualQaApplied ||
      loading ||
      !tauri
    ) {
      return;
    }
    for (const printer of printers) {
      const slotsWithSpools = printer.slots.filter(
        (candidate) => candidate.spool_id,
      );
      const slot =
        slotsWithSpools.find((candidate) =>
          isColorfulNonBambuSpool(findSpoolById(candidate.spool_id)),
        ) ??
        slotsWithSpools.find((candidate) =>
          isNonBambuSpool(findSpoolById(candidate.spool_id)),
        ) ??
        slotsWithSpools[0] ??
        null;
      if (slot) {
        openEmptySlotWeightDialog(printer.printer.id, slot);
        setDesktopVisualQaApplied(true);
        return;
      }
    }
  }, [
    desktopVisualQaApplied,
    desktopVisualQaScenario,
    findSpoolById,
    loading,
    openEmptySlotWeightDialog,
    printers,
    tauri,
  ]);

  return (
    <div className="page-shell">
      <div className="page-header min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between min-[900px]:gap-8">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.printers", "Printers")}</h1>
          <div className="page-subtitle max-w-2xl">
            {t(
              "printers.subtitle",
              "Track printer slot placement and printer-linked material consumption.",
            )}
          </div>
        </div>
        <div className="page-header-actions min-[900px]:w-auto min-[900px]:max-w-none min-[900px]:items-end">
          <div className="page-header-tools min-[900px]:w-auto min-[900px]:flex-nowrap">
            <PageHeaderButton
              variant="primary"
              responsive={false}
              onClick={openAddPrinterModal}
              disabled={
                !tauri ||
                !librarySyncReady ||
                busy ||
                (clientReadOnly ? !clientHostWritePaired : false)
              }
            >
              {t("settings.addPrinter", "Add printer")}
            </PageHeaderButton>
          </div>
        </div>
      </div>

      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t(
            "printers.desktopOnly",
            "Printer overview is available in the desktop app build.",
          )}
        </FeedbackBanner>
      ) : null}
      {error ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}
      {librarySyncError ? (
        <PageLoadErrorBanner
          message={t(
            "errors.libraryRoleLoadFailed",
            "Could not determine this device's library role. No local data or changes are available until the role is loaded.",
          )}
          onRetry={retryLibrarySyncRole}
          retryDisabled={!tauri || busy}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={librarySyncResolving}
        />
      ) : loadError ? (
        <PageLoadErrorBanner
          message={loadError}
          onRetry={() => void reloadData()}
          retryDisabled={!tauri || busy || loading}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={refreshing}
        />
      ) : null}
      {info ? (
        <FeedbackBanner tone="success" className="mt-4">
          {info}
        </FeedbackBanner>
      ) : null}

      {clientHostWarningVisible && !librarySyncError && !loadError ? (
        <PageDataFallbackBanner
          message={`${clientHostDeviceName ? `${clientHostDeviceName}. ` : ""}${
            clientPrinterSource === "CACHED"
              ? t(
                  "printers.clientReadOnlyCached",
                  "Host unavailable. Showing the last cached printer snapshot.",
                )
              : t(
                  "printers.clientReadOnlyOffline",
                  "Host unavailable and no cached printer snapshot is available yet.",
                )
          }${
            clientPrinterUpdatedAt
              ? ` ${t("printers.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientPrinterUpdatedAt, locale)}.`
              : ""
          }`}
          onRetry={() => void reloadData()}
          retryDisabled={!tauri || busy || loading}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={refreshing}
        />
      ) : null}

      {loading && !librarySyncError ? (
        <div className="surface-subtle mt-6 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
          {t("common.loadingPrinters", "Loading printers...")}
        </div>
      ) : null}

      {!loading && printers.length === 0 ? (
        <div className="surface-subtle mt-6 border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
          {t(
            "printers.noPrinters",
            "No printers configured yet. Use Add printer to create one.",
          )}
        </div>
      ) : null}

      <div className="content-section space-y-4">
        {printers.map((printer) => (
          <PrinterOverviewCard
            key={printer.printer.id}
            printer={printer}
            defaultSlotsExpanded={printers.length === 1}
            busy={busy}
            tauri={tauri}
            clientReadOnly={clientReadOnly}
            clientPrinterSource={clientPrinterSource}
            resolvedTheme={resolvedTheme}
            bambuLiveIntegrations={bambuLiveIntegrations}
            catalogMasters={catalogMasters}
            openDropdownSlotId={openDropdownSlotId}
            setOpenDropdownSlotId={setOpenDropdownSlotId}
            spools={spools}
            allowedSpoolsForSlot={allowedSpoolsForSlot}
            findAllowedSpoolForSlot={findAllowedSpoolForSlot}
            getSlotDraft={getSlotDraft}
            setSlotDraft={setSlotDraft}
            findSpoolById={findSpoolById}
            openIncomingWeightDialog={openIncomingWeightDialog}
            openEmptySlotWeightDialog={openEmptySlotWeightDialog}
            openRfidOverrideDialog={openRfidOverrideDialog}
            registerLiveRfidCandidate={registerLiveRfidCandidate}
            createLiveBambuCatalogSpool={createLiveBambuCatalogSpool}
            openWeightPromptForDraft={openWeightPromptForDraft}
          />
        ))}
      </div>

      {incomingWeightPrompt ? (
        <IncomingWeightModal
          amsEstimateAvailable={liveAmsWeightAvailable}
          busy={busy}
          prompt={incomingWeightPrompt}
          incomingWeightValue={incomingWeightValue}
          outgoingWeightValue={outgoingWeightValue}
          onIncomingWeightChange={setIncomingWeightValue}
          onOutgoingWeightChange={setOutgoingWeightValue}
          onCancel={cancelIncomingWeightDialog}
          onAcceptAmsEstimate={() => void acceptIncomingAmsWeightEstimate()}
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

      {slotCatalogOnboardingPrompt ? (
        <SlotCatalogOnboardingModal
          busy={busy}
          currentSlot={findPrinterSlotById(
            printers,
            slotCatalogOnboardingPrompt.printerId,
            slotCatalogOnboardingPrompt.slot.slot_id,
          )}
          currentLiveTray={
            findLiveTrayForSlot(
              slotCatalogOnboardingPrompt.printerId,
              slotCatalogOnboardingPrompt.slot,
            ).tray
          }
          locale={locale}
          prompt={slotCatalogOnboardingPrompt}
          onClose={() => setSlotCatalogOnboardingPrompt(null)}
          onBorrowedFromContactChange={(value) =>
            updateSlotCatalogOnboardingPrompt({ borrowedFromContact: value })
          }
          onBorrowedFromNameChange={(value) =>
            updateSlotCatalogOnboardingPrompt({ borrowedFromName: value })
          }
          onBorrowedInNoteChange={(value) =>
            updateSlotCatalogOnboardingPrompt({ borrowedInNote: value })
          }
          onInitialWeightChange={(value) =>
            updateSlotCatalogOnboardingPrompt({ initialWeight: value })
          }
          onLocationChange={(value) =>
            updateSlotCatalogOnboardingPrompt({ location: value })
          }
          onOwnershipTypeChange={setSlotCatalogOwnershipType}
          onSave={() => void handleCreateLiveBambuCatalogSpool()}
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
          bambuLiveAvailable={
            selectedModelProfile.systemKind === "AMS" && !clientReadOnly
          }
          newBambuLiveEnabled={newBambuLiveEnabled}
          newBambuLiveHost={newBambuLiveHost}
          newBambuLiveAccessCode={newBambuLiveAccessCode}
          newBambuLivePrinterSerial={newBambuLivePrinterSerial}
          newBambuLiveTlsCertificateFingerprint={
            newBambuLiveTlsCertificateFingerprint
          }
          newBambuLiveTlsSpkiFingerprint={newBambuLiveTlsSpkiFingerprint}
          newBambuLiveTlsTrustAction={newBambuLiveTlsTrustAction}
          initialStep={
            desktopVisualQaScenario === "add-printer" ? "LIVE" : "PRINTER"
          }
          onClose={closeAddPrinterModal}
          onSelectPrinterModel={selectPrinterModel}
          onPrinterNameChange={setNewPrinterName}
          onAmsUnitsChange={setNewAmsUnits}
          onSlotsPerUnitChange={setNewSlotsPerUnit}
          onBambuLiveEnabledChange={setNewBambuLiveEnabled}
          onBambuLiveHostChange={changeBambuLiveHost}
          onBambuLiveAccessCodeChange={setNewBambuLiveAccessCode}
          onBambuLivePrinterSerialChange={changeBambuLivePrinterSerial}
          onBambuLiveIdentityCheck={() => void handleInspectBambuLiveIdentity()}
          onBambuLiveTlsTrustActionChange={setNewBambuLiveTlsTrustAction}
          onAddPrinter={() => void handleAddPrinter()}
        />
      ) : null}
    </div>
  );
}
