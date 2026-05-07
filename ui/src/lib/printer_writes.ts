import {
  createLibrarySyncHostPrinter,
  createPrinter,
  deleteLibrarySyncHostPrinter,
  deletePrinter,
  type CreatePrinterInput,
} from "./tauri_client";
import { requireClientHostWriteTarget } from "./host_write_target";

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

export async function createManagedPrinter(
  input: CreatePrinterInput,
  target: PrinterWriteTarget = {},
  dependencies: PrinterWriteDependencies = {},
): Promise<void> {
  const createHostPrinter = dependencies.createHostPrinter ?? createLibrarySyncHostPrinter;
  const createLocalPrinter = dependencies.createLocalPrinter ?? createPrinter;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
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
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    await deleteHostPrinter(hostTarget.baseUrl, hostTarget.libraryId, printerId);
    return;
  }

  await deleteLocalPrinter(printerId);
}
