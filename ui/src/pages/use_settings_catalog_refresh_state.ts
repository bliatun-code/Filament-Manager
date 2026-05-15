import { useState } from "react";

export function useSettingsCatalogRefreshState() {
  const [catalogRefreshBusy, setCatalogRefreshBusy] = useState(false);

  return {
    catalogRefreshBusy,
    setCatalogRefreshBusy,
  };
}
