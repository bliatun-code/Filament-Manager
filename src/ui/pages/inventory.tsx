import React, { useEffect, useMemo, useState } from "react";
import { FilamentCard, FilamentCardData } from "../components/filament_card";
import { WeightInput } from "../components/weight_input";
import {
  isTauri,
  listSpools,
  updateSpoolWeight,
} from "../lib/tauri_client";

const mockSpools: FilamentCardData[] = [
  {
    id: "spool-1",
    material: "PLA",
    filamentName: "PLA Basic",
    colorName: "Jade White",
    hexColor: "#f5f5f5",
    status: "IN_USE",
    remainingGrams: 320,
    location: "AMS 1 - Slot 2",
  },
  {
    id: "spool-2",
    material: "PETG",
    filamentName: "PETG HF",
    colorName: "Obsidian Black",
    hexColor: "#111111",
    status: "IN_STOCK",
    remainingGrams: 860,
    location: "Shelf A2",
  },
  {
    id: "spool-3",
    material: "ABS",
    filamentName: "ABS",
    colorName: "Signal Red",
    hexColor: "#b00020",
    status: "IN_STOCK",
    remainingGrams: 540,
    location: "Shelf B1",
  },
  {
    id: "spool-4",
    material: "PLA",
    filamentName: "PLA Matte",
    colorName: "Mint Green",
    hexColor: "#8bc34a",
    status: "EMPTY",
    remainingGrams: 0,
    location: "Box Return",
  },
];

const statuses = ["ALL", "IN_STOCK", "IN_USE", "EMPTY", "LOST"] as const;

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<(typeof statuses)[number]>("ALL");
  const [selectedSpoolId, setSelectedSpoolId] = useState<string | null>(null);
  const [spools, setSpools] = useState<FilamentCardData[]>(mockSpools);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    setLoading(true);
    listSpools(200, 0)
      .then((rows) => {
        const mapped = rows.map((row) => ({
          id: row.spool.id,
          material: row.master.material,
          filamentName: row.master.filament_name,
          colorName: row.master.color_name,
          hexColor: row.master.hex_color,
          imageUrl: row.master.image_url,
          status: row.spool.status as FilamentCardData["status"],
          remainingGrams: row.spool.remaining_g ?? null,
          location: row.spool.location_id ?? null,
        }));
        setSpools(mapped);
      })
      .catch((error) => console.error(error))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return spools.filter((spool) => {
      const matchesStatus =
        statusFilter === "ALL" ? true : spool.status === statusFilter;
      const haystack = `${spool.filamentName} ${spool.colorName} ${spool.material}`.toLowerCase();
      const matchesSearch = haystack.includes(search.trim().toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter]);

  const selectedSpool = spools.find((spool) => spool.id === selectedSpoolId);

  return (
    <div className="min-h-screen bg-slate-50 px-8 py-10 text-slate-900">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Filament Inventory
          </div>
          <h1 className="mt-2 text-3xl font-semibold">Spools</h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            placeholder="Search by color or material"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm sm:w-72"
          />
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  statusFilter === status
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 border border-slate-200"
                }`}
              >
                {status.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[2.2fr_1fr]">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((spool) => (
            <FilamentCard
              key={spool.id}
              spool={spool}
              onSelect={setSelectedSpoolId}
            />
          ))}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
              {loading ? "Loading spools..." : "No spools match the filters."}
            </div>
          ) : null}
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Selected spool
            </div>
            {selectedSpool ? (
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <div className="text-base font-semibold text-slate-900">
                  {selectedSpool.filamentName} · {selectedSpool.colorName}
                </div>
                <div>Material: {selectedSpool.material}</div>
                <div>Status: {selectedSpool.status.replace("_", " ")}</div>
                <div>Location: {selectedSpool.location ?? "Unassigned"}</div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-500">
                Select a spool to see details.
              </div>
            )}
          </div>
          <WeightInput
            value={selectedSpool?.remainingGrams ?? 0}
            onSubmit={(grams) => {
              if (!selectedSpoolId || !isTauri()) {
                return;
              }
              updateSpoolWeight(selectedSpoolId, grams).catch((error) =>
                console.error(error),
              );
            }}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Actions
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Print QR label
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Assign location
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600"
              >
                Mark as empty
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
