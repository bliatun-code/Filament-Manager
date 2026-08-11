import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { commandErrorText } from "../lib/error_text";
import {
  buildCreatePrinterInput,
  defaultPrinterFormCapacityForModel,
  derivePrinterFormCapacity,
} from "../lib/printer_form_model";
import { resolvePrinterModelProfile } from "../lib/printer_profiles";
import { createManagedPrinterWithBambuLive } from "../lib/printer_writes";
import { useI18n } from "../lib/i18n";
import {
  inspectBambuLiveTlsIdentity,
  type BambuTlsTrustAction,
} from "../lib/tauri_client";

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
  const [newBambuLiveEnabled, setNewBambuLiveEnabled] = useState(false);
  const [newBambuLiveHost, setNewBambuLiveHost] = useState("");
  const [newBambuLiveAccessCode, setNewBambuLiveAccessCode] = useState("");
  const [newBambuLivePrinterSerial, setNewBambuLivePrinterSerial] =
    useState("");
  const [
    newBambuLiveTlsCertificateFingerprint,
    setNewBambuLiveTlsCertificateFingerprint,
  ] = useState<string | null>(null);
  const [newBambuLiveTlsSpkiFingerprint, setNewBambuLiveTlsSpkiFingerprint] =
    useState<string | null>(null);
  const [newBambuLiveTlsTrustAction, setNewBambuLiveTlsTrustAction] =
    useState<BambuTlsTrustAction>("KEEP");

  const selectedModelProfile = useMemo(
    () => resolvePrinterModelProfile(newPrinterModel || ""),
    [newPrinterModel],
  );
  const newPrinterCapacity = useMemo(
    () =>
      derivePrinterFormCapacity(newPrinterModel, newAmsUnits, newSlotsPerUnit),
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

  const resetBambuLiveDraft = useCallback(() => {
    setNewBambuLiveEnabled(false);
    setNewBambuLiveHost("");
    setNewBambuLiveAccessCode("");
    setNewBambuLivePrinterSerial("");
    setNewBambuLiveTlsCertificateFingerprint(null);
    setNewBambuLiveTlsSpkiFingerprint(null);
    setNewBambuLiveTlsTrustAction("KEEP");
  }, []);

  const changeBambuLiveHost = useCallback((value: string) => {
    setNewBambuLiveHost(value);
    setNewBambuLiveTlsCertificateFingerprint(null);
    setNewBambuLiveTlsSpkiFingerprint(null);
    setNewBambuLiveTlsTrustAction("KEEP");
  }, []);

  const changeBambuLivePrinterSerial = useCallback((value: string) => {
    setNewBambuLivePrinterSerial(value);
    setNewBambuLiveTlsCertificateFingerprint(null);
    setNewBambuLiveTlsSpkiFingerprint(null);
    setNewBambuLiveTlsTrustAction("KEEP");
  }, []);

  const closeAddPrinterModal = useCallback(() => {
    if (busy) {
      return;
    }
    setShowAddPrinterModal(false);
  }, [busy]);

  const openAddPrinterModalForVisualQa = useCallback(
    (options?: { showBambuLiveStep?: boolean }) => {
      const showBambuLiveStep = options?.showBambuLiveStep === true;
      const model = showBambuLiveStep ? "Bambu Lab P1S" : "";
      const capacity = defaultPrinterFormCapacityForModel(model);
      setNewPrinterModel(model);
      setNewPrinterName(showBambuLiveStep ? "Atlas QA" : "");
      setNewAmsUnits(capacity?.amsUnits ?? "0");
      setNewSlotsPerUnit(capacity?.slotsPerUnit ?? "4");
      resetBambuLiveDraft();
      setNewBambuLiveEnabled(showBambuLiveStep);
      setShowAddPrinterModal(true);
      setError(null);
      setInfo(null);
    },
    [resetBambuLiveDraft, setError, setInfo],
  );

  const handleInspectBambuLiveIdentity = useCallback(async () => {
    const host = newBambuLiveHost.trim();
    const printerSerial = newBambuLivePrinterSerial.trim();
    if (!tauri || busy || clientReadOnly || !host || !printerSerial) {
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
      setNewBambuLiveTlsCertificateFingerprint(inspected.certificate_sha256);
      setNewBambuLiveTlsSpkiFingerprint(inspected.spki_sha256);
      setNewBambuLiveTlsTrustAction("KEEP");
    } catch (inspectError) {
      console.error(inspectError);
      setError(
        commandErrorText(
          inspectError,
          t(
            "settings.error.bambuLiveIdentityCheckFailed",
            "Could not verify the printer identity.",
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    clientReadOnly,
    newBambuLiveHost,
    newBambuLivePrinterSerial,
    setBusy,
    setError,
    setInfo,
    tauri,
    t,
  ]);

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
      setError(
        t(
          "settings.error.printerRequired",
          "Printer name and model are required.",
        ),
      );
      return;
    }
    if (
      newBambuLiveEnabled &&
      (!newBambuLiveHost.trim() ||
        !newBambuLiveAccessCode.trim() ||
        !newBambuLivePrinterSerial.trim())
    ) {
      setError(
        t(
          "settings.error.bambuLiveFieldsRequired",
          "Printer host, access code, and serial are required for Bambu Live.",
        ),
      );
      return;
    }
    if (
      newBambuLiveEnabled &&
      (!newBambuLiveTlsCertificateFingerprint ||
        !newBambuLiveTlsSpkiFingerprint ||
        newBambuLiveTlsTrustAction !== "TRUST_CURRENT")
    ) {
      setError(
        t(
          "settings.error.bambuLiveTrustRequired",
          "Check and trust the printer identity before enabling Bambu Live.",
        ),
      );
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
      await createManagedPrinterWithBambuLive(
        createInput,
        newBambuLiveEnabled
          ? {
              printer_id: printerId,
              enabled: true,
              host: newBambuLiveHost.trim(),
              access_code_action: "REPLACE",
              access_code: newBambuLiveAccessCode.trim(),
              printer_serial: newBambuLivePrinterSerial.trim(),
              tls_trust_action: "TRUST_CURRENT",
              expected_tls_certificate_sha256:
                newBambuLiveTlsCertificateFingerprint,
              expected_tls_spki_sha256: newBambuLiveTlsSpkiFingerprint,
            }
          : null,
        { clientReadOnly, clientHostBaseUrl, clientLibraryId },
      );
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
    newBambuLiveAccessCode,
    newBambuLiveEnabled,
    newBambuLiveHost,
    newBambuLivePrinterSerial,
    newBambuLiveTlsCertificateFingerprint,
    newBambuLiveTlsSpkiFingerprint,
    newBambuLiveTlsTrustAction,
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
    handleInspectBambuLiveIdentity,
    handleAddPrinter,
  };
}
