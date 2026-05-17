import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import type { TranslateFn } from "../lib/statistics_model";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { InventoryOverview, PrinterOverviewRow } from "../lib/tauri_client";
import { StatisticsEmptyState, SummaryMetricTile } from "./statistics_primitives";

export function StatisticsOwnershipSnapshotPanel({
  ownershipOverview,
  t,
}: {
  ownershipOverview: InventoryOverview | null;
  t: TranslateFn;
}) {
  return (
    <div className="content-section surface-card">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="section-eyebrow">
            {t("statistics.ownershipSnapshot", "Ownership snapshot")}
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "statistics.ownershipSnapshotHint",
              "Additive ownership split for on-hand stock and recent print usage. The headline cards above still show the combined totals.",
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricTile
          key={`owned-on-hand-${ownershipOverview?.total_owned_spools ?? 0}`}
          label={t("statistics.ownedOnHand", "Owned on hand")}
          value={(ownershipOverview?.total_owned_spools ?? 0).toString()}
          tone="sky"
        />
        <SummaryMetricTile
          key={`borrowed-on-hand-${ownershipOverview?.total_borrowed_in_spools ?? 0}`}
          label={t("statistics.borrowedInOnHand", "Borrowed in on hand")}
          value={(ownershipOverview?.total_borrowed_in_spools ?? 0).toString()}
          tone="amber"
        />
        <SummaryMetricTile
          key={`owned-consumption-${ownershipOverview?.owned_consumption_30d ?? 0}`}
          label={t("statistics.ownedPrintUsage30d", "Owned print use (30d)")}
          value={`${ownershipOverview?.owned_consumption_30d ?? 0} g`}
          tone="emerald"
        />
        <SummaryMetricTile
          key={`borrowed-consumption-${ownershipOverview?.borrowed_in_consumption_30d ?? 0}`}
          label={t("statistics.borrowedInPrintUsage30d", "Borrowed-in print use (30d)")}
          value={`${ownershipOverview?.borrowed_in_consumption_30d ?? 0} g`}
          tone="amber"
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricTile
          label={t("statistics.ownedInUse", "Owned assigned")}
          value={(ownershipOverview?.owned_in_use ?? 0).toString()}
          tone="sky"
        />
        <SummaryMetricTile
          label={t("statistics.borrowedInInUse", "Borrowed assigned")}
          value={(ownershipOverview?.borrowed_in_in_use ?? 0).toString()}
          tone="amber"
        />
        <SummaryMetricTile
          label={t("statistics.ownedLowStock", "Owned low stock")}
          value={(ownershipOverview?.owned_low_stock ?? 0).toString()}
          tone="rose"
        />
        <SummaryMetricTile
          label={t("statistics.borrowedInLowStock", "Borrowed-in low stock")}
          value={(ownershipOverview?.borrowed_in_low_stock ?? 0).toString()}
          tone="rose"
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
          <div
            key={row.printer.id}
            className="cursor-pointer rounded-lg border p-3.5 text-sm transition hover:-translate-y-0.5"
            role="button"
            tabIndex={0}
            onClick={() => onOpenConsumption(row)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenConsumption(row);
              }
            }}
            style={printerBrandSurfaceStyle(row.printer.model, "compact", resolvedTheme)}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-slate-50">
                  {row.printer.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {row.printer.model}
                </div>
              </div>
              <div className="grid w-full grid-cols-3 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[18rem]">
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
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
