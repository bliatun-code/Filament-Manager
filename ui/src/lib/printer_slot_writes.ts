import {
  acceptBambuLiveWeightEstimate,
  acceptLibrarySyncHostBambuLiveWeightEstimate,
  assignLibrarySyncHostPrinterSlot,
  assignPrinterSlot,
  recordLibrarySyncHostPrintUsage,
  recordPrintUsage,
  updateLibrarySyncHostSpoolWeight,
  updateSpoolWeight,
  type AssignPrinterSlotInput,
  type AcceptBambuLiveWeightEstimateInput,
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
  acceptHostAmsWeightEstimate?: typeof acceptLibrarySyncHostBambuLiveWeightEstimate;
  acceptLocalAmsWeightEstimate?: typeof acceptBambuLiveWeightEstimate;
  assignHostPrinterSlot?: typeof assignLibrarySyncHostPrinterSlot;
  assignLocalPrinterSlot?: typeof assignPrinterSlot;
  recordHostPrintUsage?: typeof recordLibrarySyncHostPrintUsage;
  recordLocalPrintUsage?: typeof recordPrintUsage;
  updateHostSpoolWeight?: typeof updateLibrarySyncHostSpoolWeight;
  updateLocalSpoolWeight?: typeof updateSpoolWeight;
};

export async function writeAcceptedBambuLiveWeightEstimate(
  target: PrinterSlotWriteTarget,
  input: AcceptBambuLiveWeightEstimateInput,
  dependencies: PrinterSlotWriteDependencies = {},
) {
  const acceptHost =
    dependencies.acceptHostAmsWeightEstimate ?? acceptLibrarySyncHostBambuLiveWeightEstimate;
  const acceptLocal = dependencies.acceptLocalAmsWeightEstimate ?? acceptBambuLiveWeightEstimate;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    await acceptHost(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await acceptLocal(input);
}

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
  dependencies: PrinterSlotWriteDependencies = {},
) {
  const recordHostPrintUsage =
    dependencies.recordHostPrintUsage ?? recordLibrarySyncHostPrintUsage;
  const recordLocalPrintUsage = dependencies.recordLocalPrintUsage ?? recordPrintUsage;
  const updateHostSpoolWeight =
    dependencies.updateHostSpoolWeight ?? updateLibrarySyncHostSpoolWeight;
  const updateLocalSpoolWeight = dependencies.updateLocalSpoolWeight ?? updateSpoolWeight;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this printer action.",
    );
    if (preparedWeight.clientAction === "record_usage") {
      await recordHostPrintUsage(hostTarget.baseUrl, hostTarget.libraryId, {
        printer_id: printerId,
        spool_id: spoolId,
        grams: preparedWeight.usedGrams,
        job_name: null,
        success: true,
      });
      return;
    }
    await updateHostSpoolWeight(
      hostTarget.baseUrl,
      hostTarget.libraryId,
      spoolId,
      preparedWeight.safeMeasuredTotal,
    );
    return;
  }

  if (preparedWeight.localAction === "record_usage") {
    await recordLocalPrintUsage({
      printer_id: printerId,
      spool_id: spoolId,
      grams: preparedWeight.usedGrams,
      job_name: null,
      success: true,
    });
    return;
  }

  if (preparedWeight.localAction === "update_weight") {
    await updateLocalSpoolWeight(spoolId, preparedWeight.safeMeasuredTotal);
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
