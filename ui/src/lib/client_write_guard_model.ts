import { resolveClientHostTarget, type ClientHostTargetInput } from "./host_write_target";

export type ClientWriteGuardMessageKey =
  | "clientHostUnavailable"
  | "clientReadOnlyAction"
  | "clientWriteRequiresPairing";

export type ClientWriteGuardResult = {
  allowed: boolean;
  messageKey: ClientWriteGuardMessageKey | null;
};

export function resolveLocalWriteGuard(clientReadOnly: boolean): ClientWriteGuardResult {
  return clientReadOnly
    ? { allowed: false, messageKey: "clientReadOnlyAction" }
    : { allowed: true, messageKey: null };
}

export function resolveClientHostWriteGuard(
  input: ClientHostTargetInput & {
    clientHostWritePaired: boolean;
    clientReadOnly: boolean;
  },
): ClientWriteGuardResult {
  if (!input.clientReadOnly) {
    return { allowed: false, messageKey: null };
  }

  if (!resolveClientHostTarget(input)) {
    return { allowed: false, messageKey: "clientHostUnavailable" };
  }

  if (!input.clientHostWritePaired) {
    return { allowed: false, messageKey: "clientWriteRequiresPairing" };
  }

  return { allowed: true, messageKey: null };
}
