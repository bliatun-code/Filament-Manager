import { buildFilamentLabelQrDataUrl } from "./filament_label_print";
import {
  buildFilamentQrPayload,
  resolvePreferredCompanionShellUrl,
  type FilamentQrMode,
} from "./filament_qr_payload";
import {
  getTrustedLanCompanionStatus,
  type TrustedLanCompanionStatus,
} from "./tauri_client";

type SpoolQrArtifactsDependencies = {
  loadTrustedLanStatus?: typeof getTrustedLanCompanionStatus;
  buildQrDataUrl?: (payload: string) => Promise<string>;
};

export type SpoolQrArtifactsOptions = {
  spoolId: string;
  mode?: FilamentQrMode;
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
};

export type SpoolQrArtifacts = {
  qrReference: string;
  qrPayload: string;
  qrDataUrl: string;
  qrMode: FilamentQrMode;
  qrTarget: string;
  companionShellUrl: string | null;
};

async function loadTrustedLanShellUrl(
  loadTrustedLanStatus: () => Promise<TrustedLanCompanionStatus>,
): Promise<string | null> {
  try {
    const trustedLanStatus = await loadTrustedLanStatus();
    return trustedLanStatus.shell_url?.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveSpoolQrCompanionShellUrl(
  options: Omit<SpoolQrArtifactsOptions, "spoolId" | "mode"> = {},
  dependencies: SpoolQrArtifactsDependencies = {},
): Promise<string | null> {
  const loadTrustedLanStatus =
    dependencies.loadTrustedLanStatus ?? getTrustedLanCompanionStatus;
  const trustedLanShellUrl = options.clientReadOnly
    ? null
    : await loadTrustedLanShellUrl(loadTrustedLanStatus);

  return resolvePreferredCompanionShellUrl({
    clientReadOnly: options.clientReadOnly,
    clientHostBaseUrl: options.clientHostBaseUrl,
    trustedLanShellUrl,
  });
}

export async function buildSpoolQrArtifacts(
  options: SpoolQrArtifactsOptions,
  dependencies: SpoolQrArtifactsDependencies = {},
): Promise<SpoolQrArtifacts> {
  const buildQrDataUrl = dependencies.buildQrDataUrl ?? buildFilamentLabelQrDataUrl;
  const qrReference = options.spoolId.trim();
  const companionShellUrl = await resolveSpoolQrCompanionShellUrl(options, dependencies);
  const qr = buildFilamentQrPayload(qrReference, {
    mode: options.mode ?? "companion",
    companionShellUrl,
  });
  const qrDataUrl = await buildQrDataUrl(qr.payload);

  return {
    qrReference,
    qrPayload: qr.payload,
    qrDataUrl,
    qrMode: qr.mode,
    qrTarget: qr.target,
    companionShellUrl,
  };
}
