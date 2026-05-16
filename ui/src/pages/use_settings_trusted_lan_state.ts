import { useRef, useState } from "react";
import type {
  TrustedLanCompanionStatus,
  TrustedLanInterfaceOption,
  TrustedLanPairedBrowser,
} from "../lib/tauri_client";

export function useSettingsTrustedLanState(tauri: boolean) {
  const [trustedLanStatus, setTrustedLanStatus] = useState<TrustedLanCompanionStatus | null>(
    null,
  );
  const [trustedLanInterfaces, setTrustedLanInterfaces] = useState<TrustedLanInterfaceOption[]>(
    [],
  );
  const [trustedLanPairedBrowsers, setTrustedLanPairedBrowsers] = useState<
    TrustedLanPairedBrowser[]
  >([]);
  const [trustedLanLoading, setTrustedLanLoading] = useState(tauri);
  const [trustedLanActionBusy, setTrustedLanActionBusy] = useState(false);
  const [trustedLanEnabledDraft, setTrustedLanEnabledDraft] = useState(false);
  const [trustedLanInterfaceAddressDraft, setTrustedLanInterfaceAddressDraft] = useState("");
  const [trustedLanPortDraft, setTrustedLanPortDraft] = useState("4278");
  const [showTrustedLanNetworkSummary, setShowTrustedLanNetworkSummary] = useState(false);
  const [showTrustedLanNetworkEditor, setShowTrustedLanNetworkEditor] = useState(false);
  const [trustedLanPairingBrowserLabelDraft, setTrustedLanPairingBrowserLabelDraft] = useState("");
  const [trustedLanPairingLink, setTrustedLanPairingLink] = useState<string | null>(null);
  const [trustedLanPairingLabel, setTrustedLanPairingLabel] = useState<string | null>(null);
  const [trustedLanPairingExpiresAtMs, setTrustedLanPairingExpiresAtMs] = useState<number | null>(
    null,
  );
  const [showTrustedLanRevokedBrowsers, setShowTrustedLanRevokedBrowsers] = useState(false);
  const trustedLanPairedBrowsersRef = useRef<TrustedLanPairedBrowser[]>([]);
  const trustedLanPairedBrowsersRefreshInFlightRef = useRef(false);

  return {
    showTrustedLanNetworkEditor,
    showTrustedLanNetworkSummary,
    showTrustedLanRevokedBrowsers,
    setShowTrustedLanNetworkEditor,
    setShowTrustedLanNetworkSummary,
    setShowTrustedLanRevokedBrowsers,
    setTrustedLanActionBusy,
    setTrustedLanEnabledDraft,
    setTrustedLanInterfaceAddressDraft,
    setTrustedLanInterfaces,
    setTrustedLanLoading,
    setTrustedLanPairedBrowsers,
    setTrustedLanPairingBrowserLabelDraft,
    setTrustedLanPairingExpiresAtMs,
    setTrustedLanPairingLabel,
    setTrustedLanPairingLink,
    setTrustedLanPortDraft,
    setTrustedLanStatus,
    trustedLanActionBusy,
    trustedLanEnabledDraft,
    trustedLanInterfaceAddressDraft,
    trustedLanInterfaces,
    trustedLanLoading,
    trustedLanPairedBrowsers,
    trustedLanPairedBrowsersRef,
    trustedLanPairedBrowsersRefreshInFlightRef,
    trustedLanPairingBrowserLabelDraft,
    trustedLanPairingExpiresAtMs,
    trustedLanPairingLabel,
    trustedLanPairingLink,
    trustedLanPortDraft,
    trustedLanStatus,
  };
}
