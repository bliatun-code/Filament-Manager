import type {
  DashboardActionItem,
  DashboardLowStockAction,
} from "../lib/dashboard_action_model";
import { formatDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";
import { formatInventoryDisplayTitle } from "../lib/inventory_list_model";
import { formatLoanExpectedReturnDate } from "../lib/loan_due_state";
import type { WishlistStatus } from "../lib/wishlist_data_source";
import { PageHeaderButton } from "./page_header_button";

type DashboardPriorityAction = Exclude<
  DashboardActionItem,
  DashboardLowStockAction
>;

type DashboardActionPanelProps = {
  items: DashboardPriorityAction[];
  onOpenBambuLiveSettings?: (printerId: string) => void;
  onOpenLoans?: () => void;
  onOpenPurchases?: (
    status: Extract<WishlistStatus, "WISHLIST" | "ON_ORDER">,
  ) => void;
};

function itemTitle(item: DashboardPriorityAction): string {
  if (item.kind === "BAMBU_TRUST") {
    return item.printerName;
  }
  return formatInventoryDisplayTitle(
    item.material,
    item.filamentName,
    item.colorName,
  );
}

function actionToneClassName(kind: DashboardPriorityAction["kind"]): string {
  if (kind === "OVERDUE_LOAN") {
    return "bg-rose-50/60 dark:bg-rose-500/[0.08]";
  }
  if (kind === "ON_ORDER") {
    return "bg-sky-50/60 dark:bg-sky-500/[0.08]";
  }
  return "bg-violet-50/60 dark:bg-violet-500/[0.08]";
}

export function DashboardActionPanel({
  items,
  onOpenBambuLiveSettings,
  onOpenLoans,
  onOpenPurchases,
}: DashboardActionPanelProps) {
  const { locale, t } = useI18n();

  if (items.length === 0) {
    return null;
  }

  const ageLabel = (item: DashboardPriorityAction): string => {
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

  const reason = (item: DashboardPriorityAction): string => {
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
              "Follow up overdue loans, incoming purchases and printer trust issues.",
            )}
          </p>
        </div>
        <span className="rounded-full border border-slate-300/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700/70 dark:bg-slate-950/55 dark:text-slate-300">
          {items.length}
        </span>
      </div>

      <ul className="mt-4 overflow-hidden rounded-xl border border-slate-200/90 divide-y divide-slate-200/90 dark:border-slate-700/80 dark:divide-slate-700/80">
        {items.map((item) => (
          <li key={item.id}>
            <article
              className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${actionToneClassName(
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
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {ageLabel(item)}
                </p>
              </div>
              <div className="shrink-0">
                {item.kind === "OVERDUE_LOAN" ? (
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
                    onClick={() =>
                      onOpenBambuLiveSettings?.(item.printerId)
                    }
                    responsive={false}
                    variant="primary"
                  >
                    {t(
                      "dashboard.openBambuLiveSettings",
                      "Open Live settings",
                    )}
                  </PageHeaderButton>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
