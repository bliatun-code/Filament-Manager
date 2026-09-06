export type CatalogRefreshOperationKind = "AUDIT" | "REFRESH";
export type CatalogRefreshOperationVendor = "Bambu" | "eSUN";

export type CatalogRefreshOperationSnapshot = {
  id: number;
  kind: CatalogRefreshOperationKind;
  message: string;
  phase: string;
  startedAt: number;
  vendor: CatalogRefreshOperationVendor;
};

let nextCatalogRefreshOperationId = 1;
let activeCatalogRefreshOperation: CatalogRefreshOperationSnapshot | null = null;

/**
 * Acquires the renderer-wide catalogue operation lease synchronously. React
 * state is intentionally not the arbiter here: two click handlers can run
 * before a state update renders, and Settings can unmount while Tauri keeps the
 * original request alive.
 */
export function tryBeginCatalogRefreshOperation(
  input: Omit<CatalogRefreshOperationSnapshot, "id" | "startedAt">,
): CatalogRefreshOperationSnapshot | null {
  if (activeCatalogRefreshOperation) {
    return null;
  }
  const operation = {
    ...input,
    id: nextCatalogRefreshOperationId,
    startedAt: Date.now(),
  };
  nextCatalogRefreshOperationId += 1;
  activeCatalogRefreshOperation = operation;
  return operation;
}

export function completeCatalogRefreshOperation(operationId: number): boolean {
  if (activeCatalogRefreshOperation?.id !== operationId) {
    return false;
  }
  activeCatalogRefreshOperation = null;
  return true;
}

export function getActiveCatalogRefreshOperation(): CatalogRefreshOperationSnapshot | null {
  return activeCatalogRefreshOperation;
}

export function updateCatalogRefreshOperation(
  operationId: number,
  update: Partial<Pick<CatalogRefreshOperationSnapshot, "vendor" | "phase" | "startedAt">>,
): void {
  if (activeCatalogRefreshOperation?.id === operationId) {
    activeCatalogRefreshOperation = { ...activeCatalogRefreshOperation, ...update };
  }
}

export function isCatalogRefreshOperationActive(): boolean {
  return activeCatalogRefreshOperation !== null;
}
