import React from "react";
import { StatCard, UsageChart } from "../components/dashboard_widgets";

const stats = [
  {
    title: "Total Consumption",
    value: "9.4 kg",
    subtitle: "Last 90 days",
    trend: "+12% vs last quarter",
    accent: "amber" as const,
  },
  {
    title: "Avg Job Weight",
    value: "320 g",
    subtitle: "Across 48 jobs",
    trend: "+4 g",
    accent: "sky" as const,
  },
  {
    title: "AMS Utilization",
    value: "78%",
    subtitle: "Active slots",
    trend: "4/5 printers online",
    accent: "emerald" as const,
  },
  {
    title: "Failed Prints",
    value: "2.1%",
    subtitle: "Last 30 days",
    trend: "-0.4%",
    accent: "rose" as const,
  },
];

export default function StatisticsPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-8 py-10 text-slate-900">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Analytics
        </div>
        <h1 className="mt-2 text-3xl font-semibold">Statistics</h1>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <UsageChart
          title="Material Consumption"
          value="4.2 kg"
          caption="PLA dominates usage with PETG rising."
        />
        <UsageChart
          title="Printer Throughput"
          value="128 hrs"
          caption="Total print time last 30 days."
        />
      </div>
    </div>
  );
}
