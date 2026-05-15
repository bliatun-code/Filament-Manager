import { type Dispatch, type SetStateAction } from "react";
import { copyTextToClipboard } from "../lib/clipboard";
import { toErrorMessage } from "../lib/error_text";
import {
  createTrustedLanPairing,
  revokeAllTrustedLanPairedBrowsers,
  revokeTrustedLanPairedBrowser,
  type TrustedLanCompanionStatus,
} from "../lib/tauri_client";
import {
  buildTrustedLanActionErrorMessage,
  buildTrustedLanActionMessage,
  buildTrustedLanConfigMessage,
  type TrustedLanActionErrorMessageLabels,
  type TrustedLanActionMessageLabels,
  type TrustedLanConfigMessageLabels,
} from "./settings_companion_model";

type TrustedLanCombinedActionMessageLabels =
  TrustedLanActionMessageLabels & TrustedLanActionErrorMessageLabels;

type UseTrustedLanPairingActionsInput = {
  configActionDisabled: boolean;
  loadTrustedLanCompanionStatus: () => Promise<TrustedLanCompanionStatus | null>;
  pairActionDisabled: boolean;
  persistTrustedLanConfig: (nextEnabled: boolean, successMessage: string) => Promise<boolean>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  setShowTrustedLanRevokedBrowsers: Dispatch<SetStateAction<boolean>>;
  setTrustedLanActionBusy: Dispatch<SetStateAction<boolean>>;
  setTrustedLanEnabledDraft: Dispatch<SetStateAction<boolean>>;
  setTrustedLanPairingExpiresAtMs: Dispatch<SetStateAction<number | null>>;
  setTrustedLanPairingLabel: Dispatch<SetStateAction<string | null>>;
  setTrustedLanPairingLink: Dispatch<SetStateAction<string | null>>;
  tauri: boolean;
  trustedLanActionMessageLabels: () => TrustedLanCombinedActionMessageLabels;
  trustedLanConfigMessageLabels: () => TrustedLanConfigMessageLabels;
  trustedLanEnabledDraft: boolean;
  trustedLanPairingBrowserLabelDraft: string;
  trustedLanPairingLink: string | null;
};

export function useTrustedLanPairingActions({
  configActionDisabled,
  loadTrustedLanCompanionStatus,
  pairActionDisabled,
  persistTrustedLanConfig,
  setError,
  setInfo,
  setShowTrustedLanRevokedBrowsers,
  setTrustedLanActionBusy,
  setTrustedLanEnabledDraft,
  setTrustedLanPairingExpiresAtMs,
  setTrustedLanPairingLabel,
  setTrustedLanPairingLink,
  tauri,
  trustedLanActionMessageLabels,
  trustedLanConfigMessageLabels,
  trustedLanEnabledDraft,
  trustedLanPairingBrowserLabelDraft,
  trustedLanPairingLink,
}: UseTrustedLanPairingActionsInput) {
  async function handleSaveTrustedLanConfig() {
    await persistTrustedLanConfig(
      trustedLanEnabledDraft,
      buildTrustedLanConfigMessage("networkSaved", trustedLanConfigMessageLabels()),
    );
  }

  async function handleToggleTrustedLanEnabled(nextEnabled: boolean) {
    if (!tauri || configActionDisabled) {
      return;
    }

    const previousEnabled = trustedLanEnabledDraft;
    setTrustedLanEnabledDraft(nextEnabled);
    const saved = await persistTrustedLanConfig(
      nextEnabled,
      nextEnabled
        ? buildTrustedLanConfigMessage("enabled", trustedLanConfigMessageLabels())
        : buildTrustedLanConfigMessage("disabled", trustedLanConfigMessageLabels()),
    );
    if (!saved) {
      setTrustedLanEnabledDraft(previousEnabled);
    }
  }

  async function handleCreateTrustedLanPairingLink() {
    if (pairActionDisabled) {
      return;
    }
    setTrustedLanActionBusy(true);
    setError(null);
    try {
      const browserLabel = trustedLanPairingBrowserLabelDraft.trim() || null;
      const link = await createTrustedLanPairing(browserLabel);
      setTrustedLanPairingLabel(browserLabel);
      setTrustedLanPairingExpiresAtMs(Date.now() + link.expires_in_seconds * 1000);
      setTrustedLanPairingLink(link.pairing_url);
      await copyTextToClipboard(link.pairing_url);
      setInfo(buildTrustedLanActionMessage("pairingCreated", trustedLanActionMessageLabels()));
      await loadTrustedLanCompanionStatus();
    } catch (pairError) {
      console.error(pairError);
      setError(
        toErrorMessage(
          pairError,
          buildTrustedLanActionErrorMessage(
            "createPairingFailed",
            trustedLanActionMessageLabels(),
          ),
        ),
      );
    } finally {
      setTrustedLanActionBusy(false);
    }
  }

  async function handleCopyTrustedLanPairingLink() {
    if (!trustedLanPairingLink) {
      return;
    }
    setTrustedLanActionBusy(true);
    setError(null);
    try {
      await copyTextToClipboard(trustedLanPairingLink);
      setInfo(buildTrustedLanActionMessage("pairingCopied", trustedLanActionMessageLabels()));
    } catch (copyError) {
      console.error(copyError);
      setError(
        toErrorMessage(
          copyError,
          buildTrustedLanActionErrorMessage(
            "copyPairingFailed",
            trustedLanActionMessageLabels(),
          ),
        ),
      );
    } finally {
      setTrustedLanActionBusy(false);
    }
  }

  async function handleRevokeTrustedLanBrowser(browserId: string) {
    setTrustedLanActionBusy(true);
    setError(null);
    try {
      await revokeTrustedLanPairedBrowser(browserId);
      await loadTrustedLanCompanionStatus();
      setShowTrustedLanRevokedBrowsers(true);
      setInfo(buildTrustedLanActionMessage("browserRevoked", trustedLanActionMessageLabels()));
    } catch (revokeError) {
      console.error(revokeError);
      setError(
        toErrorMessage(
          revokeError,
          buildTrustedLanActionErrorMessage(
            "revokeBrowserFailed",
            trustedLanActionMessageLabels(),
          ),
        ),
      );
    } finally {
      setTrustedLanActionBusy(false);
    }
  }

  async function handleRevokeAllTrustedLanBrowsers() {
    setTrustedLanActionBusy(true);
    setError(null);
    try {
      await revokeAllTrustedLanPairedBrowsers();
      await loadTrustedLanCompanionStatus();
      setShowTrustedLanRevokedBrowsers(true);
      setInfo(buildTrustedLanActionMessage("allBrowsersRevoked", trustedLanActionMessageLabels()));
    } catch (revokeError) {
      console.error(revokeError);
      setError(
        toErrorMessage(
          revokeError,
          buildTrustedLanActionErrorMessage(
            "revokeAllBrowsersFailed",
            trustedLanActionMessageLabels(),
          ),
        ),
      );
    } finally {
      setTrustedLanActionBusy(false);
    }
  }

  return {
    handleCopyTrustedLanPairingLink,
    handleCreateTrustedLanPairingLink,
    handleRevokeAllTrustedLanBrowsers,
    handleRevokeTrustedLanBrowser,
    handleSaveTrustedLanConfig,
    handleToggleTrustedLanEnabled,
  };
}
