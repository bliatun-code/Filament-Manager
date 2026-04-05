import React from "react";

const recommendations = [
  {
    id: "rec-1",
    material: "PLA",
    color: "Jade White",
    reason: "High usage in last 14 days",
    confidence: "0.82",
  },
  {
    id: "rec-2",
    material: "PETG",
    color: "Obsidian Black",
    reason: "Low stock (under 200g)",
    confidence: "0.76",
  },
  {
    id: "rec-3",
    material: "ABS",
    color: "Signal Red",
    reason: "Project plan for enclosure parts",
    confidence: "0.64",
  },
];

export default function WishlistPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-8 py-10 text-slate-900">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Purchase Planner
        </div>
        <h1 className="mt-2 text-3xl font-semibold">Wishlist</h1>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {recommendations.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">
                {item.material} · {item.color}
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                Confidence {item.confidence}
              </div>
            </div>
            <div className="mt-3 text-sm text-slate-600">{item.reason}</div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Add to cart
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
