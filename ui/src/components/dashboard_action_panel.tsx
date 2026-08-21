import type {
  DashboardActionItem,
  DashboardLowStockAction,
} from "../lib/dashboard_action_model";
import { formatDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";
import { formatInventoryDisplayTitle } from "../lib/inventory_list_model";
import { formatLoanExpectedReturnDate } from "../lib/loan_due_state";
import type { WishlistStatus } from "../lib/wishlist_data_source";
import { formatGrams } from "../lib/weight_display";
import { PageHeaderButton } from "./page_header_button";

type DashboardActionPanelProps = {
  busyIds?: ReadonlySet<string>;
  error?: string | null;
  items: DashboardActionItem[];
  message?: string | null;
  onOpenBambuLiveSettings?: (printerId: string) => void;
  onOpenLoans?: () => void;
  onOpenLowStock?: () => void;
  onOpenPurchases?: (status: Extract<WishlistStatus, "WISHLIST" | "ON_ORDER">) => void;
  onQueueLowStock?: (item: DashboardLowStockAction) => void;
};

function itemTitle(item: DashboardActionItem): string {
  if (item.kind === "LOW_STOCK") {
    return formatInventoryDisplayTitle(
      item.candidate.material,
      item.candidate.filamentName,
      item.candidate.colorName,
    );
  }
  if (item.kind === "BAMBU_TRUST") {
    return item.printerName;
  }
  return formatInventoryDisplayTitle(
    item.material,
    item.filamentName,
    item.colorName,
  );
}

function actionToneClassName(kind: DashboardActionItem["kind"]): string {
  if (kind === "OVERDUE_LOAN") {
    return "border-rose-200/90 bg-rose-50/60 dark:border-rose-400/25 dark:bg-rose-500/[0.08]";
  }
  if (kind === "LOW_STOCK") {
    return "border-amber-200/90 bg-amber-50/60 dark:border-amber-400/25 dark:bg-amber-500/[0.08]";
  }
  if (kind === "ON_ORDER") {
    return "border-sky-200/90 bg-sky-50/60 dark:border-sky-400/25 dark:bg-sky-500/[0.08]";
  }
  return "border-violet-200/90 bg-violet-50/60 dark:border-violet-400/25 dark:bg-violet-500/[0.08]";
}

export function DashboardActionPanel({
  busyIds = new Set<string>(),
  error = null,
  items,
  message = null,
  onOpenBambuLiveSettings,
  onOpenLoans,
  onOpenLowStock,
  onOpenPurchases,
  onQueueLowStock,
}: DashboardActionPanelProps) {
  const { locale, t } = useI18n();

  const ageLabel = (item: DashboardActionItem): string => {
    if (item.age.basis === "EXPECTED_RETURN_AT") {
      return `${t("loans.expectedReturn", "Expected return")}: ${formatLoanExpectedReturnDate(
        item.age.value,
        locale,
      )} · ${t("loans.overdue", "Overdue")} ${item.age.elapsedDays} ${t(
        "common.daysShort",
        "d",
      )}`;
    }
    if (item.age.basis === "UPDATED_AT") {
      return `${t("inventory.lastUpdated", "Last updated")}: ${formatDateTime(
        item.age.value,
        locale,
      )} · ${t("common.daysAgo", "{count} days ago", {
        count: item.age.elapsedDays,
      })}`;
    }
    if (item.age.basis === "CREATED_AT") {
      return `${t("dashboard.actionCreatedAt", "Created")}: ${formatDateTime(
        item.age.value,
        locale,
      )} · ${t("common.daysAgo", "{count} days ago", {
        count: item.age.elapsedDays,
      })}`;
    }
    return t(
      "dashboard.actionSnapshotAgeUnknown",
      "Start time unknown · detected in this snapshot",
    );
  };

  const reason = (item: DashboardActionItem): string => {
    if (item.kind === "LOW_STOCK") {
      return t(
        "dashboard.actionLowStockReason",
        "{count, plural, one {# spool} other {# spools}} at or below the threshold; lowest is {remaining} of {threshold}.",
        {
          count: item.spoolCount,
          remaining: formatGrams(item.lowestRemainingG, "zero", locale),
          threshold: formatGrams(item.thresholdG, "zero", locale),
        },
      );
    }
    if (item.kind === "OVERDUE_LOAN") {
      return t(
        "dashboard.actionOverdueReason",
        "The active loan to {name} is past its expected return date.",
        { name: item.borrowerName },
      );
    }
    if (item.kind === "ON_ORDER") {
      return t(
        "dashboard.actionOnOrderReason",
        "{count, plural, one {# spool is} other {# spools are}} on order and ready to receive from Purchases.",
        { count: item.quantity },
      );
    }
    return t(
      "dashboard.bambuLiveAttentionBody",
      "{name} is no longer Live until you review and trust the printer identity.",
      { name: item.printerName },
    );
  };

  return (
    <section
      aria-labelledby="dashboard-action-required-title"
      aria-live="polite"
      className="mt-6 surface-card"
      data-testid="dashboard-action-required"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className="section-eyebrow"
            id="dashboard-action-required-title"
          >
            {t("dashboard.actionRequiredTitle", "Requires action")}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "dashboard.actionRequiredHint",
              "Resolve low stock, overdue loans, incoming purchases and printer trust issues from one place.",
            )}
          </p>
        </div>
        <span className="rounded-full border border-slate-300/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700/70 dark:bg-slate-950/55 dark:text-slate-300">
          {items.length}
        </span>
      </div>

      {error ? (
        <div
          className="mt-4 rounded-lg border border-rose-300/80 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/35 dark:text-rose-200"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {message ? (
        <div
          className="mt-4 rounded-lg border border-emerald-300/80 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-200"
          role="status"
        >
          {message}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300/80 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {t("dashboard.noAlerts", "No alerts")}
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const busy = busyIds.has(item.id);
            return (
              <li key={item.id}>
                <article
                  className={`flex h-full flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${actionToneClassName(
                    item.kind,
                  )}`}
                  data-action-kind={item.kind}
                >
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                      {itemTitle(item)}
                    </h3>
                    <p className="mt-1 text-sm leading-5 text-slate-700 dark:text-slate-200">
                      {reason(item)}
                    </p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {ageLabel(item)}
                    </p>
                  </div>
                  <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
                    {item.kind === "LOW_STOCK" ? (
                      <>
                        <PageHeaderButton
                          disabled={busy}
                          onClick={() => onQueueLowStock?.(item)}
                          responsive={false}
                          variant="primary"
                        >
                          {busy
                            ? t("common.loading", "Loading...")
                            : item.duplicate
                              ? t("inventory.wishlistOrders", "Wishlist & orders")
                              : t("inventory.addToWishlist", "Add to wishlist / order")}
                        </PageHeaderButton>
                        <PageHeaderButton
                          disabled={busy}
                          onClick={() => onOpenLowStock?.()}
                          responsive={false}
                          variant="soft"
                        >
                          {t("inventory.lowStockFilter", "Low stock")}
                        </PageHeaderButton>
                      </>
                    ) : item.kind === "OVERDUE_LOAN" ? (
                      <PageHeaderButton
                        onClick={() => onOpenLoans?.()}
                        responsive={false}
                        variant="primary"
                      >
                        {t("nav.loans", "Loans")}
                      </PageHeaderButton>
                    ) : item.kind === "ON_ORDER" ? (
                      <PageHeaderButton
                        onClick={() => onOpenPurchases?.("ON_ORDER")}
                        responsive={false}
                        variant="primary"
                      >
                        {t("inventory.wishlistOrders", "Wishlist & orders")}
                      </PageHeaderButton>
                    ) : (
                      <PageHeaderButton
                        onClick={() => onOpenBambuLiveSettings?.(item.printerId)}
                        responsive={false}
                        variant="primary"
                      >
                        {t("dashboard.openBambuLiveSettings", "Open Live settings")}
                      </PageHeaderButton>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
