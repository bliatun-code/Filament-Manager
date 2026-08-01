import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toErrorMessage } from "../lib/error_text";
import { useI18n } from "../lib/i18n";
import {
  discoverBambuLivePrinters,
  recoverBambuLiveHost,
  type BambuLiveHostRecovery,
  type BambuPrinterDiscoveryCandidate,
  type BambuTlsTrustAction,
  type BambuTlsTrustState,
  type TrustedLanInterfaceOption,
} from "../lib/tauri_client";

type UseSettingsBambuLiveDiscoveryInput = {
  busy: boolean;
  editBambuLivePrinterSerial: string;
  editBambuLiveTlsTrustState: BambuTlsTrustState;
  editPrinterDirty: boolean;
  editPrinterId: string | null;
  interfaces: TrustedLanInterfaceOption[];
  reloadSettings: () => Promise<void>;
  settingsClientReadOnly: boolean;
  tauri: boolean;
  acceptRecoveredBambuLiveHost: (recovery: BambuLiveHostRecovery) => void;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setEditBambuLiveHost: Dispatch<SetStateAction<string>>;
  setEditBambuLivePrinterSerial: Dispatch<SetStateAction<string>>;
  setEditBambuLiveTlsCertificateFingerprint: Dispatch<SetStateAction<string | null>>;
  setEditBambuLiveTlsSpkiFingerprint: Dispatch<SetStateAction<string | null>>;
  setEditBambuLiveTlsTrustAction: Dispatch<SetStateAction<BambuTlsTrustAction>>;
  setEditBambuLiveTlsTrustState: Dispatch<SetStateAction<BambuTlsTrustState>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
};

function samePrinterSerial(left: string, right: string) {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

export function useSettingsBambuLiveDiscovery({
  busy,
  editBambuLivePrinterSerial,
  editBambuLiveTlsTrustState,
  editPrinterDirty,
  editPrinterId,
  interfaces,
  reloadSettings,
  settingsClientReadOnly,
  tauri,
  acceptRecoveredBambuLiveHost,
  setBusy,
  setEditBambuLiveHost,
  setEditBambuLivePrinterSerial,
  setEditBambuLiveTlsCertificateFingerprint,
  setEditBambuLiveTlsSpkiFingerprint,
  setEditBambuLiveTlsTrustAction,
  setEditBambuLiveTlsTrustState,
  setError,
  setInfo,
}: UseSettingsBambuLiveDiscoveryInput) {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<BambuPrinterDiscoveryCandidate[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [interfaceAddress, setInterfaceAddress] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setInterfaceAddress((current) => {
      if (interfaces.some((option) => option.address === current)) {
        return current;
      }
      return interfaces[0]?.address ?? "";
    });
  }, [interfaces]);

  useEffect(() => {
    setCandidates([]);
    setHasScanned(false);
    setScanning(false);
  }, [editPrinterId]);

  async function handleScan() {
    if (
      !tauri ||
      settingsClientReadOnly ||
      scanning ||
      !interfaceAddress
    ) {
      return;
    }
    setScanning(true);
    setHasScanned(false);
    setError(null);
    setInfo(null);
    try {
      setCandidates(await discoverBambuLivePrinters(interfaceAddress));
      setHasScanned(true);
    } catch (scanError) {
      console.error(scanError);
      setError(
        toErrorMessage(
          scanError,
          t(
            "settings.bambuDiscoveryFailed",
            "Could not find Bambu printers on this network.",
          ),
        ),
      );
    } finally {
      setScanning(false);
    }
  }

  function handleUseForSetup(candidate: BambuPrinterDiscoveryCandidate) {
    if (!tauri || settingsClientReadOnly || busy) {
      return;
    }
    setEditBambuLiveHost(candidate.host);
    setEditBambuLivePrinterSerial(candidate.printer_serial);
    setEditBambuLiveTlsCertificateFingerprint(null);
    setEditBambuLiveTlsSpkiFingerprint(null);
    setEditBambuLiveTlsTrustAction("KEEP");
    setEditBambuLiveTlsTrustState("UNPAIRED");
  }

  async function handleRecoverSavedAddress(candidate: BambuPrinterDiscoveryCandidate) {
    if (
      !tauri ||
      busy ||
      settingsClientReadOnly ||
      editPrinterDirty ||
      !editPrinterId ||
      editBambuLiveTlsTrustState !== "TRUSTED" ||
      !samePrinterSerial(editBambuLivePrinterSerial, candidate.printer_serial)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const recovery = await recoverBambuLiveHost({
        printer_id: editPrinterId,
        host: candidate.host,
      });
      acceptRecoveredBambuLiveHost(recovery);
      try {
        await reloadSettings();
      } catch (reloadError) {
        console.error(reloadError);
      }
      setInfo(
        t(
          "settings.bambuDiscoveryRecovered",
          "Recovered the saved live printer address.",
        ),
      );
    } catch (recoveryError) {
      console.error(recoveryError);
      setError(
        toErrorMessage(
          recoveryError,
          t(
            "settings.bambuLiveRecoveryFailed",
            "Could not recover the saved live printer address.",
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    bambuDiscoveryCandidates: candidates,
    bambuDiscoveryHasScanned: hasScanned,
    bambuDiscoveryInterfaceAddress: interfaceAddress,
    bambuDiscoveryScanning: scanning,
    handleBambuDiscoveryInterfaceAddressChange: setInterfaceAddress,
    handleFindBambuPrinters: handleScan,
    handleRecoverBambuLiveAddress: handleRecoverSavedAddress,
    handleUseDiscoveredBambuPrinter: handleUseForSetup,
  };
}
