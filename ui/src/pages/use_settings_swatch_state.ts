import { useState } from "react";

export function useSettingsSwatchState() {
  const [swatchVendorFilter, setSwatchVendorFilter] = useState("ALL");
  const [swatchSearch, setSwatchSearch] = useState("");
  const [swatchBusy, setSwatchBusy] = useState(false);
  const [confirmBulkSwatch, setConfirmBulkSwatch] = useState(false);

  return {
    swatchSearch,
    setSwatchSearch,
    confirmBulkSwatch,
    setConfirmBulkSwatch,
    setSwatchBusy,
    setSwatchVendorFilter,
    swatchBusy,
    swatchVendorFilter,
  };
}
