import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import type { TranslateFn } from "../lib/statistics_model";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { InventoryOverview, PrinterOverviewRow } from "../lib/tauri_client";
import { StatisticsEmptyState, SummaryMetricTile } from "./statistics_primitives";
import { statisticsInteractiveCardClass } from "./statistics_view_helpers";

function OwnershipMetricTile({
  label,
  lowStock = false,
  ownership,
  value,
}: {
  label: string;
  lowStock?: boolean;
  ownership: "owned" | "borrowed";
  value: string;
}) {
  const surfaceClass = lowStock
    ? "border-rose-200/80 bg-rose-50/65 dark:border-rose-400/25 dark:bg-rose-500/10"
    : "border-slate-200/85 bg-white/72 dark:border-slate-700 dark:bg-slate-950/38";
  const markerClass =
    ownership === "owned"
      ? "bg-slate-600 dark:bg-slate-300"
      : "border-2 border-slate-500 bg-transparent dark:border-slate-400";

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${surfaceClass}`}
      data-ownership={ownership}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${markerClass}`} />
        <span>{label}</span>
      </div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">
        {value}
      </div>
    </div>
  );
}

export function StatisticsOwnershipSnapshotPanel({
  ownershipOverview,
  t,
}: {
  ownershipOverview: InventoryOverview | null;
  t: TranslateFn;
}) {
  return (
    <div className="content-section surface-card">
      <div>
        <div className="section-eyebrow">
          {t("statistics.ownershipSnapshot", "Ownership snapshot")}
        </div>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {t(
            "statistics.ownershipSnapshotHint",
            "Additive ownership split for on-hand stock and recorded print usage. The headline cards above still show the combined totals.",
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <OwnershipMetricTile
          key={`owned-on-hand-${ownershipOverview?.total_owned_spools ?? 0}`}
          label={t("statistics.ownedOnHand", "Owned on hand")}
          value={(ownershipOverview?.total_owned_spools ?? 0).toString()}
          ownership="owned"
        />
        <OwnershipMetricTile
          key={`borrowed-on-hand-${ownershipOverview?.total_borrowed_in_spools ?? 0}`}
          label={t("statistics.borrowedInOnHand", "Borrowed in on hand")}
          value={(ownershipOverview?.total_borrowed_in_spools ?? 0).toString()}
          ownership="borrowed"
        />
        <OwnershipMetricTile
          key={`owned-consumption-${ownershipOverview?.owned_consumption_30d ?? 0}`}
          label={t("statistics.ownedPrintUsage30d", "Recorded print use · owned")}
          value={`${ownershipOverview?.owned_consumption_30d ?? 0} g`}
          ownership="owned"
        />
        <OwnershipMetricTile
          key={`borrowed-consumption-${ownershipOverview?.borrowed_in_consumption_30d ?? 0}`}
          label={t(
            "statistics.borrowedInPrintUsage30d",
            "Recorded print use · borrowed from others",
          )}
          value={`${ownershipOverview?.borrowed_in_consumption_30d ?? 0} g`}
          ownership="borrowed"
        />
        <OwnershipMetricTile
          label={t("statistics.ownedInUse", "Owned assigned")}
          value={(ownershipOverview?.owned_in_use ?? 0).toString()}
          ownership="owned"
        />
        <OwnershipMetricTile
          label={t("statistics.borrowedInInUse", "Borrowed assigned")}
          value={(ownershipOverview?.borrowed_in_in_use ?? 0).toString()}
          ownership="borrowed"
        />
        <OwnershipMetricTile
          label={t("statistics.ownedLowStock", "Owned low stock")}
          value={(ownershipOverview?.owned_low_stock ?? 0).toString()}
          ownership="owned"
          lowStock
        />
        <OwnershipMetricTile
          label={t("statistics.borrowedInLowStock", "Borrowed-in low stock")}
          value={(ownershipOverview?.borrowed_in_low_stock ?? 0).toString()}
          ownership="borrowed"
          lowStock
        />
      </div>
    </div>
  );
}

export function StatisticsPerPrinterUsagePanel({
  loading,
  onOpenConsumption,
  printers,
  resolvedTheme,
  t,
}: {
  loading: boolean;
  onOpenConsumption: (printer: PrinterOverviewRow) => void;
  printers: PrinterOverviewRow[];
  resolvedTheme: ResolvedTheme;
  t: TranslateFn;
}) {
  return (
    <div className="content-section surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-eyebrow">
            {t("statistics.perPrinter", "Per-printer usage")}
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "statistics.perPrinterHint",
              "Open a printer to see filament consumption grouped by material.",
            )}
          </div>
        </div>
        <div className="count-pill">{printers.length}</div>
      </div>
      {loading ? (
        <div className="mt-4 text-sm text-slate-500">
          {t("statistics.loadingPrinter", "Loading printer usage...")}
        </div>
      ) : null}
      {!loading && printers.length === 0 ? (
        <StatisticsEmptyState>
          {t("statistics.noPrinterActivity", "No printer activity available yet.")}
        </StatisticsEmptyState>
      ) : null}
      <div className="mt-4 space-y-3">
        {printers.map((row) => (
          <button
            key={row.printer.id}
            type="button"
            aria-haspopup="dialog"
            className={`block w-full rounded-lg border p-3.5 text-left ${statisticsInteractiveCardClass}`}
            onClick={() => onOpenConsumption(row)}
            style={printerBrandSurfaceStyle(row.printer.model, "compact", resolvedTheme)}
          >
            <span className="flex flex-wrap items-start justify-between gap-4">
              <span className="block min-w-0">
                <span className="block font-semibold text-slate-900 dark:text-slate-50">
                  {row.printer.name}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {row.printer.model}
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
                  {t("statistics.viewDetails", "View details")}
                  <span aria-hidden="true">→</span>
                </span>
              </span>
              <span className="grid w-full grid-cols-3 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[18rem]">
                <SummaryMetricTile
                  label={t("printers.jobs", "Jobs")}
                  value={row.usage.total_jobs.toString()}
                  tone="sky"
                />
                <SummaryMetricTile
                  label={t("printers.used", "Used")}
                  value={`${row.usage.total_used_g} g`}
                  tone="amber"
                />
                <SummaryMetricTile
                  label={t("printers.failed", "Failed")}
                  value={row.usage.failed_jobs.toString()}
                  tone="rose"
                />
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
