import {
  createLibrarySyncHostPrinter,
  createPrinter,
  deleteLibrarySyncHostPrinter,
  deletePrinter,
  type CreatePrinterInput,
} from "./tauri_client";

export type PrinterWriteTarget = {
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};

type PrinterWriteDependencies = {
  createHostPrinter?: typeof createLibrarySyncHostPrinter;
  createLocalPrinter?: typeof createPrinter;
  deleteHostPrinter?: typeof deleteLibrarySyncHostPrinter;
  deleteLocalPrinter?: typeof deletePrinter;
};

function requireClientHostTarget(target: PrinterWriteTarget): {
  baseUrl: string;
  libraryId: string;
} {
  if (!target.clientHostBaseUrl?.trim() || !target.clientLibraryId?.trim()) {
    throw new Error("Host connection details are missing for this printer action.");
  }
  return {
    baseUrl: target.clientHostBaseUrl,
    libraryId: target.clientLibraryId,
  };
}

export async function createManagedPrinter(
  input: CreatePrinterInput,
  target: PrinterWriteTarget = {},
  dependencies: PrinterWriteDependencies = {},
): Promise<void> {
  const createHostPrinter = dependencies.createHostPrinter ?? createLibrarySyncHostPrinter;
  const createLocalPrinter = dependencies.createLocalPrinter ?? createPrinter;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
    await createHostPrinter(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await createLocalPrinter(input);
}

export async function deleteManagedPrinter(
  printerId: string,
  target: PrinterWriteTarget = {},
  dependencies: PrinterWriteDependencies = {},
): Promise<void> {
  const deleteHostPrinter = dependencies.deleteHostPrinter ?? deleteLibrarySyncHostPrinter;
  const deleteLocalPrinter = dependencies.deleteLocalPrinter ?? deletePrinter;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
    await deleteHostPrinter(hostTarget.baseUrl, hostTarget.libraryId, printerId);
    return;
  }

  await deleteLocalPrinter(printerId);
}
