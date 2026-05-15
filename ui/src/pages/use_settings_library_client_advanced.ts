import { useState } from "react";

export function useSettingsLibraryClientAdvanced() {
  const [showLibraryClientAdvanced, setShowLibraryClientAdvanced] = useState(false);

  return {
    setShowLibraryClientAdvanced,
    showLibraryClientAdvanced,
  };
}
