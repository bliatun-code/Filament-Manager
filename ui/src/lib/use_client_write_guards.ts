import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  resolveClientHostWriteGuard,
  resolveLocalWriteGuard,
} from "./client_write_guard_model";

type ClientWriteGuardCopy = {
  clientReadOnlyAction: string;
  clientHostUnavailable: string;
  clientWriteRequiresPairing: string;
};

type ClientWriteGuardsInput = {
  clientHostBaseUrl: string | null;
  clientHostWritePaired: boolean;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
  copy: ClientWriteGuardCopy;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfoMessage: Dispatch<SetStateAction<string | null>>;
};

export function useClientWriteGuards({
  clientHostBaseUrl,
  clientHostWritePaired,
  clientLibraryId,
  clientReadOnly,
  copy,
  setError,
  setInfoMessage,
}: ClientWriteGuardsInput) {
  const ensureLocalWriteAllowed = useCallback(() => {
    const result = resolveLocalWriteGuard(clientReadOnly);
    if (result.messageKey === "clientReadOnlyAction") {
      setInfoMessage(copy.clientReadOnlyAction);
    }
    return result.allowed;
  }, [clientReadOnly, copy.clientReadOnlyAction, setInfoMessage]);

  const canUseClientHostWrite = useCallback(() => {
    const result = resolveClientHostWriteGuard({
      clientHostBaseUrl,
      clientHostWritePaired,
      clientLibraryId,
      clientReadOnly,
    });
    if (result.messageKey === "clientHostUnavailable") {
      setError(copy.clientHostUnavailable);
    } else if (result.messageKey === "clientWriteRequiresPairing") {
      setError(copy.clientWriteRequiresPairing);
    }
    return result.allowed;
  }, [
    clientHostBaseUrl,
    clientHostWritePaired,
    clientLibraryId,
    clientReadOnly,
    copy.clientHostUnavailable,
    copy.clientWriteRequiresPairing,
    setError,
  ]);

  return {
    canUseClientHostWrite,
    ensureLocalWriteAllowed,
  };
}
