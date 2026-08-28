import { VendorBadge } from "./vendor_badge";
import { CloseButton } from "./close_button";
import {
  InventoryDetailFactCard,
  InventoryDetailTintPanel,
} from "./inventory_detail_fact_card";
import { SwatchSelectionPreviewHeader } from "./swatch_selection_preview";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { useI18n } from "../lib/i18n";
import {
  buildInventorySpoolAmsSighting,
  type InventorySpoolAmsSightingSlot,
} from "../lib/inventory_spool_ams_sighting";
import { isBorrowedInOwnership } from "../lib/inventory_domain";
import {
  formatInventoryOwnershipSummary,
  formatRollReference,
  type InventorySemanticTone,
  type InventorySpool,
} from "../lib/inventory_list_model";
import { formatCaptureTimestamp, formatObservedAge } from "../lib/inventory_rfid_capture";
import { inventorySwatchInsetStyle } from "../lib/inventory_swatch_style";
import { materialTone } from "../lib/material_theme";
import type { ResolvedTheme } from "../lib/theme_mode";
import { formatGrams } from "../lib/weight_display";

type InventorySpoolDetailHeaderProps = {
  displayTitle: string;
  onClose: () => void;
  ownershipLabel: string;
  ownershipTone: InventorySemanticTone;
  spool: InventorySpool;
  statusLabel: string;
  statusTone: InventorySemanticTone;
};

type InventorySpoolIdentityPanelProps = {
  assignedSlot: InventorySpoolDetailAssignedSlot | null;
  locationValue: string;
  rfidBindingMeta: { className: string; hint: string; label: string };
  resolvedTheme: ResolvedTheme;
  spool: InventorySpool;
};

export type InventorySpoolDetailAssignedSlot = InventorySpoolAmsSightingSlot & {
  printerName: string;
};

export function InventorySpoolDetailHeader({
  displayTitle,
  onClose,
  ownershipLabel,
  ownershipTone,
  spool,
  statusLabel,
  statusTone,
}: InventorySpoolDetailHeaderProps) {
  const { locale, t } = useI18n();
  const currentMaterialTone = materialTone(spool.material);

  return (
    <div className="app-modal-header sticky top-0 z-10 flex items-start justify-between gap-4 border-b px-5 py-4 backdrop-blur-xl sm:px-6">
      <SwatchSelectionPreviewHeader
        className="min-w-0 flex-1"
        eyebrow={t("inventory.selectedRoll", "Selected roll")}
        size="large"
        swatchColor={spool.hexColor}
      >
        <div
          className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50"
          title={displayTitle}
        >
          {displayTitle}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <VendorBadge vendor={spool.vendor} compact />
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${currentMaterialTone.badge} ${currentMaterialTone.badgeText}`}
          >
            {spool.material}
          </span>
          <span className={inlineStatusSignalClass(ownershipTone)}>
            {ownershipLabel}
          </span>
        </div>
      </SwatchSelectionPreviewHeader>
      <div className="flex shrink-0 items-start gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          <span className={inlineStatusSignalClass(statusTone, "text-xs")}>
            {statusLabel}
          </span>
          <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatGrams(spool.remainingGrams, "dash", locale)}
          </span>
        </div>
        <CloseButton label={t("common.close", "Close")} onClick={onClose} />
      </div>
    </div>
  );
}

export function InventorySpoolIdentityPanel({
  assignedSlot,
  locationValue,
  rfidBindingMeta,
  resolvedTheme,
  spool,
}: InventorySpoolIdentityPanelProps) {
  const { locale, t } = useI18n();
  const amsSighting = buildInventorySpoolAmsSighting(spool, assignedSlot);
  const spoolBorrowedIn = isBorrowedInOwnership(spool.ownershipType);
  const showRfidBindingHint =
    rfidBindingMeta.hint.trim().length > 0 && amsSighting?.source !== "live_activity";

  return (
    <InventoryDetailTintPanel
      className="p-3.5"
      style={inventorySwatchInsetStyle(spool.hexColor, resolvedTheme)}
    >
      <div className="grid gap-3 min-[760px]:grid-cols-2">
        <InventoryDetailFactCard
          label={t("inventory.reference", "Reference")}
          className="min-[760px]:col-span-2"
        >
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
            {formatRollReference(spool)}
          </div>
          <div className="mt-1 break-all text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            ID: {spool.id}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 break-all text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            <span>RFID: {spool.rfidTag?.trim() || "-"}</span>
            <span className={rfidBindingMeta.className}>{rfidBindingMeta.label}</span>
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            {t("inventory.lastAmsIdentitySeen", "Last AMS sighting")}:{" "}
            {amsSighting
              ? `${formatCaptureTimestamp(amsSighting.observedAt, locale)} (${formatObservedAge(
                amsSighting.observedAt,
                  t,
                )})`
              : "-"}
            {amsSighting?.source === "live_activity" ? (
              <span className={`${inlineStatusSignalClass("success")} ml-2`}>
                {t("inventory.lastAmsSightingLiveActivity", "Live slot")}
              </span>
            ) : null}
          </div>
          {showRfidBindingHint ? (
            <div className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {rfidBindingMeta.hint}
            </div>
          ) : null}
        </InventoryDetailFactCard>
        <InventoryDetailFactCard
          label={
            assignedSlot
              ? t("nav.printers", "Printers")
              : t("inventory.location", "Location")
          }
        >
          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
            {locationValue}
          </div>
          {assignedSlot ? (
            <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              {t(
                "inventory.assignmentManagedOnPrinters",
                "Filament placement and slot assignment is managed on the Printers page.",
              )}
            </div>
          ) : null}
        </InventoryDetailFactCard>
        <InventoryDetailFactCard label={t("inventory.ownership", "Ownership")}>
          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
            {formatInventoryOwnershipSummary(t, spool)}
          </div>
          {spoolBorrowedIn && (spool.ownerContact || spool.ownershipNote) ? (
            <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              {spool.ownerContact ? <div>{spool.ownerContact}</div> : null}
              {spool.ownershipNote ? <div>{spool.ownershipNote}</div> : null}
            </div>
          ) : null}
        </InventoryDetailFactCard>
        <InventoryDetailFactCard label={t("inventory.initialWeight", "Initial weight (g)")}>
          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
            {formatGrams(spool.initialWeightGrams, "dash", locale)}
          </div>
        </InventoryDetailFactCard>
      </div>
    </InventoryDetailTintPanel>
  );
}
