import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "../lib/tauri_client";
import { FeedbackBanner } from "../components/feedback_banner";
import { AddPrinterModal } from "../components/add_printer_modal";
import { IncomingWeightModal } from "../components/incoming_weight_modal";
import { PrinterOverviewCard } from "../components/printer_overview_card";
import { RfidOverrideModal } from "../components/rfid_override_modal";
import { SlotCatalogOnboardingModal } from "../components/slot_catalog_onboarding_modal";
import { useI18n } from "../lib/i18n";
import { formatDateTime } from "../lib/printer_live_display";
import { resolveDesktopVisualQaScenario } from "../lib/desktop_visual_qa_scenario";
import { findPrinterSlotById } from "../lib/printer_slot_model";
import { derivePrinterSlotDisplayState } from "../lib/printer_slot_display";
import { useResolvedTheme } from "../lib/theme_mode";
import { useClientWriteGuards } from "../lib/use_client_write_guards";
import { listSupportedPrinterModels } from "../lib/printer_profiles";
import { usePrinterPageData } from "./use_printer_page_data";
import { useLibrarySyncState } from "./use_library_sync_state";
import { useAddPrinterWorkflow } from "./use_add_printer_workflow";
import { usePrinterSlotInteractions } from "./use_printer_slot_interactions";

export default function PrintersPage() {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const desktopVisualQaScenario = useMemo(() => resolveDesktopVisualQaScenario(), []);
  const desktopVisualQaNeedsPrinterAction =
    desktopVisualQaScenario === "printer-slot-assignment" ||
    desktopVisualQaScenario === "printer-slot-onboarding" ||
    desktopVisualQaScenario === "printer-slot-replacement";
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
    librarySyncReady,
  } = useLibrarySyncState(tauri);
  const supportedPrinterModels = useMemo(() => listSupportedPrinterModels(), []);

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
    catalogMasters,
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
    onInteractiveReload: handleInteractiveReload,
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

  const {
    allowedSpoolsForSlot,
    confirmIncomingWeightDialog,
    findAllowedSpoolForSlot,
    findLiveTrayForSlot,
    findSpoolById,
    getSlotDraft,
    handleSaveOverrideRfid,
    handleCreateLiveBambuCatalogSpool,
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
        const { liveConfig, tray } = findLiveTrayForSlot(printer.printer.id, slot);
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
        if (master) {
          createLiveBambuCatalogSpool(
            printer,
            slot,
            displayState.effectiveLiveTray,
            master,
          );
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
        const replacement = allowedSpoolsForSlot(slot.spool_id).find(
          (row) => row.spool.id !== slot.spool_id,
        );
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
