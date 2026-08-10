import {
  createLibrarySyncHostPrinter,
  createPrinter,
  deleteBambuLiveIntegration,
  deleteLibrarySyncHostBambuLiveIntegration,
  deleteLibrarySyncHostPrinter,
  deletePrinter,
  saveBambuLiveIntegration,
  saveLibrarySyncHostBambuLiveIntegration,
  type CreatePrinterInput,
  type SaveBambuLiveIntegrationInput,
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
  deleteHostBambuLiveIntegration?: typeof deleteLibrarySyncHostBambuLiveIntegration;
  deleteLocalBambuLiveIntegration?: typeof deleteBambuLiveIntegration;
  saveHostBambuLiveIntegration?: typeof saveLibrarySyncHostBambuLiveIntegration;
  saveLocalBambuLiveIntegration?: typeof saveBambuLiveIntegration;
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

export async function createManagedPrinterWithBambuLive(
  printer: CreatePrinterInput,
  bambuLive: SaveBambuLiveIntegrationInput | null,
  target: PrinterWriteTarget = {},
  dependencies: PrinterWriteDependencies = {},
): Promise<void> {
  await createManagedPrinter(printer, target, dependencies);
  if (!bambuLive) {
    return;
  }
  try {
    await saveManagedBambuLiveIntegration(bambuLive, target, dependencies);
  } catch (error) {
    try {
      await deleteManagedPrinter(printer.id, target, dependencies);
    } catch (cleanupError) {
      console.error("Failed to roll back printer after Bambu Live setup failed", cleanupError);
    }
    throw error;
  }
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

export async function saveManagedBambuLiveIntegration(
  input: SaveBambuLiveIntegrationInput,
  target: PrinterWriteTarget = {},
  dependencies: PrinterWriteDependencies = {},
): Promise<void> {
  const saveHostBambuLiveIntegration =
    dependencies.saveHostBambuLiveIntegration ?? saveLibrarySyncHostBambuLiveIntegration;
  const saveLocalBambuLiveIntegration = dependencies.saveLocalBambuLiveIntegration ?? saveBambuLiveIntegration;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    await saveHostBambuLiveIntegration(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await saveLocalBambuLiveIntegration(input);
}

export async function deleteManagedBambuLiveIntegration(
  printerId: string,
  target: PrinterWriteTarget = {},
  dependencies: PrinterWriteDependencies = {},
): Promise<void> {
  const deleteHostBambuLiveIntegration =
    dependencies.deleteHostBambuLiveIntegration ?? deleteLibrarySyncHostBambuLiveIntegration;
  const deleteLocalBambuLiveIntegration = dependencies.deleteLocalBambuLiveIntegration ?? deleteBambuLiveIntegration;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    await deleteHostBambuLiveIntegration(hostTarget.baseUrl, hostTarget.libraryId, printerId);
    return;
  }

  await deleteLocalBambuLiveIntegration(printerId);
}
