import type { ComponentProps } from "react";
import { FeedbackBanner } from "./feedback_banner";
import { InventoryAddModal, type InventoryAddModalProps } from "./inventory_add_modal";
import {
  InventoryControlsPanel,
  InventoryHeaderActions,
} from "./inventory_controls_panel";
import { InventorySpoolCollection } from "./inventory_spool_collection";
import {
  InventoryWorkspaceNavigation,
  type InventoryWorkspaceView,
} from "./inventory_workspace_navigation";
import { PageLoadErrorBanner } from "./page_load_error_banner";
import { WishlistQueuePanel, type WishlistQueuePanelProps } from "./wishlist_queue_panel";
import { formatDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";

type InventoryPageWorkspaceProps = {
  activeView: InventoryWorkspaceView;
  addModalActive: boolean;
  addModalProps: InventoryAddModalProps;
  clientHostDeviceName: string | null;
  clientInventorySource: string | null;
  clientInventoryUpdatedAt: string | null;
  clientReadOnly: boolean;
  collectionProps: Omit<
    ComponentProps<typeof InventorySpoolCollection>,
    | "addSpoolDisabled"
    | "onAddSpool"
    | "onResetFilters"
    | "totalSpoolCount"
  >;
  controlsProps: ComponentProps<typeof InventoryControlsPanel>;
  error: string | null;
  headerActionsProps: ComponentProps<typeof InventoryHeaderActions>;
  infoMessage: string | null;
  loadError: string | null;
  loadErrorRetryDisabled: boolean;
  loadErrorRetrying: boolean;
  onActiveViewChange: (view: InventoryWorkspaceView) => void;
  onRetryLoadError: () => void;
  purchaseQueueProps: WishlistQueuePanelProps;
  showRollModal: boolean;
  totalInventoryCount: number;
  totalPurchaseCount: number;
};

export function InventoryPageWorkspace({
  activeView,
  addModalActive,
  addModalProps,
  clientHostDeviceName,
  clientInventorySource,
  clientInventoryUpdatedAt,
  clientReadOnly,
  collectionProps,
  controlsProps,
  error,
  headerActionsProps,
  infoMessage,
  loadError,
  loadErrorRetryDisabled,
  loadErrorRetrying,
  onActiveViewChange,
  onRetryLoadError,
  purchaseQueueProps,
  showRollModal,
  totalInventoryCount,
  totalPurchaseCount,
}: InventoryPageWorkspaceProps) {
  const { locale, t } = useI18n();

  return (
    <>
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">
            {activeView === "PURCHASES"
              ? t("inventory.wishlistOrders", "Wishlist & orders")
              : t("inventory.title", "Spools")}
          </h1>
          <div className="page-subtitle max-w-2xl">
            {activeView === "PURCHASES"
              ? t(
                  "inventory.wishlistQueueHelp",
                  "Keep planned purchases here, move them to on order, then stock them when they arrive.",
                )
              : t(
                  "inventory.subtitle",
                  "Track stock, assignments, loans and weight updates from one clear workspace.",
                )}
          </div>
        </div>
        <InventoryHeaderActions {...headerActionsProps} />
      </div>

      <InventoryWorkspaceNavigation
        activeView={activeView}
        inventoryCount={totalInventoryCount}
        onViewChange={onActiveViewChange}
        purchaseCount={totalPurchaseCount}
      />

      {activeView === "STOCK" ? <InventoryControlsPanel {...controlsProps} /> : null}

      {error && !addModalActive ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}

      {loadError ? (
        <PageLoadErrorBanner
          message={loadError}
          onRetry={onRetryLoadError}
          retryDisabled={loadErrorRetryDisabled}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={loadErrorRetrying}
        />
      ) : null}

      {!error && infoMessage && !addModalActive && !showRollModal ? (
        <FeedbackBanner tone="success" className="mt-4">
          {infoMessage}
        </FeedbackBanner>
      ) : null}

      {clientReadOnly && clientInventorySource !== "LIVE" ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {clientHostDeviceName ? `${clientHostDeviceName}. ` : null}
          {clientInventorySource === "CACHED"
            ? t(
                "inventory.clientReadOnlyCached",
                "Host unavailable. Showing the last cached inventory snapshot.",
              )
            : t(
                "inventory.clientReadOnlyOffline",
                "Host unavailable and no cached inventory snapshot is available yet.",
              )}
          {clientInventoryUpdatedAt
            ? ` ${t("inventory.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientInventoryUpdatedAt, locale)}.`
            : null}
        </FeedbackBanner>
      ) : null}

      <div className="mt-8">
        {activeView === "STOCK" ? (
          <div
            id="inventory-stock-panel"
            role="region"
            aria-labelledby="inventory-stock-tab"
          >
            <InventorySpoolCollection
              {...collectionProps}
              addSpoolDisabled={headerActionsProps.primaryActionsDisabled}
              onAddSpool={headerActionsProps.onAddSpool}
              onResetFilters={controlsProps.onResetFilters}
              totalSpoolCount={totalInventoryCount}
            />
          </div>
        ) : (
          <div
            id="inventory-purchases-panel"
            role="region"
            aria-labelledby="inventory-purchases-tab"
          >
            <WishlistQueuePanel {...purchaseQueueProps} />
          </div>
        )}

        <InventoryAddModal {...addModalProps} />
      </div>
    </>
  );
}
