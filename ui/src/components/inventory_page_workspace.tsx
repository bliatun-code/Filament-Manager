import { lazy, Suspense, useState, type ComponentProps } from "react";
import { AppModal } from "./app_modal";
import { FeedbackBanner } from "./feedback_banner";
import type { InventoryAddModalProps } from "./inventory_add_modal";
import {
  InventoryControlsPanel,
  InventoryHeaderActions,
} from "./inventory_controls_panel";
import { InventorySpoolCollection } from "./inventory_spool_collection";
import type { InventoryBulkActionsPanelViewProps } from "./inventory_bulk_actions_panel";
import { InventoryLocationManagementPanel } from "./inventory_location_management_panel";
import {
  inventoryModalOverlayClassName,
  inventoryWideModalPanelClassName,
} from "./inventory_modal_chrome";
import {
  InventoryWorkspaceNavigation,
  type InventoryWorkspaceView,
} from "./inventory_workspace_navigation";
import { PageDataFallbackBanner } from "./page_data_fallback_banner";
import { PageLoadErrorBanner } from "./page_load_error_banner";
import { WishlistQueuePanel, type WishlistQueuePanelProps } from "./wishlist_queue_panel";
import { formatDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";
import {
  resolveClientPageFeedbackState,
  type ClientSnapshotSource,
} from "../lib/page_refresh_state";

const InventoryBulkActionsPanelView = lazy(async () => {
  const module = await import("./inventory_bulk_actions_panel");
  return { default: module.InventoryBulkActionsPanelView };
});

const InventoryAddModalView = lazy(async () => {
  const module = await import("./inventory_add_modal");
  return { default: module.InventoryAddModal };
});

function InventoryAddModalBoundary({
  loadingLabel,
  modalProps,
  title,
}: {
  loadingLabel: string;
  modalProps: InventoryAddModalProps;
  title: string;
}) {
  const [returnFocusElement] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  return (
    <Suspense
      fallback={
        <AppModal
          ariaLabel={title}
          closeOnBackdrop
          onBackdropClose={modalProps.onClose}
          overlayClassName={inventoryModalOverlayClassName}
          panelClassName={inventoryWideModalPanelClassName}
          returnFocusElement={returnFocusElement}
        >
          <div
            aria-live="polite"
            className="flex min-h-48 items-center justify-center p-6 text-sm text-slate-600 dark:text-slate-300"
            role="status"
          >
            {loadingLabel}
          </div>
        </AppModal>
      }
    >
      <InventoryAddModalView
        {...modalProps}
        returnFocusElement={returnFocusElement}
      />
    </Suspense>
  );
}

type InventoryPageWorkspaceProps = {
  activeView: InventoryWorkspaceView;
  addModalActive: boolean;
  addModalProps: InventoryAddModalProps;
  bulkActionsProps: InventoryBulkActionsPanelViewProps;
  bulkSelectionTriggerProps: Readonly<{
    active: boolean;
    disabled: boolean;
    onActiveChange: (active: boolean) => void;
  }>;
  clientHostDeviceName: string | null;
  clientInventoryPartial: boolean;
  clientInventorySource: ClientSnapshotSource;
  clientInventoryUpdatedAt: string | null;
  clientReadOnly: boolean;
  collectionProps: Omit<
    ComponentProps<typeof InventorySpoolCollection>,
    | "addSpoolDisabled"
    | "onAddSpool"
    | "onResetFilters"
    | "totalSpoolCount"
  >;
  controlsProps: Omit<
    ComponentProps<typeof InventoryControlsPanel>,
    | "bulkSelectionActive"
    | "bulkSelectionDisabled"
    | "onBulkSelectionActiveChange"
  >;
  error: string | null;
  headerActionsProps: ComponentProps<typeof InventoryHeaderActions>;
  infoMessage: string | null;
  loadError: string | null;
  loadErrorRetryDisabled: boolean;
  loadErrorRetrying: boolean;
  librarySyncReady: boolean;
  loading: boolean;
  locationPanelProps: ComponentProps<typeof InventoryLocationManagementPanel>;
  onActiveViewChange: (view: InventoryWorkspaceView) => void;
  onRetryLoadError: () => void;
  purchaseQueueProps: WishlistQueuePanelProps;
  showRollModal: boolean;
  totalInventoryCount: number;
  totalLocationCount: number;
  totalPurchaseCount: number;
};

export function InventoryPageWorkspace({
  activeView,
  addModalActive,
  addModalProps,
  bulkActionsProps,
  bulkSelectionTriggerProps,
  clientHostDeviceName,
  clientInventoryPartial,
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
  librarySyncReady,
  loading,
  locationPanelProps,
  onActiveViewChange,
  onRetryLoadError,
  purchaseQueueProps,
  showRollModal,
  totalInventoryCount,
  totalLocationCount,
  totalPurchaseCount,
}: InventoryPageWorkspaceProps) {
  const { locale, t } = useI18n();
  const {
    clientDataWarningVisible,
    clientHostWarningVisible,
    clientPartialWarningVisible,
    loadErrorVisible,
  } = resolveClientPageFeedbackState({
    clientReadOnly,
    hasLoadError: Boolean(loadError),
    initialLoadSettled: librarySyncReady && !loading,
    partial: clientInventoryPartial,
    requestPending: loading || loadErrorRetrying,
    source: clientInventorySource,
  });

  return (
    <>
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">
            {activeView === "PURCHASES"
              ? t("inventory.wishlistOrders", "Wishlist & orders")
              : activeView === "LOCATIONS"
                ? t("inventory.locationsTitle", "Locations")
              : t("inventory.title", "Spools")}
          </h1>
          <div className="page-subtitle max-w-2xl">
            {activeView === "PURCHASES"
              ? t(
                  "inventory.wishlistQueueHelp",
                  "Keep planned purchases here, move them to on order, then stock them when they arrive.",
                )
              : activeView === "LOCATIONS"
                ? t(
                    "inventory.locationsHelp",
                    "Names can change while immutable IDs keep roll placement and history stable.",
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
        locationCount={totalLocationCount}
        onViewChange={onActiveViewChange}
        purchaseCount={totalPurchaseCount}
      />

      {activeView === "STOCK" ? (
        <InventoryControlsPanel
          {...controlsProps}
          bulkSelectionActive={bulkSelectionTriggerProps.active}
          bulkSelectionDisabled={bulkSelectionTriggerProps.disabled}
          onBulkSelectionActiveChange={bulkSelectionTriggerProps.onActiveChange}
        />
      ) : null}

      {error && !addModalActive ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}

      {loadErrorVisible && loadError ? (
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

      {clientDataWarningVisible ? (
        <PageDataFallbackBanner
          message={`${clientHostDeviceName ? `${clientHostDeviceName}. ` : ""}${
            clientHostWarningVisible && clientInventorySource === "CACHED"
              ? t(
                  "inventory.clientReadOnlyCached",
                  "Host unavailable. Showing the last cached inventory snapshot.",
                )
              : clientHostWarningVisible
                ? t(
                  "inventory.clientReadOnlyOffline",
                  "Host unavailable and no cached inventory snapshot is available yet.",
                )
                : t("errors.requestFailed", "The request could not be completed.")
          }${
            clientHostWarningVisible && clientInventoryUpdatedAt
              ? ` ${t("inventory.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientInventoryUpdatedAt, locale)}.`
              : ""
          }${
            clientHostWarningVisible && clientPartialWarningVisible
              ? ` ${t("errors.requestFailed", "The request could not be completed.")}`
              : ""
          }`}
          onRetry={onRetryLoadError}
          retryDisabled={loadErrorRetryDisabled}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={loadErrorRetrying}
        />
      ) : null}

      <div className={activeView === "STOCK" ? "mt-4" : "mt-8"}>
        <div
          id="inventory-stock-panel"
          role="region"
          aria-labelledby="inventory-stock-tab"
          hidden={activeView !== "STOCK"}
        >
          {activeView === "STOCK" ? (
            <>
            {bulkActionsProps.active ? (
              <Suspense
                fallback={
                  <div className="surface-subtle p-4 text-sm text-slate-600 dark:text-slate-300" role="status">
                    {t("common.loading", "Loading...")}
                  </div>
                }
              >
                <InventoryBulkActionsPanelView {...bulkActionsProps} />
              </Suspense>
            ) : null}
            <div className={bulkActionsProps.active ? "mt-4" : undefined}>
              <InventorySpoolCollection
                {...collectionProps}
                addSpoolDisabled={headerActionsProps.primaryActionsDisabled}
                onAddSpool={headerActionsProps.onAddSpool}
                onResetFilters={controlsProps.onResetFilters}
                totalSpoolCount={totalInventoryCount}
              />
            </div>
            </>
          ) : null}
        </div>
        <div
          id="inventory-purchases-panel"
          role="region"
          aria-labelledby="inventory-purchases-tab"
          hidden={activeView !== "PURCHASES"}
        >
          {activeView === "PURCHASES" ? (
            <WishlistQueuePanel {...purchaseQueueProps} />
          ) : null}
        </div>
        <div
          id="inventory-locations-panel"
          role="region"
          aria-labelledby="inventory-locations-tab"
          hidden={activeView !== "LOCATIONS"}
        >
          {activeView === "LOCATIONS" ? (
            <InventoryLocationManagementPanel
              {...locationPanelProps}
              showOfflineSourceWarning={
                clientReadOnly &&
                !clientDataWarningVisible &&
                !loadErrorVisible &&
                librarySyncReady &&
                !loading
              }
            />
          ) : null}
        </div>

        {addModalActive ? (
          <InventoryAddModalBoundary
            loadingLabel={t("common.loading", "Loading...")}
            modalProps={addModalProps}
            title={
              addModalProps.purpose === "PURCHASE"
                ? t("inventory.addToWishlist", "Add to wishlist / order")
                : t("inventory.addFilament", "Add filament")
            }
          />
        ) : null}
      </div>
    </>
  );
}
