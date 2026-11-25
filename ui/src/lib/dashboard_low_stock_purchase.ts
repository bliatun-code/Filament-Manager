import {
  dashboardPurchaseCandidateKey,
  DASHBOARD_PURCHASE_CLIENT_PAIRING_REQUIRED,
  DASHBOARD_PURCHASE_HOST_TARGET_REQUIRED,
  DASHBOARD_PURCHASE_TARGET_CHANGED,
  type DashboardPurchaseCandidate,
} from "./dashboard_action_model";
import { resolveClientHostTarget } from "./host_write_target";
import {
  ensureDashboardPurchase,
  type DashboardPurchaseResult,
  getLibrarySyncPageStatus,
  matchesWishlistPurchaseTarget,
  type CreateWishlistItemInput,
  type LibrarySyncPageStatus,
  type WishlistPurchaseTarget,
} from "./tauri_client";
import type { WishlistDataSourceOptions } from "./wishlist_data_source";

export const DASHBOARD_PURCHASE_MODE_UNSUPPORTED =
  "The active library mode is not supported for this purchase action.";

type DashboardLowStockPurchaseDependencies = {
  ensurePurchase?: typeof ensureDashboardPurchase;
  createId?: () => string;
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

export function createDashboardLowStockPurchaseCoordinator(
  dependencies: DashboardLowStockPurchaseDependencies = {},
) {
  const loadStatus = dependencies.loadStatus ?? getLibrarySyncPageStatus;
  const ensurePurchase = dependencies.ensurePurchase ?? ensureDashboardPurchase;
  const createId = dependencies.createId ?? defaultWishlistId;
  const inFlight = new Map<string, Promise<DashboardPurchaseResult>>();

  const checkedOptions = async (target: WishlistPurchaseTarget): Promise<WishlistDataSourceOptions> => {
    const status = await loadStatus();
    if (!matchesWishlistPurchaseTarget(status, target)) {
      throw new Error(DASHBOARD_PURCHASE_TARGET_CHANGED);
    }
    return resolveDashboardPurchaseDataSourceOptions(status);
  };

  const enqueue = (
    candidate: DashboardPurchaseCandidate,
    target: WishlistPurchaseTarget | undefined,
  ): Promise<DashboardPurchaseResult> => {
    if (!target) return Promise.reject(new Error(DASHBOARD_PURCHASE_TARGET_CHANGED));
    const productKey = JSON.stringify([
      target.mode, target.host_base_url, target.library_id, target.target_generation, dashboardPurchaseCandidateKey(candidate),
    ]);
    const existing = inFlight.get(productKey);
    if (existing) {
      return existing;
    }

    const operation = (async (): Promise<DashboardPurchaseResult> => {
      await checkedOptions(target);
      return ensurePurchase(normalizedCandidateInput(createId(), candidate), target);
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
