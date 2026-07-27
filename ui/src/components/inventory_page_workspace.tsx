import type { ComponentProps } from "react";
import { FeedbackBanner } from "./feedback_banner";
import { InventoryAddModal, type InventoryAddModalProps } from "./inventory_add_modal";
import {
  InventoryControlsPanel,
  InventoryHeaderActions,
} from "./inventory_controls_panel";
import { InventorySpoolCollection } from "./inventory_spool_collection";
import { PageLoadErrorBanner } from "./page_load_error_banner";
import { formatDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";

type InventoryPageWorkspaceProps = {
  addModalActive: boolean;
  addModalProps: InventoryAddModalProps;
  clientHostDeviceName: string | null;
  clientInventorySource: string | null;
  clientInventoryUpdatedAt: string | null;
  clientReadOnly: boolean;
  collectionProps: ComponentProps<typeof InventorySpoolCollection>;
  controlsProps: ComponentProps<typeof InventoryControlsPanel>;
  error: string | null;
  headerActionsProps: ComponentProps<typeof InventoryHeaderActions>;
  infoMessage: string | null;
  loadError: string | null;
  loadErrorRetryDisabled: boolean;
  loadErrorRetrying: boolean;
  onRetryLoadError: () => void;
  showRollModal: boolean;
};

export function InventoryPageWorkspace({
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
  onRetryLoadError,
  showRollModal,
}: InventoryPageWorkspaceProps) {
  const { locale, t } = useI18n();

  return (
    <>
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("inventory.title", "Spools")}</h1>
          <div className="page-subtitle max-w-2xl">
            {t(
              "inventory.subtitle",
              "Track stock, assignments, loans and weight updates from one clear workspace.",
            )}
          </div>
        </div>
        <InventoryHeaderActions {...headerActionsProps} />
      </div>

      <InventoryControlsPanel {...controlsProps} />

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
        <InventorySpoolCollection {...collectionProps} />

        <InventoryAddModal {...addModalProps} />
      </div>
    </>
  );
}
