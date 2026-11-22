import {
  dashboardPurchaseCandidateKey,
  DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED,
  DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED,
  DASHBOARD_PURCHASE_TARGET_CHANGED,
  findOpenPurchaseDuplicate,
  type DashboardOpenPurchaseDuplicate,
  type DashboardPurchaseCandidate,
} from "./dashboard_action_model";
import { resolveClientHostTarget } from "./host_write_target";
import {
  fetchLibrarySyncWishlistItems,
  getLibrarySyncPageStatus,
  listWishlistItems,
  type CreateWishlistItemInput,
  type LibrarySyncPageStatus,
  type WishlistPurchaseTarget,
  type WishlistItemRow,
} from "./tauri_client";
import {
  createWishlistEntry,
  type WishlistDataSourceOptions,
} from "./wishlist_data_source";

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
  loadStatus?: typeof getLibrarySyncPageStatus;
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
    LibrarySyncPageStatus,
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
      options.reviewedTarget?.target_generation,
    );
  }
  return listWishlistItems(options.limit ?? 500);
}

export function createDashboardLowStockPurchaseCoordinator(
  dependencies: DashboardLowStockPurchaseDependencies = {},
) {
  const loadStatus = dependencies.loadStatus ?? getLibrarySyncPageStatus;
  const loadItems = dependencies.loadItems ?? loadFreshWishlistItems;
  const createEntry = dependencies.createEntry ?? createWishlistEntry;
  const createId = dependencies.createId ?? defaultWishlistId;
  const inFlight = new Map<string, Promise<DashboardLowStockPurchaseResult>>();

  const checkedOptions = async (target: WishlistPurchaseTarget): Promise<WishlistDataSourceOptions> => {
    const status = await loadStatus();
    if (status.mode !== target.mode || status.library_id.trim() !== target.library_id ||
        (status.host_base_url ?? null) !== target.host_base_url || status.target_generation !== target.target_generation) {
      throw new Error(DASHBOARD_PURCHASE_TARGET_CHANGED);
    }
    return resolveDashboardPurchaseDataSourceOptions(status);
  };

  const enqueue = (
    candidate: DashboardPurchaseCandidate,
    target: WishlistPurchaseTarget | undefined,
  ): Promise<DashboardLowStockPurchaseResult> => {
    if (!target) return Promise.reject(new Error(DASHBOARD_PURCHASE_TARGET_CHANGED));
    const productKey = JSON.stringify([
      target.mode, target.host_base_url, target.library_id, target.target_generation, dashboardPurchaseCandidateKey(candidate),
    ]);
    const existing = inFlight.get(productKey);
    if (existing) {
      return existing;
    }

    const operation = (async (): Promise<DashboardLowStockPurchaseResult> => {
      const options = { ...await checkedOptions(target), reviewedTarget: target };
      const currentItems = await loadItems(options);
      await checkedOptions(target);
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

  return {
    enqueue,
    isTargetCurrent: (target: WishlistPurchaseTarget) => checkedOptions(target).then(() => true, () => false),
  };
}
