import type { Dispatch, SetStateAction } from "react";

type UseSettingsCatalogRefreshStateInput = {
  catalogRefreshBusy: boolean;
  setCatalogRefreshBusy: Dispatch<SetStateAction<boolean>>;
};

export function useSettingsCatalogRefreshState({
  catalogRefreshBusy,
  setCatalogRefreshBusy,
}: UseSettingsCatalogRefreshStateInput) {
  return {
    catalogRefreshBusy,
    setCatalogRefreshBusy,
  };
}
