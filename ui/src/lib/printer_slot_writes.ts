import {
  assignLibrarySyncHostPrinterSlot,
  assignPrinterSlot,
  recordLibrarySyncHostPrintUsage,
  recordPrintUsage,
  updateLibrarySyncHostSpoolWeight,
  updateSpoolWeight,
} from "./tauri_client";
import type {
  PreparedMeasuredWeightUpdate,
  PreparedPrinterSlotAssignment,
} from "./printer_slot_model";

export type PrinterSlotWriteTarget = {
  clientReadOnly: boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
};

function requireClientHostTarget(target: PrinterSlotWriteTarget) {
  if (!target.clientHostBaseUrl || !target.clientLibraryId) {
    throw new Error("Host connection details are missing for this printer action.");
  }
  return {
    baseUrl: target.clientHostBaseUrl,
    libraryId: target.clientLibraryId,
  };
}

export async function writePreparedMeasuredWeightUpdate(
  target: PrinterSlotWriteTarget,
  printerId: string,
  spoolId: string,
  preparedWeight: PreparedMeasuredWeightUpdate,
) {
  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
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
) {
  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
    await assignLibrarySyncHostPrinterSlot(
      hostTarget.baseUrl,
      hostTarget.libraryId,
      preparedAssignment.assignInput,
    );
    return;
  }

  await assignPrinterSlot(preparedAssignment.assignInput);
}

export async function writeSpoolMeasuredWeight(
  target: PrinterSlotWriteTarget,
  spoolId: string,
  grams: number,
) {
  if (target.clientReadOnly) {
    const hostTarget = requireClientHostTarget(target);
    await updateLibrarySyncHostSpoolWeight(hostTarget.baseUrl, hostTarget.libraryId, spoolId, grams);
    return;
  }

  await updateSpoolWeight(spoolId, grams);
}
