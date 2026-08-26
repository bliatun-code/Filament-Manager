import { useEffect, useState } from "react";

import {
  fetchLibrarySyncFilamentStandards,
  getFilamentStandards,
} from "./tauri_client";

export function useDefaultPurchaseCurrency({
  clientHostBaseUrl,
  clientLibraryId,
  clientReadOnly,
  tauriAvailable,
}: {
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientReadOnly: boolean;
  tauriAvailable: boolean;
}) {
  const [currency, setCurrency] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!tauriAvailable) {
      setCurrency("");
      return () => {
        cancelled = true;
      };
    }

    const request = clientReadOnly
      ? clientHostBaseUrl?.trim() && clientLibraryId?.trim()
        ? fetchLibrarySyncFilamentStandards(
            clientHostBaseUrl,
            clientLibraryId,
          )
        : Promise.resolve(null)
      : getFilamentStandards();
    void request
      .then((snapshot) => {
        if (!cancelled) {
          setCurrency(snapshot?.settings.default_purchase_currency ?? "");
        }
      })
      .catch((error) => {
        console.warn(error);
        if (!cancelled) {
          setCurrency("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    clientHostBaseUrl,
    clientLibraryId,
    clientReadOnly,
    tauriAvailable,
  ]);

  return currency;
}
