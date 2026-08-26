import type {
  InventoryBulkMutationCommand,
  InventoryBulkMutationReceipt,
} from "./inventory_bulk_actions_model";
import {
  executeInventoryBulkMutation,
  executeLibrarySyncHostInventoryBulkMutation,
} from "./tauri_inventory_client";

export type InventoryBulkMutationRoutingErrorCode =
  | "HOST_TARGET_REQUIRED"
  | "PAIRING_REQUIRED";

export class InventoryBulkMutationRoutingError extends Error {
  readonly code: InventoryBulkMutationRoutingErrorCode;

  constructor(code: InventoryBulkMutationRoutingErrorCode) {
    super(code);
    this.name = "InventoryBulkMutationRoutingError";
    this.code = code;
  }
}

export type InventoryBulkMutationContext = Readonly<{
  clientHostBaseUrl: string | null;
  clientHostWritePaired: boolean;
  clientLibraryId: string | null;
  clientReadOnly: boolean;
}>;

type InventoryBulkMutationDependencies = Readonly<{
  executeHost?: typeof executeLibrarySyncHostInventoryBulkMutation;
  executeLocal?: typeof executeInventoryBulkMutation;
}>;

function normalizedText(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export async function executeInventoryBulkMutationForInventory(
  context: InventoryBulkMutationContext,
  command: InventoryBulkMutationCommand,
  dependencies: InventoryBulkMutationDependencies = {},
): Promise<InventoryBulkMutationReceipt> {
  const executeLocal = dependencies.executeLocal ?? executeInventoryBulkMutation;
  const executeHost =
    dependencies.executeHost ?? executeLibrarySyncHostInventoryBulkMutation;

  if (!context.clientReadOnly) {
    return executeLocal(command);
  }
  if (!context.clientHostWritePaired) {
    throw new InventoryBulkMutationRoutingError("PAIRING_REQUIRED");
  }
  const baseUrl = normalizedText(context.clientHostBaseUrl);
  const libraryId = normalizedText(context.clientLibraryId);
  if (!baseUrl || !libraryId) {
    throw new InventoryBulkMutationRoutingError("HOST_TARGET_REQUIRED");
  }

  // A client issues exactly one protected Host command. Rejection is surfaced
  // to the caller; there is deliberately no local or sequential fallback.
  return executeHost(baseUrl, libraryId, command);
}
