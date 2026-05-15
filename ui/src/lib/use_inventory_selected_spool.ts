import { useMemo } from "react";
import type { InventorySpool } from "./inventory_list_model";

export function useInventorySelectedSpool(
  spools: InventorySpool[],
  selectedSpoolId: string | null,
) {
  const spoolsById = useMemo(() => {
    const map = new Map<string, InventorySpool>();
    for (const spool of spools) {
      map.set(spool.id, spool);
    }
    return map;
  }, [spools]);

  return useMemo(
    () => (selectedSpoolId ? spoolsById.get(selectedSpoolId) ?? null : null),
    [selectedSpoolId, spoolsById],
  );
}
