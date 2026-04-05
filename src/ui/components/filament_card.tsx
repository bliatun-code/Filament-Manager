import React from "react";

export type FilamentCardData = {
  id: string;
  material: string;
  filamentName: string;
  colorName: string;
  hexColor?: string | null;
  imageUrl?: string | null;
  status: "IN_STOCK" | "IN_USE" | "EMPTY" | "LOST";
  remainingGrams?: number | null;
  location?: string | null;
};

type FilamentCardProps = {
  spool: FilamentCardData;
  onSelect?: (spoolId: string) => void;
};

function formatRemaining(remainingGrams?: number | null): string {
  if (remainingGrams == null) {
    return "Unknown";
  }
  if (remainingGrams <= 0) {
    return "Empty";
  }
  return `${remainingGrams} g`;
}

function statusBadge(status: FilamentCardData["status"]): string {
  switch (status) {
    case "IN_USE":
      return "bg-emerald-100 text-emerald-700";
    case "IN_STOCK":
      return "bg-sky-100 text-sky-700";
    case "EMPTY":
      return "bg-slate-200 text-slate-700";
    case "LOST":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function FilamentCard({ spool, onSelect }: FilamentCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(spool.id)}
      className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {spool.imageUrl ? (
          <img
            src={spool.imageUrl}
            alt={spool.colorName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ backgroundColor: spool.hexColor ?? "#cbd5f5" }}
          />
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {spool.filamentName}
            </div>
            <div className="text-xs text-slate-500">
              {spool.colorName} · {spool.material}
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(
              spool.status,
            )}`}
          >
            {spool.status.replace("_", " ")}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Remaining</span>
          <span className="font-medium text-slate-700">
            {formatRemaining(spool.remainingGrams)}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Location</span>
          <span className="font-medium text-slate-700">
            {spool.location ?? "Unassigned"}
          </span>
        </div>
      </div>
    </button>
  );
}
