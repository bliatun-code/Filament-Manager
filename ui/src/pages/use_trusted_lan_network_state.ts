import { useMemo } from "react";
import type {
  TrustedLanCompanionStatus,
  TrustedLanInterfaceOption,
} from "../lib/tauri_client";
import {
  isTrustedLanNetworkDraftDirty,
  resolveTrustedLanInterfaceAddressDraft,
} from "./settings_companion_model";

type UseTrustedLanNetworkStateInput = {
  trustedLanInterfaceAddressDraft: string;
  trustedLanInterfaces: TrustedLanInterfaceOption[];
  trustedLanPortDraft: string;
  trustedLanStatus: TrustedLanCompanionStatus | null;
};

export function useTrustedLanNetworkState({
  trustedLanInterfaceAddressDraft,
  trustedLanInterfaces,
  trustedLanPortDraft,
  trustedLanStatus,
}: UseTrustedLanNetworkStateInput) {
  const trustedLanSelectedInterfaceOption = useMemo(
    () =>
      trustedLanInterfaces.find((value) => value.address === trustedLanInterfaceAddressDraft) ??
      null,
    [trustedLanInterfaceAddressDraft, trustedLanInterfaces],
  );
  const trustedLanHasPrivateInterfaces = trustedLanInterfaces.length > 0;
  const trustedLanNetworkDirty = useMemo(
    () =>
      isTrustedLanNetworkDraftDirty({
        interfaceAddressDraft: trustedLanInterfaceAddressDraft,
        portDraft: trustedLanPortDraft,
        trustedLanStatus,
      }),
    [trustedLanInterfaceAddressDraft, trustedLanPortDraft, trustedLanStatus],
  );

  return {
    trustedLanHasPrivateInterfaces,
    trustedLanNetworkDirty,
    trustedLanSelectedInterfaceOption,
  };
}

export { resolveTrustedLanInterfaceAddressDraft };
