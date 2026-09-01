import type { MasterCatalogRow } from "../lib/tauri_client";

export type SettingsCatalogLoadStatus =
  | "pending"
  | "available"
  | "unavailable";

export type SettingsCatalogDataState = {
  dataSourceIdentity: string | null;
  loadStatus: SettingsCatalogLoadStatus;
  rows: MasterCatalogRow[];
};

export type SettingsCatalogDataSourceIdentityInput = {
  clientReadOnly: boolean;
  hostBaseUrl: string | null | undefined;
  hostWritePaired: boolean;
  libraryId: string | null | undefined;
  targetGeneration: number | null | undefined;
};

export type SettingsCatalogDataEvent =
  | {
      type: "target";
      dataSourceIdentity: string;
    }
  | {
      type: "reload";
      available: boolean;
      dataSourceIdentity: string;
      rows: MasterCatalogRow[];
    };

export function createSettingsCatalogDataState(): SettingsCatalogDataState {
  return {
    dataSourceIdentity: null,
    loadStatus: "pending",
    rows: [],
  };
}

export function buildSettingsCatalogDataSourceIdentity({
  clientReadOnly,
  hostBaseUrl,
  hostWritePaired,
  libraryId,
  targetGeneration,
}: SettingsCatalogDataSourceIdentityInput): string {
  return [
    clientReadOnly ? "client" : "local",
    hostBaseUrl?.trim() ?? "",
    libraryId?.trim() ?? "",
    Number.isSafeInteger(targetGeneration)
      ? String(targetGeneration)
      : "unresolved-generation",
    hostWritePaired ? "paired" : "unpaired",
  ].join(":");
}

export function reduceSettingsCatalogData(
  current: SettingsCatalogDataState,
  event: SettingsCatalogDataEvent,
): SettingsCatalogDataState {
  if (event.type === "target") {
    if (current.dataSourceIdentity === event.dataSourceIdentity) {
      return current;
    }
    return {
      dataSourceIdentity: event.dataSourceIdentity,
      loadStatus: "pending",
      rows: [],
    };
  }

  if (current.dataSourceIdentity !== event.dataSourceIdentity) {
    return current;
  }

  if (!event.available) {
    return current.loadStatus === "available"
      ? current
      : {
          ...current,
          loadStatus: "unavailable",
        };
  }

  return {
    dataSourceIdentity: current.dataSourceIdentity,
    loadStatus: "available",
    rows: event.rows,
  };
}


/**
 * Commits a completed page load against the source identity resolved by that load.
 * The caller must first reject superseded request tokens. This transition is what
 * lets the initial unresolved Settings render become the persisted Host/local
 * target without briefly discarding the valid response it just received.
 */
export function commitResolvedSettingsCatalogData(
  current: SettingsCatalogDataState,
  event: Extract<SettingsCatalogDataEvent, { type: "reload" }>,
): SettingsCatalogDataState {
  return reduceSettingsCatalogData(
    reduceSettingsCatalogData(current, {
      type: "target",
      dataSourceIdentity: event.dataSourceIdentity,
    }),
    event,
  );
}
