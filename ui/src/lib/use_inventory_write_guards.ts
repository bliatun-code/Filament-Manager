import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { useI18n } from "./i18n";

type InventoryWriteGuardsInput = {
  clientHostBaseUrl: string | null;
  clientHostWritePaired: boolean;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
  t: ReturnType<typeof useI18n>["t"];
};

export function useInventoryWriteGuards({
  clientHostBaseUrl,
  clientHostWritePaired,
  clientLibraryId,
  clientReadOnly,
  setError,
  setInfoMessage,
  t,
}: InventoryWriteGuardsInput) {
  const ensureLocalWriteAllowed = useCallback(() => {
    if (!clientReadOnly) {
      return true;
    }
    setInfoMessage(
      t(
        "inventory.clientReadOnlyAction",
        "This device is connected as a client. Use the host for inventory changes.",
      ),
    );
    return false;
  }, [clientReadOnly, setInfoMessage, t]);

  const canUseClientHostWrite = useCallback(() => {
    if (!clientReadOnly) {
      return false;
    }
    if (!clientHostBaseUrl || !clientLibraryId) {
      setError(
        t(
          "inventory.clientHostUnavailable",
          "Host connection details are missing for this client device.",
        ),
      );
      return false;
    }
    if (!clientHostWritePaired) {
      setError(
        t(
          "inventory.clientWriteRequiresPairing",
          "Pair this desktop client with the host before running protected sync actions.",
        ),
      );
      return false;
    }
    return true;
  }, [
    clientHostBaseUrl,
    clientHostWritePaired,
    clientLibraryId,
    clientReadOnly,
    setError,
    t,
  ]);

  return {
    canUseClientHostWrite,
    ensureLocalWriteAllowed,
  };
}
