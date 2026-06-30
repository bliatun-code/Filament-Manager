import { VendorBadge } from "./vendor_badge";
import { CloseButton } from "./close_button";
import { inventoryDetailLabelClassName } from "./inventory_detail_panel_class";
import { modalEyebrowClassName } from "./modal_chrome";
import { inlineStatusSignalClass } from "../lib/chip_styles";
import { swatchCssBackground } from "../lib/color_utils";
import { useI18n } from "../lib/i18n";
import {
  buildInventorySpoolAmsSighting,
  type InventorySpoolAmsSightingSlot,
} from "../lib/inventory_spool_ams_sighting";
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
  const { t } = useI18n();
  const currentMaterialTone = materialTone(spool.material);

  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200/80 bg-white/88 px-5 py-4 backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-950/88 sm:px-6">
      <div className="flex min-w-0 items-start gap-3.5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/60 p-2 shadow-sm shadow-slate-200/20 dark:border-white/10 dark:bg-slate-950/30 dark:shadow-none">
          <span
            className="h-full w-full rounded-xl border border-white/70 shadow-inner shadow-black/5 dark:border-white/10 dark:shadow-none"
            style={{
              background: swatchCssBackground(spool.hexColor),
            }}
          />
        </div>
        <div className="min-w-0">
          <div className={modalEyebrowClassName}>
            {t("inventory.selectedRoll", "Selected roll")}
          </div>
          <div className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
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
        </div>
      </div>
      <div className="flex shrink-0 items-start gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          <span className={inlineStatusSignalClass(statusTone, "text-xs")}>
            {statusLabel}
          </span>
          <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatGrams(spool.remainingGrams)}
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
  const amsSightingHint =
    amsSighting?.source === "live_activity"
      ? t(
          "inventory.rfidRegisteredLiveActivityHint",
          "RFID remains tied to this Bambu roll. Because the roll is assigned to a loaded or active AMS slot, this sighting uses the printer's latest live AMS update when no newer RFID identity timestamp is available.",
        )
      : rfidBindingMeta.hint;

  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
      style={inventorySwatchInsetStyle(spool.hexColor, resolvedTheme)}
    >
      <div className="grid gap-3 min-[760px]:grid-cols-2 2xl:grid-cols-3">
        <div className="rounded-xl border border-white/70 bg-white/70 px-3.5 py-3 shadow-sm shadow-slate-900/5 min-[760px]:col-span-2 2xl:col-span-1 dark:border-white/10 dark:bg-slate-950/25 dark:shadow-none">
          <div className={inventoryDetailLabelClassName}>
            {t("inventory.reference", "Reference")}
          </div>
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
                  locale,
                )})`
              : "-"}
            {amsSighting?.source === "live_activity" ? (
              <span className={`${inlineStatusSignalClass("success")} ml-2`}>
                {t("inventory.lastAmsSightingLiveActivity", "Live slot")}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {amsSightingHint}
          </div>
        </div>
        <div className="rounded-xl border border-white/70 bg-white/70 px-3.5 py-3 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/25 dark:shadow-none">
          <div className={inventoryDetailLabelClassName}>
            {assignedSlot
              ? t("nav.printers", "Printers")
              : t("inventory.location", "Location")}
          </div>
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
        </div>
        <div className="rounded-xl border border-white/70 bg-white/70 px-3.5 py-3 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/25 dark:shadow-none">
          <div className={inventoryDetailLabelClassName}>
            {t("inventory.ownership", "Ownership")}
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
            {formatInventoryOwnershipSummary(t, spool)}
          </div>
          {spool.ownershipType === "BORROWED_IN" &&
          (spool.ownerContact || spool.ownershipNote) ? (
            <div className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              {spool.ownerContact ? <div>{spool.ownerContact}</div> : null}
              {spool.ownershipNote ? <div>{spool.ownershipNote}</div> : null}
            </div>
          ) : null}
        </div>
        <div className="rounded-xl border border-white/70 bg-white/70 px-3.5 py-3 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/25 dark:shadow-none">
          <div className={inventoryDetailLabelClassName}>
            {t("inventory.initialWeight", "Initial weight (g)")}
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
            {formatGrams(spool.initialWeightGrams)}
          </div>
        </div>
      </div>
    </div>
  );
}
