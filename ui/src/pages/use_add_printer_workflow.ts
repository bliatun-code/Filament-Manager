import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { commandErrorText } from "../lib/error_text";
import {
  buildCreatePrinterInput,
  defaultPrinterFormCapacityForModel,
  derivePrinterFormCapacity,
} from "../lib/printer_form_model";
import { resolvePrinterModelProfile } from "../lib/printer_profiles";
import { createManagedPrinter } from "../lib/printer_writes";
import { useI18n } from "../lib/i18n";

type UseAddPrinterWorkflowInput = {
  busy: boolean;
  tauri: boolean;
  clientReadOnly: boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  ensureLocalWriteAllowed: () => boolean;
  canUseClientHostWrite: () => boolean;
  reloadData: () => Promise<void>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
};

export function useAddPrinterWorkflow({
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
}: UseAddPrinterWorkflowInput) {
  const { t } = useI18n();
  const [showAddPrinterModal, setShowAddPrinterModal] = useState(false);
  const [newPrinterModel, setNewPrinterModel] = useState("");
  const [newPrinterName, setNewPrinterName] = useState("");
  const [newAmsUnits, setNewAmsUnits] = useState("0");
  const [newSlotsPerUnit, setNewSlotsPerUnit] = useState("4");

  const selectedModelProfile = useMemo(
    () => resolvePrinterModelProfile(newPrinterModel || ""),
    [newPrinterModel],
  );
  const newPrinterCapacity = useMemo(
    () => derivePrinterFormCapacity(newPrinterModel, newAmsUnits, newSlotsPerUnit),
    [newAmsUnits, newPrinterModel, newSlotsPerUnit],
  );

  const selectPrinterModel = useCallback((nextModel: string) => {
    setNewPrinterModel(nextModel);
    const nextDefaults = defaultPrinterFormCapacityForModel(nextModel);
    if (nextDefaults) {
      setNewAmsUnits(nextDefaults.amsUnits);
      setNewSlotsPerUnit(nextDefaults.slotsPerUnit);
    }
  }, []);

  const closeAddPrinterModal = useCallback(() => {
    if (busy) {
      return;
    }
    setShowAddPrinterModal(false);
  }, [busy]);

  const openAddPrinterModalForVisualQa = useCallback(() => {
    setNewPrinterModel("");
    setNewPrinterName("");
    setNewAmsUnits("0");
    setNewSlotsPerUnit("4");
    setShowAddPrinterModal(true);
    setError(null);
    setInfo(null);
  }, [setError, setInfo]);

  const openAddPrinterModal = useCallback(() => {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    openAddPrinterModalForVisualQa();
  }, [
    canUseClientHostWrite,
    clientReadOnly,
    ensureLocalWriteAllowed,
    openAddPrinterModalForVisualQa,
  ]);

  const handleAddPrinter = useCallback(async () => {
    if (!clientReadOnly && !ensureLocalWriteAllowed()) {
      return;
    }
    if (clientReadOnly && !canUseClientHostWrite()) {
      return;
    }
    if (!tauri || busy) {
      return;
    }
    const model = newPrinterModel.trim();
    const name = newPrinterName.trim();
    if (!model || !name) {
      setError(t("settings.error.printerRequired", "Printer name and model are required."));
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const printerId = `printer_${Date.now()}`;
      const createInput = buildCreatePrinterInput(
        printerId,
        model,
        name,
        newAmsUnits,
        newSlotsPerUnit,
      );
      await createManagedPrinter(createInput, {
        clientReadOnly,
        clientHostBaseUrl,
        clientLibraryId,
      });
      setShowAddPrinterModal(false);
      await reloadData();
      setInfo(`${t("settings.addedPrinter", "Added printer")} "${name}".`);
    } catch (createError) {
      console.error(createError);
      setError(
        commandErrorText(
          createError,
          t("settings.error.addPrinter", "Failed to add printer."),
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
    newAmsUnits,
    newPrinterModel,
    newPrinterName,
    newSlotsPerUnit,
    reloadData,
    setBusy,
    setError,
    setInfo,
    tauri,
    t,
  ]);

  return {
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
    openAddPrinterModalForVisualQa,
    handleAddPrinter,
  };
}
