import React, { useEffect, useState } from "react";
import {
  ActivityTimeline,
  BadgePanel,
  LowStockList,
  StatCard,
  UsageChart,
} from "../components/dashboard_widgets";
import { ThemeToggle } from "../components/theme_toggle";
import {
  exportInventoryCsv,
  exportInventoryJson,
  inventoryOverview,
  isTauri,
} from "../lib/tauri_client";

const defaultStats = [
  {
    title: "Total Spools",
    value: "0",
    subtitle: "Across all locations",
    trend: "—",
    accent: "sky" as const,
  },
  {
    title: "Active Printers",
    value: "0",
    subtitle: "AMS online",
    trend: "—",
    accent: "emerald" as const,
  },
  {
    title: "Low Stock",
    value: "0",
    subtitle: "Below 20%",
    trend: "—",
    accent: "rose" as const,
  },
  {
    title: "Monthly Usage",
    value: "0 g",
    subtitle: "Last 30 days",
    trend: "—",
    accent: "amber" as const,
  },
];

const lowStockItems = [
  {
    id: "1",
    name: "PLA Basic",
    color: "Jade White",
    remaining: "120 g",
  },
  {
    id: "2",
    name: "PETG HF",
    color: "Obsidian Black",
    remaining: "180 g",
  },
  {
    id: "3",
    name: "ABS",
    color: "Signal Red",
    remaining: "210 g",
  },
];

const activity = [
  "AMS Slot 2 updated to PLA Basic - Blue.",
  "Weight plate synced 3 new readings.",
  "Scraper refreshed 42 Bambu colors.",
  "Printer X1C finished job: Housing v14.",
];

const badges = [
  {
    id: "badge-1",
    title: "Inventory Steward",
    description: "Keep 100% of spools assigned a location.",
    progress: 0.72,
  },
  {
    id: "badge-2",
    title: "Waste Slayer",
    description: "Track 30 consecutive weight updates.",
    progress: 0.45,
  },
  {
    id: "badge-3",
    title: "AMS Master",
    description: "Run 20 multi-color prints.",
    progress: 0.3,
  },
];

export default function DashboardPage() {
  const [stats, setStats] = useState(defaultStats);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    inventoryOverview()
      .then((overview) => {
        setStats([
          {
            title: "Total Spools",
            value: overview.total_spools.toString(),
            subtitle: "Across all locations",
            trend: `${overview.in_use} in use`,
            accent: "sky" as const,
          },
          {
            title: "Active Printers",
            value: "3",
            subtitle: "AMS online",
            trend: "2 printing",
            accent: "emerald" as const,
          },
          {
            title: "Low Stock",
            value: overview.low_stock.toString(),
            subtitle: "Below 200g",
            trend: "Auto alerts enabled",
            accent: "rose" as const,
          },
          {
            title: "Monthly Usage",
            value: `${overview.total_consumption_30d} g`,
            subtitle: "Last 30 days",
            trend: "—",
            accent: "amber" as const,
          },
        ]);
      })
      .catch((error) => console.error(error));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-8 py-10 text-slate-900">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Inventory Control Center
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Filament Manager
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
            Synced 3 minutes ago
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <UsageChart
          title="Filament Consumption"
          value="4200 g"
          caption="Last 12 jobs across 3 printers."
        />
        <LowStockList items={lowStockItems} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <ActivityTimeline items={activity} />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Inventory Health
          </div>
          <div className="mt-4 flex items-center gap-6">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-2xl font-semibold text-emerald-700">
              92%
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Stable supply
              </div>
              <div className="text-xs text-slate-500">
                14 days until next restock cycle.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        <BadgePanel badges={badges} />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Backup
          </div>
          <div className="mt-4 text-sm text-slate-600">
            Export inventory snapshots to JSON or CSV for archival.
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={() =>
                exportInventoryCsv()
                  .then((payload) => {
                    navigator.clipboard.writeText(payload.content);
                  })
                  .catch((error) => console.error(error))
              }
            >
              Export CSV
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={() =>
                exportInventoryJson()
                  .then((payload) => {
                    navigator.clipboard.writeText(payload.content);
                  })
                  .catch((error) => console.error(error))
              }
            >
              Export JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
