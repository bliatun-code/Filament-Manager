import { formatDisplayInteger, type NumberDisplayLocale } from "../lib/number_display";

type TranslateFn = (key: string, fallback: string) => string;

/** Ownership stays explicit without repeating the headline inventory count. */
export function OwnershipSnapshotPanel({ onHand, loadedSlots, onOrder, locale = "en", t }: {
  onHand: { owned: number; borrowedIn: number };
  loadedSlots: number;
  onOrder: string;
  locale?: NumberDisplayLocale;
  t: TranslateFn;
}) {
  const hasBorrowedInStock = onHand.borrowedIn > 0;
  return (
    <footer className="mt-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
      <span>{hasBorrowedInStock ? `${t("dashboard.ownedOnHand", "Owned on hand")}: ${formatDisplayInteger(onHand.owned, locale)} · ${t("dashboard.borrowedInOnHand", "Borrowed in on hand")}: ${formatDisplayInteger(onHand.borrowedIn, locale)}` : t("dashboard.noBorrowedInStock", "No borrowed-in stock")}</span>
      <span>{formatDisplayInteger(loadedSlots, locale)} {t("dashboard.amsLoaded", "slots loaded")} · {onOrder} {t("dashboard.onOrder", "on order")}</span>
    </footer>
  );
}
