import { useState } from "react";

export function useSettingsSwatchState() {
  const [swatchVendorFilter, setSwatchVendorFilter] = useState("ALL");
  const [swatchBusy, setSwatchBusy] = useState(false);
  const [confirmBulkSwatch, setConfirmBulkSwatch] = useState(false);

  return {
    confirmBulkSwatch,
    setConfirmBulkSwatch,
    setSwatchBusy,
    setSwatchVendorFilter,
    swatchBusy,
    swatchVendorFilter,
  };
}
