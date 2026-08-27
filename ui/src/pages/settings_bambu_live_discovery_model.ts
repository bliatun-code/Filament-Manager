import type {
  BambuPrinterDiscoveryCandidate,
  BambuTlsTrustState,
} from "../lib/tauri_client";

type BambuDiscoverySetupDraft = {
  host: string;
  printerSerial: string;
  tlsCertificateFingerprint: string | null;
  tlsSpkiFingerprint: string | null;
  tlsTrustState: BambuTlsTrustState;
};

export function chooseBambuDiscoveryAutoFillCandidate(
  candidates: BambuPrinterDiscoveryCandidate[],
  draft: BambuDiscoverySetupDraft,
): BambuPrinterDiscoveryCandidate | null {
  if (
    candidates.length !== 1 ||
    draft.host.trim() ||
    draft.printerSerial.trim() ||
    draft.tlsCertificateFingerprint?.trim() ||
    draft.tlsSpkiFingerprint?.trim() ||
    draft.tlsTrustState !== "UNPAIRED"
  ) {
    return null;
  }

  const [candidate] = candidates;
  if (!candidate.host.trim() || !candidate.printer_serial.trim()) {
    return null;
  }
  return candidate;
}
