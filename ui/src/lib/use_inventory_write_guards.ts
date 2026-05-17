import type { Dispatch, SetStateAction } from "react";
import type { useI18n } from "./i18n";
import { useClientWriteGuards } from "./use_client_write_guards";

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
  return useClientWriteGuards({
    clientHostBaseUrl,
    clientHostWritePaired,
    clientLibraryId,
    clientReadOnly,
    copy: {
      clientReadOnlyAction: t(
        "inventory.clientReadOnlyAction",
        "This device is connected as a client. Use the host for inventory changes.",
      ),
      clientHostUnavailable: t(
        "inventory.clientHostUnavailable",
        "Host connection details are missing for this client device.",
      ),
      clientWriteRequiresPairing: t(
        "inventory.clientWriteRequiresPairing",
        "Pair this desktop client with the host before running protected sync actions.",
      ),
    },
    setError,
    setInfoMessage,
  });
}
