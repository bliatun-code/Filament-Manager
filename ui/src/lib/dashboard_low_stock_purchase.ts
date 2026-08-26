import {
  dashboardPurchaseCandidateKey,
  findOpenPurchaseDuplicate,
  type DashboardOpenPurchaseDuplicate,
  type DashboardPurchaseCandidate,
} from "./dashboard_action_model";
import { resolveClientHostTarget } from "./host_write_target";
import {
  fetchLibrarySyncWishlistItems,
  getLibrarySyncSettings,
  listWishlistItems,
  type CreateWishlistItemInput,
  type LibrarySyncSettings,
  type WishlistItemRow,
} from "./tauri_client";
import {
  createWishlistEntry,
  type WishlistDataSourceOptions,
} from "./wishlist_data_source";

export const DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED =
  "Pair this desktop client with its host before adding a purchase.";
export const DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED =
  "Host connection details are missing for this purchase action.";
export const DASHBOARD_PURCHASE_MODE_UNSUPPORTED =
  "The active library mode is not supported for this purchase action.";

export type DashboardLowStockPurchaseResult =
  | {
      itemId: string;
      kind: "CREATED";
      status: "WISHLIST";
    }
  | ({ kind: "REUSED" } & DashboardOpenPurchaseDuplicate);

type DashboardLowStockPurchaseDependencies = {
  createEntry?: (
    input: CreateWishlistItemInput,
    options: WishlistDataSourceOptions,
  ) => Promise<void>;
  createId?: () => string;
  loadItems?: (options: WishlistDataSourceOptions) => Promise<WishlistItemRow[]>;
  loadSettings?: () => Promise<LibrarySyncSettings>;
};

function defaultWishlistId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return `wish_${randomUuid}`;
  }
  return `wish_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function resolveDashboardPurchaseDataSourceOptions(
  settings: Pick<
    LibrarySyncSettings,
    "mode" | "client_auth_paired" | "host_base_url" | "library_id"
  >,
): WishlistDataSourceOptions {
  const mode = settings.mode.trim().toUpperCase();
  if (mode === "STANDALONE" || mode === "HOST") {
    return { clientReadOnly: false };
  }
  if (mode !== "CLIENT") {
    throw new Error(DASHBOARD_PURCHASE_MODE_UNSUPPORTED);
  }
  if (!settings.client_auth_paired) {
    throw new Error(DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED);
  }
  const hostTarget = resolveClientHostTarget({
    clientHostBaseUrl: settings.host_base_url,
    clientLibraryId: settings.library_id,
  });
  if (!hostTarget) {
    throw new Error(DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED);
  }
  return {
    clientHostBaseUrl: hostTarget.baseUrl,
    clientLibraryId: hostTarget.libraryId,
    clientReadOnly: true,
  };
}

function normalizedCandidateInput(
  id: string,
  candidate: DashboardPurchaseCandidate,
): CreateWishlistItemInput {
  return {
    color_name: candidate.colorName.trim(),
    filament_name: candidate.filamentName.trim(),
    id,
    master_id: candidate.masterId?.trim() || null,
    material: candidate.material.trim(),
    note: null,
    quantity: 1,
    vendor: candidate.vendor.trim() || null,
  };
}

async function loadFreshWishlistItems(
  options: WishlistDataSourceOptions,
): Promise<WishlistItemRow[]> {
  if (options.clientReadOnly) {
    const hostTarget = resolveClientHostTarget(options);
    if (!hostTarget) {
      throw new Error(DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED);
    }
    return fetchLibrarySyncWishlistItems(
      hostTarget.baseUrl,
      hostTarget.libraryId,
      options.limit ?? 500,
    );
  }
  return listWishlistItems(options.limit ?? 500);
}

export function createDashboardLowStockPurchaseCoordinator(
  dependencies: DashboardLowStockPurchaseDependencies = {},
): {
  enqueue: (
    candidate: DashboardPurchaseCandidate,
  ) => Promise<DashboardLowStockPurchaseResult>;
} {
  const loadSettings = dependencies.loadSettings ?? getLibrarySyncSettings;
  const loadItems = dependencies.loadItems ?? loadFreshWishlistItems;
  const createEntry = dependencies.createEntry ?? createWishlistEntry;
  const createId = dependencies.createId ?? defaultWishlistId;
  const inFlight = new Map<string, Promise<DashboardLowStockPurchaseResult>>();

  const enqueue = (
    candidate: DashboardPurchaseCandidate,
  ): Promise<DashboardLowStockPurchaseResult> => {
    const productKey = dashboardPurchaseCandidateKey(candidate);
    const existing = inFlight.get(productKey);
    if (existing) {
      return existing;
    }

    const operation = (async (): Promise<DashboardLowStockPurchaseResult> => {
      const settings = await loadSettings();
      const options = resolveDashboardPurchaseDataSourceOptions(settings);
      const currentItems = await loadItems(options);
      const duplicate = findOpenPurchaseDuplicate(candidate, currentItems);
      if (duplicate) {
        return { ...duplicate, kind: "REUSED" };
      }

      const itemId = createId();
      await createEntry(normalizedCandidateInput(itemId, candidate), options);
      return { itemId, kind: "CREATED", status: "WISHLIST" };
    })();
    inFlight.set(productKey, operation);
    const clear = () => {
      if (inFlight.get(productKey) === operation) {
        inFlight.delete(productKey);
      }
    };
    void operation.then(clear, clear);
    return operation;
  };

  return { enqueue };
}
