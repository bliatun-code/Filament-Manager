import { useCallback, useEffect } from "react";
import { useSettingsAutoClearValue } from "./use_settings_auto_clear";

type UseSettingsSwatchConfirmInput = {
  confirmBulkSwatch: boolean;
  setConfirmBulkSwatch: (confirmed: boolean) => void;
  swatchVendorFilter: string;
  visibleMissingSwatchCount: number;
};

export function useSettingsSwatchConfirm({
  confirmBulkSwatch,
  setConfirmBulkSwatch,
  swatchVendorFilter,
  visibleMissingSwatchCount,
}: UseSettingsSwatchConfirmInput) {
  const clearConfirmBulkSwatch = useCallback(() => {
    setConfirmBulkSwatch(false);
  }, [setConfirmBulkSwatch]);

  useSettingsAutoClearValue(confirmBulkSwatch, clearConfirmBulkSwatch, 7000);

  useEffect(() => {
    clearConfirmBulkSwatch();
  }, [clearConfirmBulkSwatch, swatchVendorFilter, visibleMissingSwatchCount]);

  return { clearConfirmBulkSwatch };
}
