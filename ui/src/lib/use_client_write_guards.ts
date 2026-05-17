import { useCallback, type Dispatch, type SetStateAction } from "react";

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
    if (!clientReadOnly) {
      return true;
    }
    setInfoMessage(copy.clientReadOnlyAction);
    return false;
  }, [clientReadOnly, copy.clientReadOnlyAction, setInfoMessage]);

  const canUseClientHostWrite = useCallback(() => {
    if (!clientReadOnly) {
      return false;
    }
    if (!clientHostBaseUrl || !clientLibraryId) {
      setError(copy.clientHostUnavailable);
      return false;
    }
    if (!clientHostWritePaired) {
      setError(copy.clientWriteRequiresPairing);
      return false;
    }
    return true;
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
