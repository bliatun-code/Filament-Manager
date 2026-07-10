import { useCallback, useMemo, useState } from "react";
import type { BambuLiveIntegrationEntry, PrinterOverviewRow, PrinterRow } from "../lib/tauri_client";
import {
  derivePrinterMultiConfig,
  isPrinterReconfigureDraftDirty,
  type PrinterReconfigureDraft,
} from "./settings_printer_model";

type BambuLiveIntegrationConfig = BambuLiveIntegrationEntry["config"];

type StartSettingsPrinterEditDraftInput = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationConfig>;
  printer: PrinterRow;
  printerOverview: PrinterOverviewRow[];
};

export function useSettingsPrinterEditDraft() {
  const [editPrinterBaseline, setEditPrinterBaseline] =
    useState<PrinterReconfigureDraft | null>(null);
  const [editPrinterId, setEditPrinterId] = useState<string | null>(null);
  const [editPrinterModel, setEditPrinterModel] = useState("");
  const [editPrinterName, setEditPrinterName] = useState("");
  const [editAmsUnits, setEditAmsUnits] = useState("0");
  const [editSlotsPerUnit, setEditSlotsPerUnit] = useState("4");
  const [editBambuLiveEnabled, setEditBambuLiveEnabled] = useState(false);
  const [editBambuLiveHost, setEditBambuLiveHost] = useState("");
  const [editBambuLiveAccessCode, setEditBambuLiveAccessCode] = useState("");
  const [editBambuLivePrinterSerial, setEditBambuLivePrinterSerial] = useState("");
  const [expandedBambuDetailsPrinterId, setExpandedBambuDetailsPrinterId] =
    useState<string | null>(null);

  const cancelPrinterEdit = useCallback(() => {
    setEditPrinterBaseline(null);
    setEditPrinterId(null);
    setEditPrinterModel("");
    setEditPrinterName("");
    setEditAmsUnits("0");
    setEditSlotsPerUnit("4");
    setEditBambuLiveEnabled(false);
    setEditBambuLiveHost("");
    setEditBambuLiveAccessCode("");
    setEditBambuLivePrinterSerial("");
    setExpandedBambuDetailsPrinterId(null);
  }, []);

  const startPrinterEdit = useCallback(({
    bambuLiveIntegrations,
    printer,
    printerOverview,
  }: StartSettingsPrinterEditDraftInput) => {
    const config = derivePrinterMultiConfig({
      printerId: printer.id,
      model: printer.model,
      printerOverview,
    });
    const liveConfig = bambuLiveIntegrations[printer.id];
    const draft: PrinterReconfigureDraft = {
      id: printer.id,
      model: printer.model,
      name: printer.name,
      amsUnits: String(config.units),
      slotsPerUnit: String(config.slotsPerUnit),
      bambuLiveEnabled: liveConfig?.enabled ?? false,
      bambuLiveHost: liveConfig?.host ?? "",
      bambuLiveAccessCode: liveConfig?.access_code ?? "",
      bambuLivePrinterSerial: liveConfig?.printer_serial ?? "",
    };
    setEditPrinterBaseline(draft);
    setEditPrinterId(draft.id);
    setEditPrinterModel(draft.model);
    setEditPrinterName(draft.name);
    setEditAmsUnits(draft.amsUnits);
    setEditSlotsPerUnit(draft.slotsPerUnit);
    setEditBambuLiveEnabled(draft.bambuLiveEnabled);
    setEditBambuLiveHost(draft.bambuLiveHost);
    setEditBambuLiveAccessCode(draft.bambuLiveAccessCode);
    setEditBambuLivePrinterSerial(draft.bambuLivePrinterSerial);
    setExpandedBambuDetailsPrinterId(null);
  }, []);

  const editPrinterDirty = useMemo(() => {
    if (!editPrinterBaseline) {
      return false;
    }
    return isPrinterReconfigureDraftDirty(editPrinterBaseline, {
      id: editPrinterId,
      model: editPrinterModel,
      name: editPrinterName,
      amsUnits: editAmsUnits,
      slotsPerUnit: editSlotsPerUnit,
      bambuLiveEnabled: editBambuLiveEnabled,
      bambuLiveHost: editBambuLiveHost,
      bambuLiveAccessCode: editBambuLiveAccessCode,
      bambuLivePrinterSerial: editBambuLivePrinterSerial,
    });
  }, [
    editAmsUnits,
    editBambuLiveAccessCode,
    editBambuLiveEnabled,
    editBambuLiveHost,
    editBambuLivePrinterSerial,
    editPrinterBaseline,
    editPrinterId,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
  ]);

  return {
    cancelPrinterEdit,
    editAmsUnits,
    editBambuLiveAccessCode,
    editBambuLiveEnabled,
    editBambuLiveHost,
    editBambuLivePrinterSerial,
    editPrinterId,
    editPrinterDirty,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
    expandedBambuDetailsPrinterId,
    setEditAmsUnits,
    setEditBambuLiveAccessCode,
    setEditBambuLiveEnabled,
    setEditBambuLiveHost,
    setEditBambuLivePrinterSerial,
    setEditPrinterModel,
    setEditPrinterName,
    setEditSlotsPerUnit,
    setExpandedBambuDetailsPrinterId,
    startPrinterEdit,
  };
}
