import { type Dispatch, type SetStateAction } from "react";
import { toErrorMessage } from "../lib/error_text";
import {
  createManagedPrinter,
  deleteManagedPrinter,
  saveManagedBambuLiveIntegration,
  type PrinterWriteTarget,
} from "../lib/printer_writes";
import {
  inspectBambuLiveTlsIdentity,
  type BambuAccessCodeAction,
  type BambuLiveIntegrationEntry,
  type BambuTlsTrustAction,
  type BambuTlsTrustState,
  type PrinterOverviewRow,
  type PrinterRow,
} from "../lib/tauri_client";
import {
  buildSettingsPrinterConfirmDeleteMessage,
  buildSettingsPrinterErrorMessage,
  buildSettingsPrinterRemovedMessage,
  buildSettingsPrinterRequiredMessage,
  buildSettingsPrinterUpdatedMessage,
  canUseSettingsPrinterWriteTarget,
  preparePrinterReconfigure,
  shouldPersistLocalBambuLiveIntegration,
  type SettingsPrinterMessageLabels,
} from "./settings_printer_model";

type UseSettingsPrinterActionsInput = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  busy: boolean;
  cancelPrinterEdit: () => void;
  confirmDeletePrinterId: string | null;
  editAmsUnits: string;
  editBambuLiveAccessCode: string;
  editBambuLiveAccessCodeAction: BambuAccessCodeAction;
  editBambuLiveAccessCodeConfigured: boolean;
  editBambuLiveEnabled: boolean;
  editBambuLiveHost: string;
  editBambuLivePrinterSerial: string;
  editBambuLiveTlsCertificateFingerprint: string | null;
  editBambuLiveTlsSpkiFingerprint: string | null;
  editBambuLiveTlsTrustAction: BambuTlsTrustAction;
  editBambuLiveTlsTrustState: BambuTlsTrustState;
  editPrinterDirty: boolean;
  editPrinterId: string | null;
  editPrinterModel: string;
  editPrinterName: string;
  editSlotsPerUnit: string;
  printerOverview: PrinterOverviewRow[];
  printers: PrinterRow[];
  reloadSettings: () => Promise<void>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setConfirmDeletePrinterId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  setEditBambuLiveTlsCertificateFingerprint: Dispatch<SetStateAction<string | null>>;
  setEditBambuLiveTlsSpkiFingerprint: Dispatch<SetStateAction<string | null>>;
  setEditBambuLiveTlsTrustAction: Dispatch<SetStateAction<BambuTlsTrustAction>>;
  setEditBambuLiveTlsTrustState: Dispatch<SetStateAction<BambuTlsTrustState>>;
  settingsClientHostBaseUrl: string | null;
  settingsClientHostWritePaired: boolean;
  settingsClientLibraryId: string | null;
  settingsClientReadOnly: boolean;
  settingsPrinterMessageLabels: () => SettingsPrinterMessageLabels;
  startPrinterEdit: (input: {
    bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
    printer: PrinterRow;
    printerOverview: PrinterOverviewRow[];
  }) => void;
  tauri: boolean;
};

export function useSettingsPrinterActions({
  bambuLiveIntegrations,
  busy,
  cancelPrinterEdit,
  confirmDeletePrinterId,
  editAmsUnits,
  editBambuLiveAccessCode,
  editBambuLiveAccessCodeAction,
  editBambuLiveAccessCodeConfigured,
  editBambuLiveEnabled,
  editBambuLiveHost,
  editBambuLivePrinterSerial,
  editBambuLiveTlsCertificateFingerprint,
  editBambuLiveTlsSpkiFingerprint,
  editBambuLiveTlsTrustAction,
  editBambuLiveTlsTrustState,
  editPrinterDirty,
  editPrinterId,
  editPrinterModel,
  editPrinterName,
  editSlotsPerUnit,
  printerOverview,
  printers,
  reloadSettings,
  setBusy,
  setConfirmDeletePrinterId,
  setError,
  setInfo,
  setEditBambuLiveTlsCertificateFingerprint,
  setEditBambuLiveTlsSpkiFingerprint,
  setEditBambuLiveTlsTrustAction,
  setEditBambuLiveTlsTrustState,
  settingsClientHostBaseUrl,
  settingsClientHostWritePaired,
  settingsClientLibraryId,
  settingsClientReadOnly,
  settingsPrinterMessageLabels,
  startPrinterEdit,
  tauri,
}: UseSettingsPrinterActionsInput) {
  function handleStartEditPrinter(printer: PrinterRow) {
    startPrinterEdit({
      bambuLiveIntegrations,
      printer,
      printerOverview,
    });
    setConfirmDeletePrinterId(null);
  }

  function handleCancelEditPrinter() {
    cancelPrinterEdit();
  }

  async function handleInspectBambuLiveTlsIdentity() {
    const host = editBambuLiveHost.trim();
    const printerSerial = editBambuLivePrinterSerial.trim();
    if (
      !tauri ||
      busy ||
      settingsClientReadOnly ||
      !editPrinterId ||
      !host ||
      !printerSerial
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const inspected = await inspectBambuLiveTlsIdentity({
        host,
        printer_serial: printerSerial,
      });
      const identityChanged =
        Boolean(editBambuLiveTlsSpkiFingerprint) &&
        editBambuLiveTlsSpkiFingerprint !== inspected.spki_sha256;
      setEditBambuLiveTlsCertificateFingerprint(
        inspected.certificate_sha256,
      );
      setEditBambuLiveTlsSpkiFingerprint(inspected.spki_sha256);
      setEditBambuLiveTlsTrustAction("KEEP");
      if (editBambuLiveTlsTrustState === "TRUSTED" && identityChanged) {
        setEditBambuLiveTlsTrustState("CHANGED");
      }
    } catch (inspectError) {
      console.error(inspectError);
      setError(
        toErrorMessage(
          inspectError,
          buildSettingsPrinterErrorMessage(
            "bambuLiveIdentityCheckFailed",
            settingsPrinterMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePrinterReconfigure() {
    if (!tauri || busy || !editPrinterId || !editPrinterDirty) {
      return;
    }
    const current = printers.find((printer) => printer.id === editPrinterId) ?? null;
    const prepared = preparePrinterReconfigure({
      currentExists: Boolean(current),
      manageBambuLive: !settingsClientReadOnly,
      draft: {
        id: editPrinterId,
        model: editPrinterModel,
        name: editPrinterName,
        amsUnits: editAmsUnits,
        slotsPerUnit: editSlotsPerUnit,
        bambuLiveEnabled: editBambuLiveEnabled,
        bambuLiveHost: editBambuLiveHost,
        bambuLiveAccessCode: editBambuLiveAccessCode,
        bambuLiveAccessCodeAction: editBambuLiveAccessCodeAction,
        bambuLiveAccessCodeConfigured: editBambuLiveAccessCodeConfigured,
        bambuLivePrinterSerial: editBambuLivePrinterSerial,
        bambuLiveTlsCertificateFingerprint:
          editBambuLiveTlsCertificateFingerprint,
        bambuLiveTlsSpkiFingerprint: editBambuLiveTlsSpkiFingerprint,
        bambuLiveTlsTrustAction: editBambuLiveTlsTrustAction,
        bambuLiveTlsTrustState: editBambuLiveTlsTrustState,
      },
    });
    if (!prepared.ok) {
      if (prepared.reason === "missing_bambu_live_fields") {
        setError(
          buildSettingsPrinterErrorMessage(
            "bambuLiveFieldsRequired",
            settingsPrinterMessageLabels(),
          ),
        );
        return;
      }
      if (prepared.reason === "missing_bambu_live_trust") {
        setError(
          buildSettingsPrinterErrorMessage(
            "bambuLiveTrustRequired",
            settingsPrinterMessageLabels(),
          ),
        );
        return;
      }
      setError(buildSettingsPrinterRequiredMessage(settingsPrinterMessageLabels()));
      return;
    }

    const canWrite = canUseSettingsPrinterWriteTarget({
      settingsClientReadOnly,
      settingsClientHostBaseUrl,
      settingsClientHostWritePaired,
      settingsClientLibraryId,
    });
    if (!canWrite) {
      setError(
        buildSettingsPrinterErrorMessage(
          "writeRequiresPairing",
          settingsPrinterMessageLabels(),
        ),
      );
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const writeTarget: PrinterWriteTarget = settingsClientReadOnly
        ? {
            clientReadOnly: true,
            clientHostBaseUrl: settingsClientHostBaseUrl,
            clientLibraryId: settingsClientLibraryId,
          }
        : {};

      const hasSavedBambuLiveIntegration = Boolean(
        bambuLiveIntegrations[prepared.printer.id],
      );
      if (shouldPersistLocalBambuLiveIntegration({
        enabled: prepared.bambuLive.enabled,
        hasSavedIntegration: hasSavedBambuLiveIntegration,
        settingsClientReadOnly,
      })) {
        // Fail fast on identity/security changes before applying the general
        // printer edit. This prevents a rejected TLS pairing from leaving
        // name/model/slot changes partially applied.
        await saveManagedBambuLiveIntegration(
          {
            printer_id: prepared.printer.id,
            enabled: prepared.bambuLive.enabled,
            host: prepared.bambuLive.host,
            access_code_action: prepared.bambuLive.accessCodeAction,
            access_code: prepared.bambuLive.accessCode,
            printer_serial: prepared.bambuLive.printerSerial,
            tls_trust_action: prepared.bambuLive.tlsTrustAction,
            expected_tls_certificate_sha256:
              prepared.bambuLive.expectedTlsCertificateSha256,
            expected_tls_spki_sha256:
              prepared.bambuLive.expectedTlsSpkiSha256,
          },
          {},
        );
      }
      await createManagedPrinter(prepared.printer, writeTarget);
      await reloadSettings();
      setInfo(
        buildSettingsPrinterUpdatedMessage(prepared.printer.name, settingsPrinterMessageLabels()),
      );
      handleCancelEditPrinter();
    } catch (updateError) {
      console.error(updateError);
      setError(
        toErrorMessage(
          updateError,
          buildSettingsPrinterErrorMessage("updatePrinterFailed", settingsPrinterMessageLabels()),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePrinter(printer: PrinterRow) {
    if (!tauri || busy) {
      return;
    }
    if (confirmDeletePrinterId !== printer.id) {
      setConfirmDeletePrinterId(printer.id);
      setError(null);
      setInfo(
        buildSettingsPrinterConfirmDeleteMessage(printer.name, settingsPrinterMessageLabels()),
      );
      return;
    }
    setConfirmDeletePrinterId(null);

    const canWrite = canUseSettingsPrinterWriteTarget({
      settingsClientReadOnly,
      settingsClientHostBaseUrl,
      settingsClientHostWritePaired,
      settingsClientLibraryId,
    });
    if (!canWrite) {
      setError(
        buildSettingsPrinterErrorMessage(
          "writeRequiresPairing",
          settingsPrinterMessageLabels(),
        ),
      );
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (settingsClientReadOnly) {
        await deleteManagedPrinter(printer.id, {
          clientReadOnly: true,
          clientHostBaseUrl: settingsClientHostBaseUrl,
          clientLibraryId: settingsClientLibraryId,
        });
      } else {
        await deleteManagedPrinter(printer.id);
      }
      await reloadSettings();
      setInfo(
        buildSettingsPrinterRemovedMessage(printer.name, settingsPrinterMessageLabels()),
      );
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        toErrorMessage(
          deleteError,
          buildSettingsPrinterErrorMessage("deletePrinterFailed", settingsPrinterMessageLabels()),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    handleCancelEditPrinter,
    handleDeletePrinter,
    handleInspectBambuLiveTlsIdentity,
    handleSavePrinterReconfigure,
    handleStartEditPrinter,
  };
}
