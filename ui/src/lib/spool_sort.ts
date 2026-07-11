import type { SpoolWithMasterRow } from "./tauri_client";
import { createLocaleCollator } from "../../../src-tauri/companion_browser/locale_format.js";

function spoolSortText(value?: string | null): string {
  return (value ?? "").trim();
}

export function sortSpoolsAlphabetically<Row extends SpoolWithMasterRow>(
  rows: Row[],
  locale?: string,
): Row[] {
  const collator = createLocaleCollator(locale, {
    sensitivity: "base",
    numeric: true,
  });
  return [...rows].sort((left, right) => {
    const comparisons = [
      collator.compare(spoolSortText(left.master.material), spoolSortText(right.master.material)),
      collator.compare(
        spoolSortText(left.master.filament_name),
        spoolSortText(right.master.filament_name),
      ),
      collator.compare(
        spoolSortText(left.master.color_name),
        spoolSortText(right.master.color_name),
      ),
      collator.compare(spoolSortText(left.master.vendor), spoolSortText(right.master.vendor)),
      collator.compare(spoolSortText(left.spool.id), spoolSortText(right.spool.id)),
    ];

    return comparisons.find((result) => result !== 0) ?? 0;
  });
}
