import { useEffect, useMemo, useState } from "react";
import type { LibraryReadTarget } from "./tauri_library_sync_client";
import { getDefaultPurchaseCurrency } from "./tauri_filament_standards_client";

export function useDefaultPurchaseCurrency({
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  clientTargetGeneration,
  tauriAvailable,
}: {
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientReadOnly: boolean;
  clientTargetGeneration?: number | null;
  tauriAvailable: boolean;
}) {
  const target = useMemo<LibraryReadTarget | null>(() => {
    const libraryId = clientLibraryId?.trim();
    const baseUrl = clientReadOnly ? clientHostBaseUrl?.trim() : null;
    if (!tauriAvailable || !libraryId || clientTargetGeneration == null || (clientReadOnly && !baseUrl)) {
      return null;
    }
    return {
      base_url: baseUrl ?? null,
      expected_library_id: libraryId,
      target_generation: clientTargetGeneration,
    };
  }, [clientHostBaseUrl, clientLibraryId, clientReadOnly, clientTargetGeneration, tauriAvailable]);

  const [resolved, setResolved] = useState<{ target: LibraryReadTarget; currency: string } | null>(null);
  useEffect(() => {
    if (!target) return;
    let current = true;
    // The initial StrictMode effect can be disposed before the read starts.
    void Promise.resolve().then(async () => {
      if (!current) return;
      const currency = await getDefaultPurchaseCurrency(target).catch(() => null);
      if (current) setResolved({ target, currency: currency ?? "" });
    });
    return () => { current = false; };
  }, [target]);

  // Invalidate during render, before a price input can consume another
  // library's default (including a return to the same host address).
  return resolved && resolved.target === target ? resolved.currency : "";
}
