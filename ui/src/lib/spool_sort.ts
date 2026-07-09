import type { SpoolWithMasterRow } from "./tauri_client";

function spoolSortText(value?: string | null): string {
  return (value ?? "").trim();
}

export function sortSpoolsAlphabetically<Row extends SpoolWithMasterRow>(
  rows: Row[],
  locale?: string,
): Row[] {
  return [...rows].sort((left, right) => {
    const comparisons = [
      spoolSortText(left.master.material).localeCompare(
        spoolSortText(right.master.material),
        locale,
        { sensitivity: "base", numeric: true },
      ),
      spoolSortText(left.master.filament_name).localeCompare(
        spoolSortText(right.master.filament_name),
        locale,
        { sensitivity: "base", numeric: true },
      ),
      spoolSortText(left.master.color_name).localeCompare(
        spoolSortText(right.master.color_name),
        locale,
        { sensitivity: "base", numeric: true },
      ),
      spoolSortText(left.master.vendor).localeCompare(
        spoolSortText(right.master.vendor),
        locale,
        { sensitivity: "base", numeric: true },
      ),
      spoolSortText(left.spool.id).localeCompare(spoolSortText(right.spool.id), locale, {
        sensitivity: "base",
        numeric: true,
      }),
    ];

    return comparisons.find((result) => result !== 0) ?? 0;
  });
}
