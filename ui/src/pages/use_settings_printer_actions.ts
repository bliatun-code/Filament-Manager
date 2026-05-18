import { type Dispatch, type SetStateAction } from "react";
import { toErrorMessage } from "../lib/error_text";
import { createManagedPrinter, deleteManagedPrinter } from "../lib/printer_writes";
import {
  deleteBambuLiveIntegration,
  saveBambuLiveIntegration,
  type BambuLiveIntegrationEntry,
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
  type SettingsPrinterMessageLabels,
} from "./settings_printer_model";

type UseSettingsPrinterActionsInput = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationEntry["config"]>;
  busy: boolean;
  cancelPrinterEdit: () => void;
  confirmDeletePrinterId: string | null;
  editAmsUnits: string;
  editBambuLiveAccessCode: string;
  editBambuLiveEnabled: boolean;
  editBambuLiveHost: string;
  editBambuLivePrinterSerial: string;
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
  editBambuLiveEnabled,
  editBambuLiveHost,
  editBambuLivePrinterSerial,
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

  async function handleSavePrinterReconfigure() {
    if (!tauri || busy || !editPrinterId) {
      return;
    }
    const current = printers.find((printer) => printer.id === editPrinterId) ?? null;
    const prepared = preparePrinterReconfigure({
      currentExists: Boolean(current),
      draft: {
        id: editPrinterId,
        model: editPrinterModel,
        name: editPrinterName,
        amsUnits: editAmsUnits,
        slotsPerUnit: editSlotsPerUnit,
        bambuLiveEnabled: editBambuLiveEnabled,
        bambuLiveHost: editBambuLiveHost,
        bambuLiveAccessCode: editBambuLiveAccessCode,
        bambuLivePrinterSerial: editBambuLivePrinterSerial,
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
      if (settingsClientReadOnly) {
        await createManagedPrinter(
          prepared.printer,
          {
            clientReadOnly: true,
            clientHostBaseUrl: settingsClientHostBaseUrl,
            clientLibraryId: settingsClientLibraryId,
          },
        );
      } else {
        await createManagedPrinter(prepared.printer);
        if (prepared.bambuLive.enabled) {
          await saveBambuLiveIntegration({
            printer_id: prepared.printer.id,
            enabled: true,
            host: prepared.bambuLive.host,
            access_code: prepared.bambuLive.accessCode,
            printer_serial: prepared.bambuLive.printerSerial,
          });
        } else {
          await deleteBambuLiveIntegration(prepared.printer.id);
        }
      }
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
    handleSavePrinterReconfigure,
    handleStartEditPrinter,
  };
}
