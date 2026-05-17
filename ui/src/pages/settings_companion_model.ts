import type {
  TrustedLanCompanionStatus,
  TrustedLanInterfaceOption,
} from "../lib/tauri_client";
import { parsePositiveInt } from "../lib/settings_utils";
export {
  buildTrustedLanPairedBrowserListModel,
  findNewTrustedLanActiveBrowserIds,
  type TrustedLanPairedBrowserListModel,
  type TrustedLanPairedBrowserRowModel,
} from "./settings_companion_browsers_model";

type TranslateFn = (key: string, fallback: string) => string;
export type TrustedLanCompanionStatusTone = "live" | "idle" | "warn";

type BuildTrustedLanCompanionModelInput = {
  trustedLanStatus: TrustedLanCompanionStatus | null;
  statusLoading: boolean;
  actionBusy: boolean;
  t: TranslateFn;
};

export type TrustedLanCompanionModel = {
  enabled: boolean;
  reachable: boolean;
  statusTone: TrustedLanCompanionStatusTone;
  statusPillLabel: string;
  statusLabel: string;
  statusHint: string;
  interfaceValue: string;
  interfaceHint: string;
  portValue: string;
  portHint: string;
  shellUrlValue: string;
  shellUrlHint: string;
  authLabel: string;
  authHint: string;
  pairActionDisabled: boolean;
  configActionDisabled: boolean;
};

export type TrustedLanActionMessageKey =
  | "allBrowsersRevoked"
  | "browserRevoked"
  | "pairingCopied"
  | "pairingCreated";

export type TrustedLanActionMessageLabels = Record<TrustedLanActionMessageKey, string>;

export type TrustedLanActionErrorMessageKey =
  | "copyPairingFailed"
  | "createPairingFailed"
  | "revokeAllBrowsersFailed"
  | "revokeBrowserFailed";

export type TrustedLanActionErrorMessageLabels = Record<TrustedLanActionErrorMessageKey, string>;

export type TrustedLanLoadMessageKey =
  | "loadCompanionFailed"
  | "newBrowserPaired"
  | "refreshBrowsersFailed";

export type TrustedLanLoadMessageLabels = Record<TrustedLanLoadMessageKey, string>;

export type TrustedLanConfigMessageKey =
  | "disabled"
  | "enabled"
  | "enabledPending"
  | "networkSaved"
  | "saveFailed"
  | "starting";

export type TrustedLanConfigMessageLabels = Record<TrustedLanConfigMessageKey, string>;

export type TrustedLanValidationMessageLabels = {
  noPrivateInterface: string;
};

export function buildTrustedLanActionMessage(
  action: TrustedLanActionMessageKey,
  labels: TrustedLanActionMessageLabels,
): string {
  return labels[action];
}

export function buildTrustedLanActionErrorMessage(
  action: TrustedLanActionErrorMessageKey,
  labels: TrustedLanActionErrorMessageLabels,
): string {
  return labels[action];
}

export function buildTrustedLanLoadMessage(
  action: TrustedLanLoadMessageKey,
  labels: TrustedLanLoadMessageLabels,
): string {
  return labels[action];
}

export function buildTrustedLanConfigMessage(
  action: TrustedLanConfigMessageKey,
  labels: TrustedLanConfigMessageLabels,
): string {
  return labels[action];
}

export function buildTrustedLanNoPrivateInterfaceMessage(
  labels: TrustedLanValidationMessageLabels,
): string {
  return labels.noPrivateInterface;
}

export function resolveTrustedLanInterfaceAddressDraft(
  trustedLanStatus: TrustedLanCompanionStatus | null,
  interfaces: TrustedLanInterfaceOption[],
): string {
  const selectedAddress = trustedLanStatus?.selected_interface_address?.trim() ?? "";
  if (selectedAddress) {
    return selectedAddress;
  }
  return interfaces[0]?.address ?? "";
}

export function isTrustedLanNetworkDraftDirty({
  interfaceAddressDraft,
  portDraft,
  trustedLanStatus,
}: {
  interfaceAddressDraft: string;
  portDraft: string;
  trustedLanStatus: TrustedLanCompanionStatus | null;
}): boolean {
  const currentAddress = trustedLanStatus?.selected_interface_address?.trim() ?? "";
  const currentPort = trustedLanStatus?.listen_port ?? 4278;
  return (
    interfaceAddressDraft !== currentAddress ||
    parsePositiveInt(portDraft, 4278) !== currentPort
  );
}

export function buildTrustedLanCompanionModel(
  input: BuildTrustedLanCompanionModelInput,
): TrustedLanCompanionModel {
  const { trustedLanStatus, statusLoading, actionBusy, t } = input;
  const status = trustedLanStatus;
  const enabled = Boolean(trustedLanStatus?.enabled);
  const reachable = Boolean(trustedLanStatus?.running && trustedLanStatus?.shell_reachable);
  const statusTone: TrustedLanCompanionStatusTone = !status || !status.enabled
    ? "idle"
    : reachable
      ? "live"
      : "warn";
  let statusPillLabel: string;
  let statusLabel: string;
  if (!status) {
    statusPillLabel = statusLoading
      ? t("settings.trustedLanStateChecking", "Checking")
      : t("settings.trustedLanStateOff", "Off");
    statusLabel = statusLoading
      ? t("common.loading", "Loading...")
      : t("common.unknown", "Unknown");
  } else if (!status.enabled) {
    statusPillLabel = t("settings.trustedLanStateOff", "Off");
    statusLabel = t("settings.trustedLanStatusDisabled", "Disabled by default");
  } else if (reachable) {
    statusPillLabel = t("settings.trustedLanStateLive", "Live");
    statusLabel = t("settings.companionStatusRunning", "Running");
  } else {
    statusPillLabel = statusLoading
      ? t("settings.trustedLanStateChecking", "Checking")
      : t("settings.trustedLanStateNeedsAttention", "Check");
    statusLabel = status.running
      ? statusLoading
        ? t("settings.trustedLanStatusStarting", "Starting...")
        : t("settings.companionStatusUnreachable", "Not responding")
      : t("settings.companionStatusStopped", "Not running");
  }

  const statusHint =
    trustedLanStatus?.health_error ??
    trustedLanStatus?.last_error ??
    (!trustedLanStatus?.enabled
      ? t(
          "settings.trustedLanStatusHintDisabled",
          "Trusted-LAN access stays off until you explicitly enable it from the desktop app.",
        )
      : reachable
        ? t(
            "settings.trustedLanStatusHintRunning",
            "Trusted-LAN companion is listening on the selected private interface.",
          )
      : t(
          "settings.trustedLanStatusHintEnabled",
          "Trusted-LAN mode binds only to one explicitly selected private interface.",
        ));

  const interfaceName = trustedLanStatus?.selected_interface_name?.trim() ?? "";
  const interfaceAddress = trustedLanStatus?.selected_interface_address?.trim() ?? "";
  const interfaceValue =
    interfaceName && interfaceAddress
      ? `${interfaceName} (${interfaceAddress})`
      : interfaceAddress || interfaceName || t("settings.trustedLanInterfaceNotSelected", "Not selected");

  const interfaceHint =
    trustedLanStatus?.bind_address ??
    (enabled
      ? t(
          "settings.trustedLanInterfaceHintEnabled",
          "Trusted-LAN mode will bind to one private interface only, not to all interfaces.",
        )
      : t(
          "settings.trustedLanInterfaceHintDisabled",
          "No LAN interface is exposed while trusted-LAN mode is disabled.",
        ));

  const shellUrlValue =
    trustedLanStatus?.shell_url?.trim() ||
    t("settings.trustedLanUrlUnavailable", "Not available until trusted-LAN mode is enabled");

  const shellUrlHint = trustedLanStatus?.shell_url
    ? t(
        "settings.trustedLanUrlHintEnabled",
        "This exact LAN URL will later be used for browser pairing on your trusted network.",
      )
    : t(
        "settings.trustedLanUrlHintDisabled",
        "No LAN URL is exposed while trusted-LAN mode stays disabled.",
      );

  const authLabel =
    trustedLanStatus?.auth_mode === "pairing-session"
      ? t("settings.trustedLanAuthPairing", "Per-browser pairing")
      : trustedLanStatus?.auth_mode ?? t("common.unknown", "Unknown");

  return {
    enabled,
    reachable,
    statusTone,
    statusPillLabel,
    statusLabel,
    statusHint,
    interfaceValue,
    interfaceHint,
    portValue: String(trustedLanStatus?.listen_port ?? 4278),
    portHint: t(
      "settings.trustedLanPortHint",
      "Use a fixed port so pairing links and exact host/origin checks stay predictable.",
    ),
    shellUrlValue,
    shellUrlHint,
    authLabel,
    authHint: t(
      "settings.trustedLanAuthHint",
      "Trusted-LAN browsers use per-browser pairing, HttpOnly cookies, session renewal, and CSRF protection.",
    ),
    pairActionDisabled:
      statusLoading || actionBusy || !enabled || !reachable || !trustedLanStatus?.shell_url,
    configActionDisabled: statusLoading || actionBusy,
  };
}
