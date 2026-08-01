import { useCallback, useMemo, useState } from "react";
import type {
  BambuAccessCodeAction,
  BambuLiveHostRecovery,
  BambuLiveIntegrationEntry,
  BambuTlsTrustAction,
  BambuTlsTrustState,
  PrinterOverviewRow,
  PrinterRow,
} from "../lib/tauri_client";
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
  const [editBambuLiveAccessCodeAction, setEditBambuLiveAccessCodeAction] =
    useState<BambuAccessCodeAction>("KEEP");
  const [editBambuLiveAccessCodeConfigured, setEditBambuLiveAccessCodeConfigured] =
    useState(false);
  const [editBambuLivePrinterSerial, setEditBambuLivePrinterSerial] = useState("");
  const [
    editBambuLiveTlsCertificateFingerprint,
    setEditBambuLiveTlsCertificateFingerprint,
  ] = useState<string | null>(null);
  const [
    editBambuLiveTlsSpkiFingerprint,
    setEditBambuLiveTlsSpkiFingerprint,
  ] = useState<string | null>(null);
  const [editBambuLiveTlsTrustAction, setEditBambuLiveTlsTrustAction] =
    useState<BambuTlsTrustAction>("KEEP");
  const [editBambuLiveTlsTrustState, setEditBambuLiveTlsTrustState] =
    useState<BambuTlsTrustState>("UNPAIRED");
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
    setEditBambuLiveAccessCodeAction("KEEP");
    setEditBambuLiveAccessCodeConfigured(false);
    setEditBambuLivePrinterSerial("");
    setEditBambuLiveTlsCertificateFingerprint(null);
    setEditBambuLiveTlsSpkiFingerprint(null);
    setEditBambuLiveTlsTrustAction("KEEP");
    setEditBambuLiveTlsTrustState("UNPAIRED");
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
      bambuLiveAccessCode: "",
      bambuLiveAccessCodeAction: "KEEP",
      bambuLiveAccessCodeConfigured: liveConfig?.access_code_configured ?? false,
      bambuLivePrinterSerial: liveConfig?.printer_serial ?? "",
      bambuLiveTlsCertificateFingerprint:
        liveConfig?.tls_certificate_fingerprint ?? null,
      bambuLiveTlsSpkiFingerprint: liveConfig?.tls_spki_fingerprint ?? null,
      bambuLiveTlsTrustAction: "KEEP",
      bambuLiveTlsTrustState: liveConfig?.tls_trust_state ?? "UNPAIRED",
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
    setEditBambuLiveAccessCodeAction(draft.bambuLiveAccessCodeAction);
    setEditBambuLiveAccessCodeConfigured(draft.bambuLiveAccessCodeConfigured);
    setEditBambuLivePrinterSerial(draft.bambuLivePrinterSerial);
    setEditBambuLiveTlsCertificateFingerprint(
      draft.bambuLiveTlsCertificateFingerprint,
    );
    setEditBambuLiveTlsSpkiFingerprint(draft.bambuLiveTlsSpkiFingerprint);
    setEditBambuLiveTlsTrustAction(draft.bambuLiveTlsTrustAction);
    setEditBambuLiveTlsTrustState(draft.bambuLiveTlsTrustState);
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
      bambuLiveAccessCodeAction: editBambuLiveAccessCodeAction,
      bambuLiveAccessCodeConfigured: editBambuLiveAccessCodeConfigured,
      bambuLivePrinterSerial: editBambuLivePrinterSerial,
      bambuLiveTlsCertificateFingerprint:
        editBambuLiveTlsCertificateFingerprint,
      bambuLiveTlsSpkiFingerprint: editBambuLiveTlsSpkiFingerprint,
      bambuLiveTlsTrustAction: editBambuLiveTlsTrustAction,
      bambuLiveTlsTrustState: editBambuLiveTlsTrustState,
    });
  }, [
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
    editPrinterBaseline,
    editPrinterId,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
  ]);

  const acceptRecoveredBambuLiveHost = useCallback(
    (recovery: BambuLiveHostRecovery) => {
      const next = {
        bambuLiveHost: recovery.host,
        bambuLiveTlsCertificateFingerprint: recovery.certificate_sha256,
        bambuLiveTlsSpkiFingerprint: recovery.spki_sha256,
        bambuLiveTlsTrustAction: "KEEP" as const,
        bambuLiveTlsTrustState: "TRUSTED" as const,
      };
      setEditPrinterBaseline((current) => (current ? { ...current, ...next } : current));
      setEditBambuLiveHost(next.bambuLiveHost);
      setEditBambuLiveTlsCertificateFingerprint(
        next.bambuLiveTlsCertificateFingerprint,
      );
      setEditBambuLiveTlsSpkiFingerprint(next.bambuLiveTlsSpkiFingerprint);
      setEditBambuLiveTlsTrustAction(next.bambuLiveTlsTrustAction);
      setEditBambuLiveTlsTrustState(next.bambuLiveTlsTrustState);
    },
    [],
  );

  return {
    acceptRecoveredBambuLiveHost,
    cancelPrinterEdit,
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
    editPrinterId,
    editPrinterDirty,
    editPrinterModel,
    editPrinterName,
    editSlotsPerUnit,
    expandedBambuDetailsPrinterId,
    setEditAmsUnits,
    setEditBambuLiveAccessCode,
    setEditBambuLiveAccessCodeAction,
    setEditBambuLiveEnabled,
    setEditBambuLiveHost,
    setEditBambuLivePrinterSerial,
    setEditBambuLiveTlsCertificateFingerprint,
    setEditBambuLiveTlsSpkiFingerprint,
    setEditBambuLiveTlsTrustAction,
    setEditBambuLiveTlsTrustState,
    setEditPrinterModel,
    setEditPrinterName,
    setEditSlotsPerUnit,
    setExpandedBambuDetailsPrinterId,
    startPrinterEdit,
  };
}
