import { useCallback, type Dispatch, type SetStateAction } from "react";
import type {
  TrustedLanCompanionStatus,
  TrustedLanInterfaceOption,
} from "../lib/tauri_client";
import { resolveTrustedLanInterfaceAddressDraft } from "./use_trusted_lan_network_state";

type UseTrustedLanDraftSyncInput = {
  setTrustedLanEnabledDraft: Dispatch<SetStateAction<boolean>>;
  setTrustedLanInterfaceAddressDraft: Dispatch<SetStateAction<string>>;
  setTrustedLanPortDraft: Dispatch<SetStateAction<string>>;
};

export function useTrustedLanDraftSync({
  setTrustedLanEnabledDraft,
  setTrustedLanInterfaceAddressDraft,
  setTrustedLanPortDraft,
}: UseTrustedLanDraftSyncInput) {
  return useCallback(
    (
      status: TrustedLanCompanionStatus | null,
      interfaces: TrustedLanInterfaceOption[] = [],
    ) => {
      setTrustedLanEnabledDraft(Boolean(status?.enabled));
      setTrustedLanPortDraft(String(status?.listen_port ?? 4278));
      setTrustedLanInterfaceAddressDraft(
        resolveTrustedLanInterfaceAddressDraft(status, interfaces),
      );
    },
    [
      setTrustedLanEnabledDraft,
      setTrustedLanInterfaceAddressDraft,
      setTrustedLanPortDraft,
    ],
  );
}
