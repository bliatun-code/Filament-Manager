import {
  getTrustedLanCompanionStatus,
  listTrustedLanInterfaces,
  listTrustedLanPairedBrowsers,
  type TrustedLanCompanionStatus,
  type TrustedLanInterfaceOption,
  type TrustedLanPairedBrowser,
} from "./tauri_client";

type TrustedLanSettingsDataDependencies = {
  loadStatus?: typeof getTrustedLanCompanionStatus;
  loadInterfaces?: typeof listTrustedLanInterfaces;
  loadPairedBrowsers?: typeof listTrustedLanPairedBrowsers;
};

export type TrustedLanSettingsData = {
  status: TrustedLanCompanionStatus | null;
  interfaces: TrustedLanInterfaceOption[];
  pairedBrowsers: TrustedLanPairedBrowser[];
  statusError: unknown | null;
  interfacesError: unknown | null;
  pairedBrowsersError: unknown | null;
};

export async function loadTrustedLanSettingsData(
  dependencies: TrustedLanSettingsDataDependencies = {},
): Promise<TrustedLanSettingsData> {
  const loadStatus = dependencies.loadStatus ?? getTrustedLanCompanionStatus;
  const loadInterfaces = dependencies.loadInterfaces ?? listTrustedLanInterfaces;
  const loadPairedBrowsers =
    dependencies.loadPairedBrowsers ?? listTrustedLanPairedBrowsers;

  const [statusResult, interfacesResult, pairedBrowsersResult] =
    await Promise.allSettled([
      loadStatus(),
      loadInterfaces(),
      loadPairedBrowsers(),
    ]);

  return {
    status: statusResult.status === "fulfilled" ? statusResult.value : null,
    interfaces:
      interfacesResult.status === "fulfilled" ? interfacesResult.value : [],
    pairedBrowsers:
      pairedBrowsersResult.status === "fulfilled" ? pairedBrowsersResult.value : [],
    statusError: statusResult.status === "rejected" ? statusResult.reason : null,
    interfacesError:
      interfacesResult.status === "rejected" ? interfacesResult.reason : null,
    pairedBrowsersError:
      pairedBrowsersResult.status === "rejected" ? pairedBrowsersResult.reason : null,
  };
}
