import {
  assignLibrarySyncHostPrinterSlot,
  assignPrinterSlot,
  recordLibrarySyncHostPrintUsage,
  recordPrintUsage,
  updateLibrarySyncHostSpoolWeight,
  updateSpoolWeight,
  type AssignPrinterSlotInput,
} from "./tauri_client";
import type {
  PreparedMeasuredWeightUpdate,
  PreparedPrinterSlotAssignment,
} from "./printer_slot_model";
import { requireClientHostWriteTarget } from "./host_write_target";

export type PrinterSlotWriteTarget = {
  clientReadOnly: boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
};

type PrinterSlotWriteDependencies = {
  assignHostPrinterSlot?: typeof assignLibrarySyncHostPrinterSlot;
  assignLocalPrinterSlot?: typeof assignPrinterSlot;
};

export async function writePrinterSlotAssignment(
  target: PrinterSlotWriteTarget,
  input: AssignPrinterSlotInput,
  dependencies: PrinterSlotWriteDependencies = {},
) {
  const assignHostPrinterSlot =
    dependencies.assignHostPrinterSlot ?? assignLibrarySyncHostPrinterSlot;
  const assignLocalPrinterSlot = dependencies.assignLocalPrinterSlot ?? assignPrinterSlot;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    await assignHostPrinterSlot(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await assignLocalPrinterSlot(input);
}

export async function writePreparedMeasuredWeightUpdate(
  target: PrinterSlotWriteTarget,
  printerId: string,
  spoolId: string,
  preparedWeight: PreparedMeasuredWeightUpdate,
) {
  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    if (preparedWeight.clientAction === "record_usage") {
      await recordLibrarySyncHostPrintUsage(hostTarget.baseUrl, hostTarget.libraryId, {
        printer_id: printerId,
        spool_id: spoolId,
        grams: preparedWeight.usedGrams,
        job_name: null,
        success: true,
      });
      return;
    }
    await updateLibrarySyncHostSpoolWeight(
      hostTarget.baseUrl,
      hostTarget.libraryId,
      spoolId,
      preparedWeight.safeMeasuredTotal,
    );
    return;
  }

  if (preparedWeight.localAction === "record_usage") {
    await recordPrintUsage({
      printer_id: printerId,
      spool_id: spoolId,
      grams: preparedWeight.usedGrams,
      job_name: null,
      success: true,
    });
    return;
  }

  if (preparedWeight.localAction === "update_weight") {
    await updateSpoolWeight(spoolId, preparedWeight.safeMeasuredTotal);
  }
}

export async function writePreparedPrinterSlotAssignment(
  target: PrinterSlotWriteTarget,
  preparedAssignment: PreparedPrinterSlotAssignment,
  dependencies: PrinterSlotWriteDependencies = {},
) {
  await writePrinterSlotAssignment(target, preparedAssignment.assignInput, dependencies);
}

export async function writeSpoolMeasuredWeight(
  target: PrinterSlotWriteTarget,
  spoolId: string,
  grams: number,
) {
  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    await updateLibrarySyncHostSpoolWeight(hostTarget.baseUrl, hostTarget.libraryId, spoolId, grams);
    return;
  }

  await updateSpoolWeight(spoolId, grams);
}
