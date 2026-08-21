import { selectableInventoryLocations } from "../lib/inventory_location_data_source";
import type { InventoryLocationRow } from "../lib/tauri_location_client";

export const INVENTORY_LOCATION_DATALIST_ID = "inventory-location-options";

export function InventoryLocationDatalist({ rows }: { rows: InventoryLocationRow[] }) {
  return (
    <datalist id={INVENTORY_LOCATION_DATALIST_ID}>
      {selectableInventoryLocations(rows).map((row) => (
        <option key={row.id} value={row.name} />
      ))}
    </datalist>
  );
}
