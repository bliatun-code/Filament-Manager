import { useCallback, useState } from "react";
import type { BambuLiveIntegrationEntry, PrinterOverviewRow, PrinterRow } from "../lib/tauri_client";
import { derivePrinterMultiConfig } from "./settings_printer_model";

type BambuLiveIntegrationConfig = BambuLiveIntegrationEntry["config"];

type StartSettingsPrinterEditDraftInput = {
  bambuLiveIntegrations: Record<string, BambuLiveIntegrationConfig>;
  printer: PrinterRow;
  printerOverview: PrinterOverviewRow[];
};

export function useSettingsPrinterEditDraft() {
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
    setEditPrinterId(printer.id);
    setEditPrinterModel(printer.model);
    setEditPrinterName(printer.name);
    setEditAmsUnits(String(config.units));
    setEditSlotsPerUnit(String(config.slotsPerUnit));
    setEditBambuLiveEnabled(liveConfig?.enabled ?? false);
    setEditBambuLiveHost(liveConfig?.host ?? "");
    setEditBambuLiveAccessCode(liveConfig?.access_code ?? "");
    setEditBambuLivePrinterSerial(liveConfig?.printer_serial ?? "");
    setExpandedBambuDetailsPrinterId(null);
  }, []);

  return {
    cancelPrinterEdit,
    editAmsUnits,
    editBambuLiveAccessCode,
    editBambuLiveEnabled,
    editBambuLiveHost,
    editBambuLivePrinterSerial,
    editPrinterId,
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
