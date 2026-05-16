import { useCallback, useState } from "react";

export function useSettingsSwatchDrafts() {
  const [swatchDraftById, setSwatchDraftById] = useState<Record<string, string>>({});

  const updateSwatchDraft = useCallback((masterId: string, value: string) => {
    setSwatchDraftById((previous) => ({
      ...previous,
      [masterId]: value,
    }));
  }, []);

  return {
    setSwatchDraftById,
    swatchDraftById,
    updateSwatchDraft,
  };
}
